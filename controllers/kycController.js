const KYC = require('../models/kycModel');
const cloudinary = require('../config/cloudinary');

const uploadToCloudinary = async (file) => {
    // Ensure that file exists before trying to upload
    if (!file) {
      throw new Error('File not provided');
    }
    
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'kyc_docs',
    });
    return result.secure_url;
  };
  
  exports.submitKYC = async (req, res) => {
    try {
      const { fullName, mobile, panNumber, aadhaarNumber } = req.body;
      const userId = req.user.id || req.user._id;
  
      // Check if the necessary files exist before proceeding
      const aadhaarFront = req.files.aadhaarFront ? req.files.aadhaarFront[0] : null;
      const aadhaarBack = req.files.aadhaarBack ? req.files.aadhaarBack[0] : null;
      const panCard = req.files.panCard ? req.files.panCard[0] : null;
  
      if (!aadhaarFront || !aadhaarBack || !panCard) {
        return res.status(400).json({ message: 'All document files are required' });
      }
  
      // Upload the files to Cloudinary
      const [aadhaarFrontUrl, aadhaarBackUrl, panCardUrl] = await Promise.all([
        uploadToCloudinary(aadhaarFront),
        uploadToCloudinary(aadhaarBack),
        uploadToCloudinary(panCard),
      ]);
  
      // Delete existing KYC for the user if rejected
      await KYC.deleteOne({ userId, status: 'rejected' });
  
      // Save new KYC data
      const newKyc = new KYC({
        userId,
        fullName,
        mobile,
        panNumber,
        aadhaarNumber,
        aadhaarFrontUrl,
        aadhaarBackUrl,
        panCardUrl,
      });
  
      await newKyc.save();
      res.status(201).json({ message: 'KYC submitted successfully', kyc: newKyc });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error', error });
    }
  };
  
  exports.getKYCStatus = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
      const kyc = await KYC.findOne({ userId });
  
      if (!kyc) return res.status(404).json({ message: 'KYC not found' });
      res.status(200).json({ status: kyc.status, kyc });
    } catch (err) {
      res.status(500).json({ message: 'Error fetching KYC status' });
    }
  };
  
