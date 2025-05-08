const express = require('express');
const multer = require('multer');
const { submitKYC, getKYCStatus } = require('../controllers/kycController');
const auth = require('../middleware/authMiddleware');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post(
  '/submit',
  auth,
  upload.fields([
    { name: 'aadhaarFront', maxCount: 1 },
    { name: 'aadhaarBack', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
  ]),
  submitKYC
);

router.get('/status', auth, getKYCStatus);

module.exports = router;
