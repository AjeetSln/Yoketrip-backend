// controllers/subscriptionController.js
const User = require('../models/User');
const Wallet = require('../models/wallet');
const Transaction = require('../models/transaction');
const Razorpay = require('razorpay');
const { completeReferralReward } = require('./refController');

const crypto = require('crypto');
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Get current subscription
exports.getCurrentSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('subscription');
    res.json({
      success: true,
      data: {
        plan: user.subscription?.plan || 'Free',
        expiresAt: user.subscription?.expiresAt,
        daysRemaining: user.subscription?.expiresAt 
          ? Math.ceil((user.subscription.expiresAt - new Date()) / (1000 * 60 * 60 * 24))
          : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
  }
};

// Create payment intent
exports.createPaymentIntent = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.user._id;

    // Validate plan
    if (!['Basic', 'Super'].includes(plan)) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    // Calculate amounts
    const planAmount = plan === 'Basic' ? 59900 : 99900; // in paise
    const userWallet = await Wallet.findOne({ userId });

    if (!userWallet) {
      return res.status(400).json({ success: false, message: 'Wallet not found' });
    }

    let walletDeduction = 0;
    let razorpayAmount = planAmount;

    // Check wallet balance
    if (userWallet.availableBalance > 0) {
      const walletBalanceInPaise = Math.floor(userWallet.availableBalance * 100);
      walletDeduction = Math.min(walletBalanceInPaise, planAmount);
      razorpayAmount = planAmount - walletDeduction;
    }

    // Deduct from wallet if needed
    if (walletDeduction > 0) {
      userWallet.availableBalance -= walletDeduction / 100;
      await userWallet.save();

      // Record wallet transaction
      await Transaction.create({
        userId,
        amount: -(walletDeduction / 100),
        description: `Wallet deduction for ${plan} plan`,
        type: 'subscription',
        status: 'completed'
      });
    }

    let razorpayOrder = null;

    // Create Razorpay order if needed
    if (razorpayAmount > 0) {
      const order = await razorpay.orders.create({
        amount: razorpayAmount,
        currency: 'INR',
        receipt: `sub_${Date.now()}`,
        notes: {
          userId: userId.toString(),
          plan: plan
        }
      });

      // Record pending transaction
      await Transaction.create({
        userId,
        amount: razorpayAmount / 100,
        description: `Razorpay payment for ${plan} plan`,
        type: 'subscription',
        status: 'pending',
        reference: order.id
      });

      razorpayOrder = {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        orderId: order.id 
      };
      
    }

    res.json({
      success: true,
      data: {
        plan,
        walletDeducted: walletDeduction / 100,
        payableViaRazorpay: razorpayAmount / 100,
        razorpayOrder
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Payment processing failed' });
  }
};

exports.confirmSubscription = async (req, res) => {
  try {
    const { orderId, paymentId, signature, plan } = req.body;
    const userId = req.user.id;

    const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(orderId + "|" + paymentId)
      .digest('hex');

    if (generatedSignature !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await User.findByIdAndUpdate(userId, {
      subscription: {
        plan,
        expiresAt,
        upgradedAt: new Date()
      }
    });

    if (orderId) {
      await Transaction.updateOne(
        { reference: orderId },
        { $set: { status: 'completed', paymentId, signature } }
      );
    }
    if (req.body.plan !== 'Free') {
      await completeReferralReward(userId);
    }

    res.json({ success: true, message: 'Subscription activated' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to confirm subscription' });
  }
};

exports.downgradeToFree = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      subscription: {
        plan: 'Free',
        expiresAt: null,
        downgradedAt: new Date()
      }
    });
    res.json({ success: true, message: 'Downgraded to Free plan' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to downgrade' });
  }
};
