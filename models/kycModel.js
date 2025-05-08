const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: String,
  mobile: String,
  panNumber: String,
  aadhaarNumber: String,
  aadhaarFrontUrl: String,
  aadhaarBackUrl: String,
  panCardUrl: String,
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
  },
}, { timestamps: true });

module.exports = mongoose.model('KYC', kycSchema);
