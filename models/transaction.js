const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'transfer', 'payment', 'refund', 'bonus', 'subscription'],
    required: true
  },
  method: {
    type: String,
    enum: ['upi', 'bank', 'other']
  },
  details: {
    type: Object,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  reference: {
    type: String,
    unique: true
  },
  metadata: {
    type: Object
  }
}, { timestamps: true });

// Generate reference number before saving
transactionSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);