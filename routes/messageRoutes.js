const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/authMiddleware');

// Get messages between users
router.get('/:receiverId', auth, messageController.getMessages);

// Send a message
router.post('/send', auth, messageController.sendMessage);

// Get all conversations
router.get('/conversations/list', auth, messageController.getConversations);

// Mark messages as read
router.put('/read/:senderId', auth, messageController.markAsRead);

module.exports = router;