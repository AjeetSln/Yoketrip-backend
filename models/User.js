const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  gender: { type: String, required: true },
  dob: { type: String, required: true },
  country: { type: String, required: true },
  referral: { type: String },
  accept_terms: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  referralId: { type: String, unique: true, sparse: true },
  profilePic: { type: String, default: '' },
  otp: String,
  otpExpires: Date,
  about: { type: String, default: '' },
  interests: { type: [String], default: [] },
  subscription: {
    plan: { type: String, enum: ['Free', 'Basic', 'Super'], default: 'Free' },
    expiresAt: Date,
    upgradedAt: Date,
  },
  socialLinks: {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    youtube: { type: String, default: '' },
    twitter: { type: String, default: '' },
    linkedin: { type: String, default: '' }
  },
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet'
  },
  followers: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  },
  following: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  }
}, {
  timestamps: true
});

// Add reference to bookings
userSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'user'
});

module.exports = mongoose.model('User', userSchema);