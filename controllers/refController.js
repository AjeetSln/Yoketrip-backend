
const Referral = require('../models/referral');
const User = require('../models/User');
const Wallet = require('../models/wallet');
const { logError, logInfo } = require('../utils/logger');

  exports.getReferralLink = async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const referralLink = `${req.protocol}://${req.get('host')}/signup?ref=${user.referralId}`;

      res.json({
        success: true,
        data: {
          referralId: user.referralId,
          referralLink,
          shareMessage: `Join Yoktrip using my referral code ${user.referralId} and get ₹100 travel credit!`
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };


exports.processReferral = async (req, res, next) => {
  try {
    const { referral } = req.body;
    
    if (referral) {
      // Store referral code in request object for later use
      req.referralCode = referral;
    }
    next();
  } catch (err) {
    logError(`Referral middleware error: ${err.stack}`);
    next(err);
  }
};

exports.createReferralRecord = async (referralCode, newUserId) => {
  try {
    if (!referralCode || !newUserId) {
      throw new Error('Invalid referral parameters');
    }

    const referrer = await User.findOne({ referralId: referralCode });
    if (!referrer) {
      throw new Error('Referrer not found');
    }

    if (referrer._id.toString() === newUserId.toString()) {
      throw new Error('User cannot refer themselves');
    }

    // Create referral record
    const referral = new Referral({
      referrer: referrer._id,
      referee: newUserId,
      status: 'pending',
      rewardAmount: 100
    });
    await referral.save();

    // Update referrer's wallet
    await Wallet.findOneAndUpdate(
      { userId: referrer._id },
      { 
        $inc: { lockedBalance: 100 },
        $setOnInsert: { availableBalance: 0 } 
      },
      { upsert: true, new: true }
    );

    return referral;
  } catch (error) {
    error.message = `Referral processing failed: ${error.message}`;
    throw error;
  }
};
  exports.completeReferralReward = async (userId) => {
    try {
      const referral = await Referral.findOneAndUpdate(
        { 
          referee: userId,
          status: 'pending'
        },
        { 
          status: 'completed',
          completedAt: new Date() 
        }
      );
  
      if (referral) {
        await Wallet.findOneAndUpdate(
          { userId: referral.referrer },
          { 
            $inc: { 
              lockedBalance: -100,
              availableBalance: 100 
            } 
          }
        );
      }
    } catch (err) {
      console.error('Error completing referral reward:', err);
      throw err;
    }
  };
  
  // Add to referralController.js
  exports.getReferralList = async (req, res) => {
      try {
        const referrals = await Referral.find({ referrer: req.user.id })
          .populate('referee', 'full_name email profilePic')
          .sort({ createdAt: -1 });
    
        res.json({
          success: true,
          data: referrals.map(ref => ({
            id: ref._id,
            refereeName: ref.referee.full_name,
            refereeEmail: ref.referee.email,
            refereeAvatar: ref.referee.profilePic,
            status: ref.status,
            rewardAmount: ref.rewardAmount,
            createdAt: ref.createdAt,
            completedAt: ref.completedAt
          }))
        });
      } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
      }
    };