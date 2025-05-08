const User = require('../models/User');
const Trip = require('../models/Trip');
const asyncHandler = require('express-async-handler');
const KYC = require('../models/kycModel');
const cloudinary = require('../config/cloudinary')
const mongoose = require('mongoose');



exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id; // Support either format

    const user = await User.findById(userId).select('-password -otp -otpExpires');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
exports.getUserProfiles2 = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;

    // Get user data
    const user = await User.findById(userId)
      .select('-password -otp -otpExpires')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check KYC status
    const kyc = await KYC.findOne({ userId }).select('status').lean();
    const kycStatus = kyc ? kyc.status : 'not_submitted';

    res.status(200).json({
      ...user,
      kycStatus
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body || {};
    const files = req.files || {};

    // Validate updates
    const allowedUpdates = [
      'full_name', 'phone', 'gender', 'dob', 'country', 'profilePic',
      'about', 'interests', 'socialLinks'
    ];
    
    const updateKeys = Object.keys(updates);
    const invalidUpdates = updateKeys.filter(key => !allowedUpdates.includes(key));
    
    if (invalidUpdates.length > 0) {
      return res.status(400).json({
        message: `Invalid update fields: ${invalidUpdates.join(', ')}`
      });
    }

    // Handle file upload
    if (files.profilePic) {
      const uploadedResponse = await cloudinary.uploader.upload(files.profilePic[0].path, {
        folder: "profile_pics",
      });
      updates.profilePic = uploadedResponse.secure_url;
    }

    // Process interests
    if (updates.interests) {
      updates.interests = updates.interests.split(',').filter(i => i);
    }

    // Process social links
    if (updates['socialLinks[facebook]'] !== undefined) {
      updates.socialLinks = updates.socialLinks || {};
      updates.socialLinks.facebook = updates['socialLinks[facebook]'];
      delete updates['socialLinks[facebook]'];
    }
    // Repeat for other social links...

    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -otp -otpExpires');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user profile
exports.getUserProfiles = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -otp -otpExpires -__v')
      .populate('followers', 'full_name profilePic')
      .populate('following', 'full_name profilePic')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.followers = user.followers || [];
    user.following = user.following || [];

    // 🔄 Get KYC status
    const kyc = await KYC.findOne({ userId: user._id }).lean();
    user.kycStatus = kyc?.status || 'pending';

    const [tripsHosted, tripsCompleted, tripsUpcoming] = await Promise.all([
      Trip.countDocuments({ user: user._id }),
      Trip.countDocuments({
        user: user._id,
        'end.dateTime': { $lt: new Date().toISOString() }
      }),
      Trip.countDocuments({
        user: user._id,
        'start.dateTime': { $gt: new Date().toISOString() }
      })
    ]);

    res.json({
      success: true,
      data: {
        ...user,
        tripsHosted,
        tripsCompleted,
        tripsUpcoming,
        isFollowing: user.followers.some(f =>
          f && f._id && f._id.toString() === req.user.id
        )
      }
    });
  } catch (error) {
    console.error('Error in getUserProfiles:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Follow/Unfollow user
exports.followUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;

  if (userId === currentUserId) {
    return res.status(400).json({
      success: false,
      message: 'You cannot follow yourself'
    });
  }

  try {
    // Check if already following
    const isFollowing = await User.findOne({
      _id: userId,
      followers: currentUserId
    });

    // Update both users without transaction
    await User.findByIdAndUpdate(
      userId,
      {
        [isFollowing ? '$pull' : '$addToSet']: { followers: currentUserId }
      }
    );

    await User.findByIdAndUpdate(
      currentUserId,
      {
        [isFollowing ? '$pull' : '$addToSet']: { following: userId }
      }
    );

    // Get updated counts
    const updatedUser = await User.findById(userId)
      .select('followers following')
      .lean();

    res.json({
      success: true,
      data: {
        isFollowing: !isFollowing,
        followersCount: updatedUser.followers?.length || 0,
        followingCount: updatedUser.following?.length || 0
      }
    });


  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
