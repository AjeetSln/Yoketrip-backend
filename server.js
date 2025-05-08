const express = require('express');
const cors = require('cors');
const http = require('http');
const dotenv = require('dotenv');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const connectDB = require('./config/db');
const kyc = require('./routes/kycRoutes');
const messageRoutes = require('./routes/messageRoutes');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const tripRoutes = require('./routes/tripRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const Message = require('./models/message'); // Make sure this is imported
const subcriptions = require('./routes/subscription')
const referralRoutes = require('./routes/referralRoutes');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws' });
const clients = new Map(); // Store connected clients

wss.on('connection', (ws, req) => {
  const token = req.url.split('token=')[1]?.split('&')[0];

  if (!token) {
    ws.close();
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      ws.close();
      return;
    }

    const userId = decoded.id;
    clients.set(userId, ws);
    ws.userId = userId;

   

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await handleWebSocketMessage(ws, data);
      } catch (err) {
        console.error('❌ Error handling message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(userId);
  
    });
  });
});

async function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'send_message': {
      const { receiverId: sendTo, content } = data;

      const message = new Message({
        senderId: ws.userId,
        receiverId: sendTo,
        content
      });

      await message.save();
      await message.populate('senderId', 'full_name profilePic');

      // Send to receiver
      if (clients.has(sendTo)) {
        clients.get(sendTo).send(JSON.stringify({
          type: 'new_message',
          message
        }));
      }

      // Echo back to sender
      ws.send(JSON.stringify({
        type: 'new_message',
        message
      }));

      break;
    }

    case 'typing': {
      const { receiverId: typingTo, isTyping } = data;

      if (clients.has(typingTo)) {
        clients.get(typingTo).send(JSON.stringify({
          type: 'typing',
          senderId: ws.userId,
          isTyping
        }));
      }
      break;
    }

    case 'mark_read': {
      const { messageId } = data;
      await Message.findByIdAndUpdate(messageId, { read: true });
      break;
    }

    default:
      console.warn(`⚠️ Unknown WebSocket type: ${data.type}`);
  }
}


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/kyc', kyc);
app.use('/api/trips', tripRoutes);
app.use('/api/trips', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/users', subcriptions)
app.use('/api/referral', referralRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('🚀 API is running...');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
