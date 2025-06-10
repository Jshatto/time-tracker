// server/models/SyncStatus.js - FIXED
const mongoose = require('mongoose');

const syncStatusSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
    // ❌ REMOVED: index: true (covered by compound index below)
  },
  deviceId: {
    type: String,
    required: true
    // ❌ REMOVED: index: true (covered by compound index below)
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
    lastSyncDuration: Number,
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

// ✅ ONLY these indexes (no duplicates)
syncStatusSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
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
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.find({
    userId,
    lastSync: { $gte: cutoff },
    status: { $ne: 'inactive' }
  }).sort({ lastSync: -1 });
};

module.exports = mongoose.model('SyncStatus', syncStatusSchema);