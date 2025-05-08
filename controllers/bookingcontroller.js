const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const User = require('../models/User');
const { sendBookingConfirmationEmail,sendBookingCancellationEmail } = require('../utils/sendEmail');

// Cache for frequently accessed trips
const tripCache = new Map();

exports.createBooking = async (req, res) => {
  try {
    const { tripId, numPeople, bookingDate } = req.body;
    const userId = req.user.id;

    // Validation
    if (!tripId || !numPeople || !bookingDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const parsedNumPeople = parseInt(numPeople);
    if (isNaN(parsedNumPeople)) {
      return res.status(400).json({
        success: false,
        message: 'Number of people must be a valid number'
      });
    }

    // Cache check
    let trip = tripCache.get(tripId);
    if (!trip) {
      trip = await Trip.findById(tripId).lean();
      if (trip) tripCache.set(tripId, trip);
    }

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    if (parsedNumPeople <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid number of people'
      });
    }

    if (parsedNumPeople > trip.totalPeople) {
      return res.status(400).json({
        success: false,
        message: `Only ${trip.totalPeople} spots available`
      });
    }

    const bookingDateTime = new Date(bookingDate);
    if (isNaN(bookingDateTime)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const [existingBooking, user] = await Promise.all([
      Booking.findOne({
        trip: tripId,
        user: userId,
        status: { $in: ['pending', 'confirmed'] }
      }).lean(),
      User.findById(userId).lean()
    ]);

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'Existing booking found'
      });
    }

    // ✅ Booking create karo
    const booking = await Booking.create([{
      trip: tripId,
      user: userId,
      numPeople: parsedNumPeople,
      bookingDate: bookingDateTime,
      totalAmount: trip.budget,
      status: 'confirmed'
    }]);

    await Trip.findByIdAndUpdate(
      tripId,
      { $inc: { totalPeople: -parsedNumPeople } }
    );

    await User.findByIdAndUpdate(
      userId,
      { $push: { bookings: booking[0]._id } }
    );

    // Update cache
    tripCache.set(tripId, {
      ...trip,
      totalPeople: trip.totalPeople - parsedNumPeople
    });

    // Send confirmation email (async)
    sendBookingConfirmationEmail(
      req.user.email,
      {
        _id: booking[0]._id,
        numPeople: parsedNumPeople,
        totalAmount: trip.budget
      },
      {
        tripName: trip.tripName,
        startTime: trip.startTime
      }
    ).catch(console.error);

    return res.status(201).json({
      success: true,
      message: 'Booking successful',
      data: {
        bookingId: booking[0]._id,
        remainingSpots: trip.totalPeople - parsedNumPeople
      }
    });

  } catch (error) {
    console.error('Booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Processing error'
    });
  }
};
// Get booking details
exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;

    const bookings = await Booking.find({ user: userId })
      .populate({
        path: 'trip',
        select: 'tripName budget totalPeople start end'
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      bookings: bookings
        .filter(b => b.trip) // In case trip got deleted
        .map(b => ({
          _id: b._id,
          tripName: b.trip.tripName,
          bookingDate:b.bookingDate,
          startDate: b.trip.start.dateTime,
          endDate: b.trip.end.dateTime,
          startLocation: b.trip.start.location,
          endLocation: b.trip.end.location,
          numPeople: b.numPeople,
          totalAmount: b.totalAmount,
          status: b.status
        }))
    });

  } catch (error) {
    console.error('Get user bookings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching bookings'
    });
  }
};

// Cancel booking
exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      user: userId,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Active booking not found'
      });
    }

    // Check if cancellation is allowed (e.g., not too close to trip date)
    const trip = await Trip.findById(booking.trip);
    const now = new Date();
    const tripDate = new Date(trip.startTime);
    const hoursBeforeTrip = (tripDate - now) / (1000 * 60 * 60);

    if (hoursBeforeTrip < 24) { // 24 hours before trip
      return res.status(400).json({
        success: false,
        message: 'Cancellation not allowed within 24 hours of trip'
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    // Return the spots to trip capacity
    await Trip.findByIdAndUpdate(
      booking.trip,
      { $inc: { totalPeople: booking.numPeople } }
    );

    // Update cache if exists
    if (tripCache.has(booking.trip.toString())) {
      const cachedTrip = tripCache.get(booking.trip.toString());
      tripCache.set(booking.trip.toString(), {
        ...cachedTrip,
        totalPeople: cachedTrip.totalPeople + booking.numPeople
      });
    }

    // Remove from user's bookings array
    await User.findByIdAndUpdate(
      userId,
      { $pull: { bookings: booking._id } }
    );

    // Send cancellation email (async)
    sendBookingCancellationEmail(
      req.user.email,
      {
        _id: booking._id,
        numPeople: booking.numPeople,
        totalAmount: booking.totalAmount
      },
      {
        tripName: trip.tripName,
        startTime: trip.startTime
      }
    ).catch(console.error);

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        bookingId: booking._id,
        refundAmount: booking.totalAmount // Add your refund logic here
      }
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error cancelling booking'
    });
  }
};
exports.getBookingsForTrip = async (req, res) => {
  try {
    const { tripId } = req.params;

    const bookings = await Booking.find({ trip: tripId })
      .populate({
        path: 'user',
        select: 'full_name email phone' // You can adjust fields as needed
      })
      .populate({
        path: 'trip',
        select: 'title'
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ bookings });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ message: 'Error fetching bookings', error: err });
  }
};
