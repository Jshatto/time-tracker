// server/models/Project.js - FIXED
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  color: {
    type: String,
    default: '#667eea',
    match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  },
  userId: {
    type: String,
    required: true
    // ❌ REMOVED: index: true (because we have compound indexes below)
  },
  isActive: {
    type: Boolean,
    default: true
    // ❌ REMOVED: index: true (because we have compound indexes below)
  },
  hourlyRate: {
    type: Number,
    min: 0,
    default: 0
  },
  budget: {
    type: Number,
    min: 0,
    default: 0
  },
  client: {
    name: String,
    email: String,
    company: String
  },
  tags: [{
    type: String,
    trim: true
  }],
  lastUsed: {
    type: Date,
    default: Date.now
    // ❌ REMOVED: index: true (because we have compound indexes below)
  },
  archivedAt: {
    type: Date
  },
  settings: {
    trackingEnabled: {
      type: Boolean,
      default: true
    },
    requireDescription: {
      type: Boolean,
      default: false
    },
    roundTime: {
      type: String,
      enum: ['none', '15min', '30min', '1hour'],
      default: 'none'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ ONLY compound indexes (these handle single-field queries on leftmost fields)
projectSchema.index({ userId: 1, isActive: 1 });
projectSchema.index({ userId: 1, lastUsed: -1 });
projectSchema.index({ userId: 1, name: 1 }, { unique: true });

// Virtual for calculating total time tracked
projectSchema.virtual('totalTime', {
  ref: 'TimeEntry',
  localField: '_id',
  foreignField: 'projectId',
  justOne: false
});

// Instance methods
projectSchema.methods.calculateStats = async function() {
  const TimeEntry = mongoose.model('TimeEntry');
  
  const stats = await TimeEntry.aggregate([
    { $match: { projectId: this._id } },
    {
      $group: {
        _id: null,
        totalTime: { $sum: '$duration' },
        entryCount: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        lastEntry: { $max: '$startTime' },
        firstEntry: { $min: '$startTime' }
      }
    }
  ]);

  return stats[0] || {
    totalTime: 0,
    entryCount: 0,
    avgDuration: 0,
    lastEntry: null,
    firstEntry: null
  };
};

// Static methods
projectSchema.statics.getActiveProjects = function(userId) {
  return this.find({ userId, isActive: true }).sort({ lastUsed: -1 });
};

projectSchema.statics.getProjectStats = async function(userId, projectId) {
  const TimeEntry = mongoose.model('TimeEntry');
  
  const stats = await TimeEntry.aggregate([
    { $match: { userId, projectId: new mongoose.Types.ObjectId(projectId) } },
    {
      $group: {
        _id: null,
        totalTime: { $sum: '$duration' },
        entryCount: { $sum: 1 },
        revenue: { $sum: { $multiply: ['$duration', '$hourlyRate'] } }
      }
    }
  ]);

  return stats[0] || { totalTime: 0, entryCount: 0, revenue: 0 };
};

module.exports = mongoose.model('Project', projectSchema);

// ===================================================================

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

// ===================================================================

// server/models/TimeEntry.js - FIXED
const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
    // ❌ REMOVED: index: true (covered by compound indexes)
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
    // ❌ REMOVED: index: true (covered by compound indexes)
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  startTime: {
    type: Date,
    required: true
    // ❌ REMOVED: index: true (covered by compound indexes)
  },
  endTime: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value > this.startTime;
      },
      message: 'End time must be after start time'
    }
  },
  duration: {
    type: Number,
    min: 0,
    default: 0
  },
  status: {
    type: String,
    enum: ['running', 'paused', 'completed', 'cancelled'],
    default: 'running'
    // ❌ REMOVED: index: true (covered by compound indexes)
  },
  isRunning: {
    type: Boolean,
    default: true
    // ❌ REMOVED: index: true (covered by compound indexes)
  },
  tags: [{
    type: String,
    trim: true
  }],
  billable: {
    type: Boolean,
    default: true
  },
  hourlyRate: {
    type: Number,
    min: 0,
    default: 0
  },
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'desktop_app', 'browser_extension', 'mobile_app', 'api'],
      default: 'manual'
    },
    deviceInfo: {
      platform: String,
      version: String,
      userAgent: String
    },
    windowData: {
      title: String,
      app: String,
      url: String,
      domain: String,
      category: String
    },
    productivity: {
      type: Number,
      min: -1,
      max: 1,
      default: 0
    },
    focus: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    },
    autoGenerated: {
      type: Boolean,
      default: false
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 1
    },
    ruleId: String,
    sessionId: String
  },
  syncInfo: {
    lastSync: Date,
    syncVersion: {
      type: Number,
      default: 1
    },
    conflicts: [{
      field: String,
      resolvedAt: Date,
      resolution: String
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ ONLY compound indexes (no single-field duplicates)
timeEntrySchema.index({ userId: 1, startTime: -1 });
timeEntrySchema.index({ userId: 1, projectId: 1, startTime: -1 });
timeEntrySchema.index({ userId: 1, status: 1 });
timeEntrySchema.index({ startTime: 1, endTime: 1 });

// Virtual for calculated revenue
timeEntrySchema.virtual('revenue').get(function() {
  if (!this.duration || !this.hourlyRate) return 0;
  return (this.duration / (1000 * 60 * 60)) * this.hourlyRate;
});

// Virtual for formatted duration
timeEntrySchema.virtual('formattedDuration').get(function() {
  if (!this.duration) return '0m';
  
  const hours = Math.floor(this.duration / (1000 * 60 * 60));
  const minutes = Math.floor((this.duration % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
});

// Pre-save middleware to calculate duration
timeEntrySchema.pre('save', function(next) {
  if (this.startTime && this.endTime && !this.isModified('duration')) {
    this.duration = this.endTime - this.startTime;
  }
  
  if (this.endTime && this.status === 'running') {
    this.status = 'completed';
    this.isRunning = false;
  }
  
  next();
});

// Instance methods
timeEntrySchema.methods.stop = function() {
  this.endTime = new Date();
  this.status = 'completed';
  this.isRunning = false;
  this.duration = this.endTime - this.startTime;
  return this.save();
};

timeEntrySchema.methods.pause = function() {
  if (this.status === 'running') {
    this.status = 'paused';
    this.isRunning = false;
    return this.save();
  }
  throw new Error('Can only pause running timers');
};

timeEntrySchema.methods.resume = function() {
  if (this.status === 'paused') {
    this.status = 'running';
    this.isRunning = true;
    return this.save();
  }
  throw new Error('Can only resume paused timers');
};

// Static methods
timeEntrySchema.statics.getRunningTimer = function(userId) {
  return this.findOne({ userId, status: 'running' }).populate('projectId');
};

timeEntrySchema.statics.stopAllRunningTimers = function(userId) {
  return this.updateMany(
    { userId, status: 'running' },
    { 
      status: 'completed',
      endTime: new Date(),
      isRunning: false
    }
  );
};

timeEntrySchema.statics.getTimeRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    startTime: { $gte: startDate, $lte: endDate }
  }).populate('projectId').sort({ startTime: -1 });
};

timeEntrySchema.statics.getTodayEntries = function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.getTimeRange(userId, today, tomorrow);
};

module.exports = mongoose.model('TimeEntry', timeEntrySchema);

// ===================================================================

// server/models/WindowEvent.js - FIXED
const mongoose = require('mongoose');

const windowEventSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
    // ❌ REMOVED: index: true (covered by compound indexes)
  },
  eventType: {
    type: String,
    enum: ['window_change', 'window_focus', 'window_blur', 'app_switch', 'navigation'],
    required: true
    // ❌ REMOVED: index: true (covered by compound indexes)
  },
  timestamp: {
    type: Date,
    required: true
    // ❌ REMOVED: index: true (covered by compound indexes and TTL)
  },
  windowData: {
    title: String,
    app: String,
    url: String,
    domain: String,
    category: String,
    pid: Number
  },
  previousWindow: {
    title: String,
    app: String,
    url: String,
    domain: String
  },
  sessionInfo: {
    sessionId: String,
    duration: Number,
    switchCount: Number
  },
  metadata: {
    source: {
      type: String,
      enum: ['desktop_app', 'browser_extension', 'mobile_app'],
      required: true
    },
    deviceInfo: {
      platform: String,
      version: String,
      deviceId: String
    },
    productivity: {
      type: Number,
      min: -1,
      max: 1,
      default: 0
    },
    focus: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    }
  },
  processed: {
    type: Boolean,
    default: false
    // ❌ REMOVED: index: true (add separate if needed)
  },
  processingResults: {
    rulesTriggered: [{
      ruleId: mongoose.Schema.Types.ObjectId,
      action: String,
      executed: Boolean,
      timestamp: Date
    }],
    suggestions: [{
      type: String,
      data: mongoose.Schema.Types.Mixed,
      confidence: Number
    }]
  }
}, {
  timestamps: true
});

