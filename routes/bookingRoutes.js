const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingcontroller');
const authMiddleware = require('../middleware/authMiddleware');


router.post('/bookings', authMiddleware,bookingController.createBooking);
router.get('/bookings/all', authMiddleware, bookingController.getUserBookings);

// ❌ Cancel a booking
router.delete('/cancel/:bookingId', authMiddleware, bookingController.cancelBooking);
// ROUTE
router.get('/:tripId',  bookingController.getBookingsForTrip);




// router.get('/my-bookings', bookingController.getUserBookings);
// router.put('/:id/cancel', bookingController.cancelBooking);

module.exports = router;