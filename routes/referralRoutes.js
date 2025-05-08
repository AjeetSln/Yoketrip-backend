const express = require('express');
const router = express.Router();
const referralController = require('../controllers/refController');
const authenticate = require('../middleware/authMiddleware');

router.get('/link', authenticate, referralController.getReferralLink);
// In your referralRoutes.js
router.get('/list', authenticate, referralController.getReferralList);

module.exports = router;