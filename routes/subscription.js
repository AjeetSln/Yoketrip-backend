// routes/subscription.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); 
const subscriptionController = require('../controllers/subscriptionController');

// Get current subscription
router.get('/subscription', auth, subscriptionController.getCurrentSubscription);



// Create payment intent
router.post('/subscription/payment-intent', auth, subscriptionController.createPaymentIntent);
// routes/subscription.js
router.post('/subscription/confirm', auth, subscriptionController.confirmSubscription);
router.post('/subscription/free', auth, subscriptionController.downgradeToFree);

module.exports = router;