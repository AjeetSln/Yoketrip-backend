const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authController = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// GET /api/user/profile
router.get('/profile', authController, userController.getUserProfile);
router.get('/ourveiw/:userId', authController, userController.getUserProfiles2);
router.get('/:userId',authController, userController.getUserProfiles);
router.post('/:userId/follow', authController, userController.followUser);
router.put(
    '/update',
    authController,
    upload.single('profilePic'), // Handle single file upload
    userController.updateProfile
  );

module.exports = router;
