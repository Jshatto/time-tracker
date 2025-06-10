// server/models/WindowEvent.js
const mongoose = require('mongoose');

const windowEventSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  eventType: {
    type: String,
    enum: ['window_change', 'window_focus', 'window_blur', 'app_switch', 'navigation'],
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
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
    duration: Number, // Time spent in previous window
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
    default: false,
    index: true
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

// TTL index to automatically delete old events (30 days)
windowEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Compound indexes for analytics queries
windowEventSchema.index({ userId: 1, timestamp: -1 });
windowEventSchema.index({ userId: 1, eventType: 1, timestamp: -1 });
windowEventSchema.index({ userId: 1, 'windowData.domain': 1, timestamp: -1 });
windowEventSchema.index({ userId: 1, 'windowData.app': 1, timestamp: -1 });

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
