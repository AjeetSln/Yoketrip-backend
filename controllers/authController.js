const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOtpToEmail } = require('../utils/sendEmail');
const { logError, logInfo } = require('../utils/logger');
const { processReferral, createReferralRecord } = require('./refController');

const tempUsers = new Map();

// Helper to generate referral ID
const generateReferralId = () => `YOKE${Math.floor(100000 + Math.random() * 900000)}`;

// Helper to generate JWT token
function generateAuthToken(user) {
  return jwt.sign(
    {
      id: user._id, email: user.email
    },
    process.env.JWT_SECRET,
  );
}

// Register Controller
exports.register = async (req, res) => {
  try {
    const { full_name, email, phone, password, gender, dob, country, referral, accept_terms } = req.body;

    if (!email || !password || !phone) {
      return res.status(400).json({ success: false, message: 'Email, password, and phone are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    tempUsers.set(email.toLowerCase(), {
      full_name,
      email: email.toLowerCase(),
      phone,
      password,
      gender,
      dob,
      country,
      referral,
      accept_terms: accept_terms === true,
      otp,
      otpExpires
    });

    sendOtpToEmail(email, otp)
      .then(() => logInfo(`OTP sent to ${email}`))
      .catch(err => logError(`Failed to send OTP to ${email}: ${err.message}`));

    res.status(200).json({ success: true, message: 'OTP sent to your email' });

  } catch (error) {
    logError(`Registration error: ${error.stack}`);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
};

// OTP Verification Controller
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const tempUser = tempUsers.get(email.toLowerCase());
    if (!tempUser) {
      return res.status(404).json({ success: false, message: 'No OTP request found for this email' });
    }

    if (tempUser.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (tempUser.otpExpires < new Date()) {
      tempUsers.delete(email.toLowerCase());
      return res.status(400).json({ success: false, message: 'OTP has expired' });
    }

    const hashedPassword = await bcrypt.hash(tempUser.password, 12);

    const newUser = new User({
      full_name: tempUser.full_name,
      email: tempUser.email,
      phone: tempUser.phone,
      password: hashedPassword,
      gender: tempUser.gender,
      dob: tempUser.dob,
      country: tempUser.country,
      referral: tempUser.referral,
      accept_terms: tempUser.accept_terms,
      isVerified: true,
      referralId: generateReferralId(),
      lastLogin: new Date()
    });

    await newUser.save();
    logInfo(`New user registered: ${newUser.email}`);

    if (tempUser.referral) {
      try {
        await createReferralRecord(tempUser.referral, newUser._id);
        logInfo(`Referral processed for ${newUser.email}`);
      } catch (err) {
        logError(`Referral processing failed: ${err.message}`);
      }
    }

    tempUsers.delete(email.toLowerCase());

    const token = generateAuthToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        user: {
          id: newUser._id,
          email: newUser.email,
          full_name: newUser.full_name
        }
      }
    });

  } catch (error) {
    logError(`OTP verification error: ${error.stack}`);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};
// Add this to your authController.js
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const tempUser = tempUsers.get(email.toLowerCase());
    if (!tempUser) {
      return res.status(404).json({ success: false, message: 'No registration found for this email' });
    }

    // Generate new OTP
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update temp user with new OTP
    tempUsers.set(email.toLowerCase(), {
      ...tempUser,
      otp: newOtp,
      otpExpires: otpExpires
    });

    // Send new OTP
    await sendOtpToEmail(email, newOtp);

    res.status(200).json({ 
      success: true,
      message: 'New OTP sent successfully'
    });

  } catch (error) {
    logError(`Resend OTP error: ${error.stack}`);
    res.status(500).json({ 
      success: false,
      message: 'Failed to resend OTP'
    });
  }
};

// Login Controller
exports.login = async (req, res) => {
  try {
    const { luseremail, lpassword } = req.body;

    if (!luseremail || !lpassword) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: luseremail.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(lpassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateAuthToken(user);

    res.status(200).json({ success: true, token, user });

  } catch (error) {
    logError(`Login error: ${error.stack}`);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

// Add these new controllers to your authController.js

// Forgot Password - Send OTP
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    tempUsers.set(email.toLowerCase(), {
      otp,
      otpExpires
    });

    sendOtpToEmail(email, otp)
      .then(() => logInfo(`OTP sent to ${email}`))
      .catch(err => logError(`Failed to send OTP to ${email}: ${err.message}`));

    res.status(200).json({ 
      success: true,
      message: 'OTP sent to your email for password reset'
    });

  } catch (error) {
    logError(`Forgot password error: ${error.stack}`);
    res.status(500).json({ 
      success: false,
      message: 'Failed to process forgot password request'
    });
  }
};

// Verify OTP for Password Reset
exports.verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const tempUser = tempUsers.get(email.toLowerCase());
    if (!tempUser) {
      return res.status(404).json({ success: false, message: 'No OTP request found for this email' });
    }
    if (tempUser.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (tempUser.otpExpires < new Date()) {
      tempUsers.delete(email.toLowerCase());
      return res.status(400).json({ success: false, message: 'OTP has expired' });
    }

    tempUsers.delete(email.toLowerCase());

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    logError(`Reset OTP verification error: ${error.stack}`);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP and new password are required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    logError(`Reset password error: ${error.stack}`);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// Dashboard Controller
exports.dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -__v');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });

  } catch (error) {
    logError(`Dashboard error: ${error.stack}`);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
};
