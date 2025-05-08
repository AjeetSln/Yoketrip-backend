const mongoose = require('mongoose');


const referralSchema = new mongoose.Schema({
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    referee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending'
    },
    rewardAmount: {
      type: Number,
      default: 100 // ₹100 reward
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    completedAt: Date
  });
  
  module.exports = mongoose.model('Referral', referralSchema);