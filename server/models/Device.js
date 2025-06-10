// server/models/Device.js
const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  deviceName: { 
    type: String, 
    required: true 
  },
  appVersion: { 
    type: String, 
    required: true 
  },
  apiKey: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  userId: { 
    type: String, 
    required: true,
    index: true 
  },
  lastSeen: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

// Create compound index for better query performance
deviceSchema.index({ userId: 1, isActive: 1 });
deviceSchema.index({ apiKey: 1, userId: 1 });

module.exports = mongoose.model('Device', deviceSchema);