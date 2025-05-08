const Message = require('../models/message');
const User = require('../models/User');

// Get messages between users
// Get messages between users
exports.getMessages = async (req, res) => {
    try {
      const messages = await Message.find({
        $or: [
          { 
            senderId: req.user.id, 
            receiverId: req.params.receiverId 
          },
          { 
            senderId: req.params.receiverId, 
            receiverId: req.user.id 
          }
        ]
      })
      .sort({ createdAt: -1 })
      .populate('senderId', 'full_name profilePic')
      .populate('receiverId', 'full_name profilePic');
      
      res.status(200).json({ 
        success: true,
        messages 
      });
    } catch (err) {
      res.status(500).json({ 
        success: false,
        error: err.message 
      });
    }
  };

// Send a message
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    
    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        error: 'Receiver ID and content are required'
      });
    }

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        error: 'Receiver not found'
      });
    }

    const message = new Message({
      senderId: req.user.id,
      receiverId,
      content
    });
    
    await message.save();
    
    // Populate sender info in response
    await message.populate('senderId', 'full_name profilePic');
    
    res.status(201).json({
      success: true,
      message
    });
  } catch (err) {
    res.status(400).json({ 
      success: false,
      error: err.message 
    });
  }
};

// Get all conversations for a user
exports.getConversations = async (req, res) => {
    try {
      const conversations = await Message.aggregate([
        {
          $match: {
            $or: [
              { senderId: req.user._id },
              { receiverId: req.user._id }
            ]
          }
        },
        {
          $addFields: {
            isSelfMessage: { $eq: ["$senderId", "$receiverId"] },
            isFromMe: { $eq: ["$senderId", req.user._id] }
          }
        },
        {
          $project: {
            otherUserId: {
              $cond: [
                { $eq: ['$senderId', req.user._id] },
                '$receiverId',
                '$senderId'
              ]
            },
            content: 1,
            createdAt: 1,
            read: 1,
            senderId: 1,
            isSelfMessage: 1,
            isFromMe: 1
          }
        },
        {
          $group: {
            _id: '$otherUserId',
            lastMessage: { $last: '$$ROOT' },
            unreadCount: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      { $eq: ['$otherUserId', '$lastMessage.senderId'] },
                      { $eq: ['$lastMessage.read', false] },
                      { $eq: ['$lastMessage.isSelfMessage', false] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            isSelfConversation: { $max: '$isSelfMessage' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'otherUser'
          }
        },
        {
          $unwind: {
            path: '$otherUser',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            otherUser: {
              $cond: [
                { $eq: ['$isSelfConversation', true] },
                {
                  _id: req.user._id,
                  full_name: 'Your Notes',
                  profilePic: ''
                },
                {
                  _id: '$otherUser._id',
                  full_name: '$otherUser.full_name',
                  profilePic: '$otherUser.profilePic'
                }
              ]
            },
            lastMessage: {
              content: '$lastMessage.content',
              createdAt: '$lastMessage.createdAt',
              isFromMe: '$lastMessage.isFromMe'
            },
            unreadCount: 1,
            isSelfConversation: 1
          }
        },
        {
          $sort: { 'lastMessage.createdAt': -1 }
        }
      ]);
  
      res.status(200).json({
        success: true,
        conversations
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
// Mark messages as read
// Mark messages as read
exports.markAsRead = async (req, res) => {
    try {
      await Message.updateMany(
        {
          senderId: req.params.receiverId,
          receiverId: req.user._id,
          read: false
        },
        {
          $set: { read: true }
        }
      );
      
  
      res.status(200).json({
        success: true,
        message: 'Messages marked as read'
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };