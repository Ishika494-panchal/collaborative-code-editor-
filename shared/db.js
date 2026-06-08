const mongoose = require('mongoose');

const connectDB = async (uri) => {
  try {
    await mongoose.connect(uri);
    console.log('MongoDB Connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.warn('⚠️  MongoDB connection failed. The application will run using in-memory fallbacks.');
  }
};

module.exports = connectDB;
