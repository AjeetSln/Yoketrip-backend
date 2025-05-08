const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Wallet endpoints
router.get('/', walletController.getWallet);
router.post('/create-order', walletController.createOrder);
router.post('/verify-payment', walletController.verifyPayment);
router.post('/withdraw', walletController.withdraw);

// Transaction endpoints
router.get('/transactions', walletController.getTransactions);
router.get('/transactions/:id', walletController.getTransaction);

module.exports = router;