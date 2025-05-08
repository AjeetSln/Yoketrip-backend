const Wallet = require('../models/wallet');
const Transaction = require('../models/transaction');
const { validateTransaction } = require('../utils/validators');
const { validateWithdrawal } = require('../utils/validators');
const Razorpay = require('razorpay');
const crypto = require('crypto');


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET  
});

// Get wallet balance and recent transactions
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId });
      await wallet.save();
    }

    // Get last 5 transactions
    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
      transactions: transactions.map(txn => ({
        _id: txn._id,
        description: txn.description,
        amount: txn.amount,
        date: txn.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        type: txn.type,
        status: txn.status
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Deposit funds
exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: `deposit_${Date.now()}`,
      payment_capture: 1
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({
      id: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create order' });
  }
};

// Verify payment endpoint
exports.verifyPayment = async (req, res) => {
  try {
    const { payment_id, order_id, signature } = req.body;

    // ✅ Check if this payment_id has already been processed
    const existing = await Transaction.findOne({ reference: payment_id });
    if (existing) {
      return res.status(400).json({ message: 'Payment already processed' });
    }

    // Generate expected signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    if (generatedSignature !== signature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(payment_id);

    // Update wallet balance
    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user.id },
      { $inc: { availableBalance: payment.amount / 100 } },
      { new: true, upsert: true }
    );

    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.id,
      amount: payment.amount / 100,
      description: `Deposit via ${payment.method}`,
      type: 'deposit',
      status: 'completed',
      reference: payment_id,
      method: payment.method,
      details: {
        bank: payment.bank,
        wallet: payment.wallet,
        vpa: payment.vpa
      }
    });
    await transaction.save();

    res.status(200).json({
      success: true,
      availableBalance: wallet.availableBalance
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Payment verification failed' });
  }
};

// Withdraw funds
exports.withdraw = async (req, res) => {
    try {
      const { error } = validateWithdrawal(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });
  
      const { amount, method, upiId, accountNumber, ifscCode } = req.body;
      const userId = req.user.id;
  
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        return res.status(404).json({ message: 'Wallet not found' });
      }
  
      if (wallet.availableBalance < amount) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }
  
      wallet.availableBalance -= amount;
      await wallet.save();
  
      const transaction = new Transaction({
        userId,
        amount: -amount,
        description: `Withdrawal via ${method === 'upi' ? 'UPI' : 'Bank Transfer'}`,
        type: 'withdrawal',
        status: 'pending',
        method: method,
        details: method === 'upi'
          ? { upiId }
          : { accountNumber, ifscCode }
      });
      await transaction.save();
  
      res.status(200).json({
        availableBalance: wallet.availableBalance,
        transaction: {
          _id: transaction._id,
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.createdAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }),
          type: transaction.type,
          status: transaction.status,
          method: transaction.method
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  };
// Get full transaction history
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, status, startDate, endDate } = req.query;

    // Build filter object
    const filter = { userId };
    if (type) filter.type = type;
    if (status) filter.status = status;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Get ALL matching transactions (no limit/skip)
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: transactions.map(txn => ({
        id: txn._id,
        description: txn.description,
        amount: txn.amount,
        date: txn.createdAt.toISOString(),
        formattedDate: txn.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        type: txn.type,
        status: txn.status,
        method: txn.method,
        details: txn.details
      }))
    });
  } catch (err) {
    console.error('Transaction fetch error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch transactions',
      error: err.message 
    });
  }
};


// Get transaction details
exports.getTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.status(200).json({
      _id: transaction._id,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      type: transaction.type,
      status: transaction.status,
      reference: transaction.reference,
      createdAt: transaction.createdAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};