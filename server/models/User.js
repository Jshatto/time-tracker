// server/models/User.js (for future authentication)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true, // ← This creates the index automatically
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true // ← Index for queries filtering by active status
  },
  preferences: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    dateFormat: {
      type: String,
      enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
      default: 'MM/DD/YYYY'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '12h'
    },
    defaultProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      browser: {
        type: Boolean,
        default: true
      },
      desktop: {
        type: Boolean,
        default: true
      }
    },
    privacy: {
      trackWindowTitles: {
        type: Boolean,
        default: true
      },
      shareAnalytics: {
        type: Boolean,
        default: false
      }
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'team'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active'
    },
    renewsAt: Date,
    features: {
      maxProjects: {
        type: Number,
        default: 5
      },
      windowTracking: {
        type: Boolean,
        default: true
      },
      analytics: {
        type: Boolean,
        default: true
      },
      apiAccess: {
        type: Boolean,
        default: false
      }
    }
  },
  lastLogin: {
    type: Date,
    index: true // ← Useful for analytics queries
  },
  loginCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true, // ← This creates createdAt/updatedAt with indexes automatically
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      return ret;
    }
  }
});

// ❌ REMOVED: userSchema.index({ email: 1 }); 
// ↑ This was causing the duplicate index warning!

// ✅ Only add compound indexes (indexes on multiple fields):
userSchema.index({ isActive: 1, lastLogin: -1 }); // For active user queries sorted by login
userSchema.index({ 'subscription.plan': 1, isActive: 1 }); // For subscription queries

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  this.loginCount += 1;
  return this.save();
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);