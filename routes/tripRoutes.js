const express = require('express');
const router = express.Router();
const multer = require('multer');
const tripController = require('../controllers/tripController');
const  authenticate  = require('../middleware/authMiddleware');

// Multer config
const upload = multer({ dest: 'uploads/' });

router.post('/create', authenticate, upload.array('photos',10), tripController.createTrip);
router.get('/gettrips', tripController.getAllTrips);
router.get('/trending', tripController.getTrendingTrips);
router.put("/:id/view", authenticate, tripController.addTripView);
router.put('/:id/like', authenticate, tripController.toggleLikeTrip);
router.get('/getowntrips/', authenticate,tripController.getownTrips);
router.delete('/:tripId', authenticate, tripController.deleteTrip);
router.put('/:tripId', authenticate, tripController.editTrip);

// 🔍 Check Like Status
router.get('/:id/isLiked', authenticate, tripController.isTripLiked);

module.exports = router;
