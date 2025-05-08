const mongoose = require('mongoose');

const deleteitinerarySchema = new mongoose.Schema({
  location: String,
  description: String,
  start_time: String,
  end_time: String,
});

const deletestopSchema = new mongoose.Schema({
  location: String,
  date: String, // ISO Date string
  transport:String,
  description:String,
});
// Add reference to bookings


const deletetripSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  tripName:{ type:String, required:true},
  budget: {type:Number,required:true},
  category:{ type:String, required:true},
  travellerType: { type:String, required:true},
  description: String,
  activities: { type:String, required:true},
  totalPeople: {type:Number,required:true},

  inclusions: [String],
  exclusions: [String],

  start: {
    location: { type:String, required:true},
    dateTime:{ type:String, required:true},
    transport: { type:String, required:true},
    description: String,
  },
  end: {
    location: { type:String, required:true},
    dateTime:{ type:String, required:true},
    transport: { type:String, required:true},
    description: String,
  },

  stops: [deletestopSchema],
  images: [String], // Cloudinary URL
  itinerary: [deleteitinerarySchema], // Optional for now
  views: { type: Number, default: 0 },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: [],
  }]
  

}, { timestamps: true });

module.exports = mongoose.model('DeletedTrip', deletetripSchema);
