// server/models/WindowTrackingRule.js
const mongoose = require('mongoose');

const windowTrackingRuleSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
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
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  priority: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  conditions: {
    domain: {
      type: String,
      trim: true
    },
    titlePattern: {
      type: String,
      trim: true
    },
    appName: {
      type: String,
      trim: true
    },
    urlPattern: {
      type: String,
      trim: true
    },
    timeConditions: {
      enabled: {
        type: Boolean,
        default: false
      },
      startTime: String, // "09:00"
      endTime: String,   // "17:00"
      daysOfWeek: [{
        type: Number,
        min: 0,
        max: 6
      }], // 0 = Sunday, 6 = Saturday
      timezone: {
        type: String,
        default: 'UTC'
      }
    }
  },
  actionConfig: {
    action: {
      type: String,
      enum: ['start_timer', 'stop_timer', 'switch_project', 'suggest_project', 'pause_timer', 'tag_entry'],
      required: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    description: {
      type: String,
      maxlength: 200
    },
    tags: [{
      type: String,
      trim: true
    }],
    notifyUser: {
      type: Boolean,
      default: true
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.8
    },
    autoExecute: {
      type: Boolean,
      default: false
    },
    cooldownPeriod: {
      type: Number,
      default: 300000 // 5 minutes in milliseconds
    }
  },
  analytics: {
    triggerCount: {
      type: Number,
      default: 0
    },
    successCount: {
      type: Number,
      default: 0
    },
    lastTriggered: Date,
    avgConfidence: {
      type: Number,
      default: 0
    },
    learningData: {
      acceptedSuggestions: {
        type: Number,
        default: 0
      },
      rejectedSuggestions: {
        type: Number,
        default: 0
      }
    }
  },
  metadata: {
    createdBy: {
      type: String,
      enum: ['user', 'system', 'ai'],
      default: 'user'
    },
    source: {
      type: String,
      enum: ['manual', 'pattern_detection', 'ai_suggestion'],
      default: 'manual'
    },
    version: {
      type: Number,
      default: 1
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
windowTrackingRuleSchema.index({ userId: 1, enabled: 1, priority: -1 });
windowTrackingRuleSchema.index({ userId: 1, 'conditions.domain': 1 });
windowTrackingRuleSchema.index({ userId: 1, 'conditions.appName': 1 });

// Virtual for success rate
windowTrackingRuleSchema.virtual('successRate').get(function() {
  if (this.analytics.triggerCount === 0) return 0;
  return (this.analytics.successCount / this.analytics.triggerCount) * 100;
});

// Instance methods
windowTrackingRuleSchema.methods.recordTrigger = function(wasSuccessful = false, confidence = null) {
  this.analytics.triggerCount += 1;
  if (wasSuccessful) {
    this.analytics.successCount += 1;
  }
  this.analytics.lastTriggered = new Date();
  
  if (confidence !== null) {
    // Update running average confidence
    const currentAvg = this.analytics.avgConfidence || 0;
    const count = this.analytics.triggerCount;
    this.analytics.avgConfidence = ((currentAvg * (count - 1)) + confidence) / count;
  }
  
  return this.save();
};

windowTrackingRuleSchema.methods.recordUserFeedback = function(accepted = true) {
  if (accepted) {
    this.analytics.learningData.acceptedSuggestions += 1;
  } else {
    this.analytics.learningData.rejectedSuggestions += 1;
  }
  
  return this.save();
};

// Static methods
windowTrackingRuleSchema.statics.getActiveRules = function(userId) {
  return this.find({ userId, enabled: true }).sort({ priority: -1, createdAt: -1 });
};

windowTrackingRuleSchema.statics.findMatchingRules = function(userId, windowData) {
  const query = { userId, enabled: true };
  const orConditions = [];
  
  if (windowData.domain) {
    orConditions.push({ 'conditions.domain': { $regex: windowData.domain, $options: 'i' } });
  }
  
  if (windowData.app) {
    orConditions.push({ 'conditions.appName': { $regex: windowData.app, $options: 'i' } });
  }
  
  if (windowData.title) {
    orConditions.push({ 'conditions.titlePattern': { $regex: windowData.title, $options: 'i' } });
  }
  
  if (windowData.url) {
    orConditions.push({ 'conditions.urlPattern': { $regex: windowData.url, $options: 'i' } });
  }
  
  if (orConditions.length > 0) {
    query.$or = orConditions;
  }
  
  return this.find(query).sort({ priority: -1 });
};

module.exports = mongoose.model('WindowTrackingRule', windowTrackingRuleSchema);