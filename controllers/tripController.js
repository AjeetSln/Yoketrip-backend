const Trip = require('../models/Trip');
const cloudinary = require('../config/cloudinary');
const User = require('../models/User');
const KYC = require('../models/kycModel');
const mongoose = require('mongoose');
const DeletedTrip = require('../models/deleteTrip');
const calculateDurationInDays = (startDateTime, endDateTime) => {
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  const durationInMs = end - start;
  const days = Math.ceil(durationInMs / (1000 * 60 * 60 * 24));
  return days;
};


exports.createTrip = async (req, res) => {
  try {
    // Start timing the request
    const startTime = process.hrtime();

    // Parallel processing: Start file uploads while processing other data
    const uploadPromises = (req.files || []).map(file =>
      cloudinary.uploader.upload(file.path, { folder: "trip_images" })
    );


    // Destructure request body in one operation
    const {
      name, budget, category, travelType, description, activities, people,
      inclusions, exclusions, startLocation, startDateTime, startTransport,
      startDesc, endLocation, endDateTime, endTransport, endDesc, stops
    } = req.body;

    // Fast validation
    if (!name || !budget || !category || !travelType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Parallel user lookup and file uploads
    const [user, ...uploadResults] = await Promise.all([
      User.findById(req.user).lean(),
      ...uploadPromises
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Optimized stops parsing
    let parsedStops = [];
    if (stops) {
      try {
        parsedStops = JSON.parse(stops);
      } catch (e) {
        console.error("Stops parse error:", e);
        return res.status(400).json({
          success: false,
          message: 'Invalid stops format'
        });
      }
    }

    // Prepare image URLs from upload results
    const imageUrls = uploadResults.map(upload => upload.secure_url);

    // Create trip document
    const trip = new Trip({
      user: req.user._id,
      tripName: name,
      budget,
      category,
      travellerType: travelType,
      description,
      activities,
      totalPeople: people,
      inclusions: inclusions ? inclusions.split(',') : [],
      exclusions: exclusions ? exclusions.split(',') : [],
      start: {
        location: startLocation,
        dateTime: startDateTime,
        transport: startTransport,
        description: startDesc
      },
      end: {
        location: endLocation,
        dateTime: endDateTime,
        transport: endTransport,
        description: endDesc
      },
      stops: parsedStops,
      images: imageUrls,
    });

    // Save trip without waiting for full acknowledgement
    await trip.save({ w: 1 });

    // Calculate processing time
    const hrtime = process.hrtime(startTime);
    const processingTime = (hrtime[0] * 1000 + hrtime[1] / 1e6).toFixed(2);

    console.log(`Trip created in ${processingTime}ms`);

    res.status(200).json({
      success: true,
      trip,
      processingTime: `${processingTime}ms`
    });
  } catch (error) {
    console.error('Trip creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
exports.getAllTrips = async (req, res) => {
  try {
    const currentDate = new Date();
    
    const trips = await Trip.find({
      'end.dateTime': { $gt: currentDate.toISOString() }
    })
    .sort({ createdAt: -1 })
    .populate('user', 'full_name profilePic')
    .lean();

    const filteredTrips = trips.map(trip => ({
      id: trip._id,
      tripName: trip.tripName,
      userid: trip.user?._id,
      full_name: trip.user?.full_name || 'Unknown',
      profilePic: trip.user?.profilePic || '',
      budget: trip.budget,
      category: trip.category,
      travellerType: trip.tripType,  // Changed from travellerType to tripType
      description: trip.description,
      activities: trip.activities,
      totalPeople: trip.totalPeople,
      inclusions: trip.inclusions,
      exclusions: trip.exclusions,
      start: trip.start,
      end: trip.end,
      stops: trip.stops,
      images: trip.images || [],
      createdAt: trip.createdAt,
      itinerary: trip.itinerary || [],
      duration: `${calculateDurationInDays(trip.start.dateTime, trip.end.dateTime)} Days`,
      firstImage: trip.images?.[0] || null  // Added firstImage for easier access
    }));

    res.json(filteredTrips);
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(500).json({ message: 'Error fetching trips', error: err });
  }
};
// Add this new endpoint to your tripController.js
exports.getTrendingTrips = async (req, res) => {
  try {
    const trips = await Trip.aggregate([
      {
        $addFields: {
          popularityScore: {
            $add: [
              "$views",
              { $multiply: [{ $size: "$likes" }, 2] }
            ]
          }
        }
      },
      { $sort: { popularityScore: -1 } },
      { $limit: 4 },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      {
        $project: {
          id: "$_id",
          tripName: 1,
          userid: "$user._id",
          full_name: "$user.full_name",
          profilePic: "$user.profilePic",
          budget: 1,
          category: 1,
          travellerType: 1,
          description: 1,
          activities: 1,
          totalPeople: 1,
          inclusions: 1,
          exclusions: 1,
          start: 1,
          end: 1,
          stops: 1,
          images: 1,
          createdAt: 1,
          itinerary: 1,
          duration: {
            $concat: [
              {
                $toString: {
                  $ceil: {
                    $divide: [
                      {
                        $subtract: [
                          { $toDate: "$end.dateTime" },
                          { $toDate: "$start.dateTime" }
                        ]
                      },
                      86400000
                    ]
                  }
                }
              },
              " Days"
            ]
          },
          views: 1,
          likes: { $size: "$likes" },
          popularityScore: 1
        }
      }
    ]);

    res.json(trips);
  } catch (err) {
    console.error("Error fetching trending trips:", err);
    res.status(500).json({ message: 'Error fetching trending trips', error: err });
  }
};

exports.addTripView = async (req, res) => {
  try {
    const tripId = req.params.id;

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    trip.views += 1;
    await trip.save();

    res.status(200).json({ views: trip.views }); // return updated views
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};


exports.toggleLikeTrip = async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.id;

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Ensure likes is always an array
    if (!Array.isArray(trip.likes)) {
      trip.likes = [];
    }

    // Convert userId to ObjectId (with `new` keyword)
    const userObjectId = new mongoose.Types.ObjectId(userId);  // Correct usage with `new`
    const alreadyLiked = trip.likes.some(like => like.equals(userObjectId));  // Use `.equals` for comparison

    if (alreadyLiked) {
      // Remove the user's ID if they have already liked the trip
      trip.likes = trip.likes.filter(id => !id.equals(userObjectId));
    } else {
      // Add the user's ID if they haven't liked the trip yet
      trip.likes.push(userObjectId);
    }

    await trip.save();

    res.status(200).json({
      liked: !alreadyLiked,
      likes: trip.likes.length
    });
  } catch (err) {
    console.error("Like Error:", err);
    res.status(500).json({ message: 'Failed to like/unlike trip', error: err.message });
  }
};


exports.isTripLiked = async (req, res) => {
  try {
    const tripId = req.params.id;  // Extract the tripId from request parameters
    const userId = req.user.id;    // Get the user's ID from the authenticated user

    // Find the trip by its ID
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ liked: false });  // Return false if trip not found
    }

    // Convert userId to ObjectId for comparison (with `new` keyword)
    const userObjectId = new mongoose.Types.ObjectId(userId);  // Convert to ObjectId

    // Check if the user has liked the trip
    const liked = trip.likes.some(like => like.equals(userObjectId));  // Use `.equals` for comparison

    res.status(200).json({ liked }); // Return the like status (true or false)
  } catch (err) {
    res.status(500).json({ message: 'Error checking like status', error: err.message });
  }
};
exports.getownTrips = async (req, res) => {
  try {
    const userId = req.user.id;
    const trips = await Trip.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', 'full_name profilePic') // 👈 important
      .lean();

    const filteredTrips = trips.map(trip => ({
      id: trip._id,
      tripName: trip.tripName,
      full_name: trip.user?.full_name || 'Unknown',
      profilePic: trip.user?.profilePic || '',
      budget: trip.budget,
      category: trip.category,
      travellerType: trip.travellerType,
      description: trip.description,
      activities: trip.activities,
      totalPeople: trip.totalPeople,
      inclusions: trip.inclusions,
      exclusions: trip.exclusions,
      start: trip.start,
      end: trip.end,
      stops: trip.stops,
      images: trip.images || [],
      createdAt: trip.createdAt,
      itinerary: trip.itinerary || [],
      duration: `${calculateDurationInDays(trip.start.dateTime, trip.end.dateTime)} Days`
    }));

    res.json(filteredTrips);
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(500).json({ message: 'Error fetching trips', error: err });
  }
};
exports.deleteTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    // 1. Find the trip to be deleted
    const trip = await Trip.findOne({ _id: tripId, user: userId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found or not authorized to delete'
      });
    }

    // 2. Create a copy in DeletedTrips collection
    const deletedTrip = new DeletedTrip({
      originalId: trip._id,
      ...trip.toObject(), // Copy all fields
    });
    await deletedTrip.save();

    // 3. Remove from original trips collection
    await Trip.deleteOne({ _id: tripId });

    res.json({
      success: true,
      message: 'Trip moved to deleted trips successfully',
      deletedTripId: deletedTrip._id
    });
  } catch (err) {
    console.error("Error deleting trip:", err);
    res.status(500).json({
      success: false,
      message: 'Error deleting trip',
      error: err.message
    });
  }
};
exports.editTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    // Verify the trip belongs to the user
    const trip = await Trip.findOne({ _id: tripId, user: userId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found or not authorized to edit'
      });
    }

    // Remove fields that shouldn't be updated
    const { full_name, profilePic, images, ...allowedUpdates } = updateData;

    // Convert date strings to Date objects if they exist
    if (allowedUpdates.start?.dateTime) {
      allowedUpdates.start.dateTime = new Date(allowedUpdates.start.dateTime);
    }
    if (allowedUpdates.end?.dateTime) {
      allowedUpdates.end.dateTime = new Date(allowedUpdates.end.dateTime);
    }

    // Update the trip
    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    ).populate('user', 'full_name profilePic');

    if (!updatedTrip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found after update attempt'
      });
    }

    // Format the response
    const responseTrip = {
      id: updatedTrip._id,
      tripName: updatedTrip.tripName,
      full_name: updatedTrip.user?.full_name || 'Unknown', // Can't be edited
      profilePic: updatedTrip.user?.profilePic || '', // Can't be edited
      budget: updatedTrip.budget,
      category: updatedTrip.category,
      travellerType: updatedTrip.travellerType,
      description: updatedTrip.description,
      activities: updatedTrip.activities,
      totalPeople: updatedTrip.totalPeople,
      inclusions: updatedTrip.inclusions,
      exclusions: updatedTrip.exclusions,
      start: updatedTrip.start,
      end: updatedTrip.end,
      stops: updatedTrip.stops,
      images: updatedTrip.images || [], // Can't be edited
      createdAt: updatedTrip.createdAt,
      itinerary: updatedTrip.itinerary || [],
      duration: `${calculateDurationInDays(updatedTrip.start.dateTime, updatedTrip.end.dateTime)} Days`
    };

    res.json({
      success: true,
      message: 'Trip updated successfully',
      trip: responseTrip
    });
  } catch (err) {
    console.error("Error editing trip:", err);
    res.status(500).json({
      success: false,
      message: 'Error editing trip',
      error: err.message
    });
  }
};

