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