// ✅ ONLY these indexes (no duplicates)
windowEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
windowEventSchema.index({ userId: 1, timestamp: -1 });
windowEventSchema.index({ userId: 1, eventType: 1, timestamp: -1 });
windowEventSchema.index({ userId: 1, 'windowData.domain': 1, timestamp: -1 });
windowEventSchema.index({ userId: 1, 'windowData.app': 1, timestamp: -1 });
windowEventSchema.index({ processed: 1 }); // ✅ Add this if you need processed queries

// Static methods for analytics
windowEventSchema.statics.getEventsByTimeRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    timestamp: { $gte: startDate, $lte: endDate }
  }).sort({ timestamp: -1 });
};

windowEventSchema.statics.getTopApps = function(userId, timeRange = 7) {
  const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    { $match: { userId, timestamp: { $gte: startDate } } },
    { $group: { 
        _id: '$windowData.app', 
        count: { $sum: 1 },
        totalProductivity: { $sum: '$metadata.productivity' }
      } 
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
};

windowEventSchema.statics.getProductivityTrend = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    { $match: { userId, timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        },
        avgProductivity: { $avg: '$metadata.productivity' },
        avgFocus: { $avg: '$metadata.focus' },
        eventCount: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);
};

module.exports = mongoose.model('WindowEvent', windowEventSchema);