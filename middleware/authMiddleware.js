const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password'); // 👈 Fetch full user
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    req.user = user; // 👈 Assign full user to req.user
    next();
  } catch (err) {
    console.error('JWT Error:', err.message);
    return res.status(401).json({ message: 'Invalid token, authorization denied' });
  }
};

module.exports = authMiddleware;
