// server/models/SyncStatus.js
const mongoose = require('mongoose');

const syncStatusSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  deviceInfo: {
    platform: String,
    type: {
      type: String,
      enum: ['desktop', 'browser', 'mobile']
    },
    version: String,
    name: String
  },
  lastSync: {
    type: Date,
    required: true,
    default: Date.now
  },
  syncVersion: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'error'],
    default: 'active'
  },
  lastError: {
    message: String,
    timestamp: Date,
    code: String
  },
  statistics: {
    totalSyncs: {
      type: Number,
      default: 0
    },
    successfulSyncs: {
      type: Number,
      default: 0
    },
    failedSyncs: {
      type: Number,
      default: 0
    },
    lastSyncDuration: Number, // in milliseconds
    avgSyncDuration: Number
  },
  queueInfo: {
    pendingItems: {
      type: Number,
      default: 0
    },
    lastProcessed: Date,
    conflicts: [{
      itemId: String,
      itemType: String,
      field: String,
      localValue: mongoose.Schema.Types.Mixed,
      serverValue: mongoose.Schema.Types.Mixed,
      resolution: String,
      resolvedAt: Date
    }]
  }
}, {
  timestamps: true
});

// Compound index for unique device per user
syncStatusSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

// TTL index to clean up inactive devices (90 days)
syncStatusSchema.index({ lastSync: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Instance methods
syncStatusSchema.methods.recordSync = function(success = true, duration = 0, error = null) {
  this.lastSync = new Date();
  this.statistics.totalSyncs += 1;
  
  if (success) {
    this.statistics.successfulSyncs += 1;
    this.status = 'active';
    this.lastError = undefined;
  } else {
    this.statistics.failedSyncs += 1;
    this.status = 'error';
    if (error) {
      this.lastError = {
        message: error.message,
        timestamp: new Date(),
        code: error.code || 'UNKNOWN'
      };
    }
  }
  
  // Update average sync duration
  if (duration > 0) {
    this.statistics.lastSyncDuration = duration;
    const currentAvg = this.statistics.avgSyncDuration || 0;
    const count = this.statistics.totalSyncs;
    this.statistics.avgSyncDuration = ((currentAvg * (count - 1)) + duration) / count;
  }
  
  return this.save();
};

// Static methods
syncStatusSchema.statics.getActiveDevices = function(userId) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  return this.find({
    userId,
    lastSync: { $gte: cutoff },
    status: { $ne: 'inactive' }
  }).sort({ lastSync: -1 });
};

module.exports = mongoose.model('SyncStatus', syncStatusSchema);