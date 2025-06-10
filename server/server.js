// server/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const cron = require('node-cron');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

// Import models
const Project = require('./models/Project');
const TimeEntry = require('./models/TimeEntry');
const WindowTrackingRule = require('./models/WindowTrackingRule');
const WindowEvent = require('./models/WindowEvent');
const User = require('./models/User');
const SyncStatus = require('./models/SyncStatus');

// Import routes
const projectsRouter       = require('./routes/projects');
const timeEntriesRouter    = require('./routes/timeEntries');
const windowTrackingRouter = require('./routes/windowTracking');
const analyticsRouter      = require('./routes/analytics');
const syncRouter           = require('./routes/sync');

// Import middleware
const authMiddleware       = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');
const syncMiddleware       = require('./middleware/sync');

// Import utils
const { connectDatabase } = require('./utils/database');
const { startKeepAlive }  = require('./utils/keepAlive');
const AnalyticsEngine     = require('./utils/analytics');

class FinancialCentsServer {
  constructor() {
    this.app        = express();
    this.server     = null;
    this.wss        = null;
    this.port       = process.env.PORT || 3000;
    this.isProd     = process.env.NODE_ENV === 'production';
    this.analytics  = new AnalyticsEngine();
    this.init();
  }

  async init() {
    try {
      this.setupLogging();
      await this.connectDB();
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();
      this.setupErrorHandling();
      await this.startServer();
      this.setupKeepAlive();
      this.setupScheduledTasks();
      console.log('🚀 Server started');
    } catch (err) {
      console.error('Server init failed:', err);
      process.exit(1);
    }
  }

  setupLogging() {
    const logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: process.env.ERROR_LOG_FILE || 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: process.env.LOG_FILE || 'logs/combined.log' })
      ]
    });
    if (!this.isProd) {
      logger.add(new winston.transports.Console({ format: winston.format.simple() }));
    }
    this.logger = logger;
    global.logger = logger;
  }

  async connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI missing');
   try {
    // Remove deprecated options - MongoDB driver 4.0+ doesn't need them
    await mongoose.connect(uri);
    
    this.logger.info('✅ MongoDB connected successfully');
    console.log('✅ Connected to MongoDB Atlas');
    
    mongoose.connection.on('error', err => {
      this.logger.error('MongoDB error:', err);
      console.error('❌ MongoDB error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
      console.warn('⚠️ MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      this.logger.info('MongoDB reconnected');
      console.log('🔄 MongoDB reconnected');
    });
    
  } catch (error) {
    this.logger.error('MongoDB connection failed:', error);
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}
  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' , credentials: true }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(rateLimit({ windowMs: +process.env.RATE_LIMIT_WINDOW_MS || 15*60*1000, max: +process.env.RATE_LIMIT_MAX_REQUESTS || 1000 }));
    // Custom
    this.app.use(syncMiddleware);
  }

  // In your setupRoutes() method, add this line:
setupRoutes() {
  // Health
  this.app.get('/health', (req,res) => res.json({ status:'ok', uptime:process.uptime(), timestamp: new Date() }));
  this.app.get('/ping', (req,res) => res.json({ pong:true, timestamp:new Date() }));
  
// Apply auth middleware to all requests (optional)
this.app.use(require('./middleware/auth'));
  // API
this.app.use('/api/auth', require('./routes/auth'));     // ← ADD THIS LINE
  this.app.use('/api/projects', projectsRouter);
  this.app.use('/api/time-entries', timeEntriesRouter);
  this.app.use('/api/window-tracking', windowTrackingRouter);
  this.app.use('/api/analytics', analyticsRouter);
  this.app.use('/api/sync', syncRouter);

  // Static & SPA fallback
  this.app.use(express.static(path.join(__dirname, 'public')));
  this.app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
}

  setupWebSocket() {
    this.wss = new WebSocket.Server({ port: +process.env.WS_PORT || 8080 });
    this.wss.on('connection', ws => {
      ws.on('message', msg => {/* handle */});
    });
    this.logger.info('WebSocket listening');
  }

  setupErrorHandling() {
    // 404
    this.app.use((req,res) => res.status(404).json({ error:'Not Found' }));
    // global
    this.app.use((err,req,res,next) => {
      this.logger.error(err);
      res.status(err.status||500).json({ error: this.isProd ? 'Internal' : err.message });
    });
  }

  async startServer() {
    return new Promise((res,rej) => {
      this.server = this.app.listen(this.port, err => err ? rej(err) : res());
    });
  }

  setupKeepAlive() {
    if (process.env.ENABLE_KEEP_ALIVE==='true') startKeepAlive({
      interval: +process.env.KEEP_ALIVE_INTERVAL || 300000,
      endpoints: JSON.parse(process.env.PING_ENDPOINTS||'[]'),
      logger: this.logger
    });
  }

  setupScheduledTasks() {
    // cleanup
    cron.schedule('0 2 * * *', async ()=>{ await WindowEvent.deleteMany({ createdAt:{ $lt: new Date(Date.now()- (process.env.ANALYTICS_RETENTION_DAYS||90)*24*3600*1000) } }); });
    // daily report
    cron.schedule('0 1 * * *', async ()=>{ await this.analytics.generateDailyReport(); });
  }
}

// Start
const server = new FinancialCentsServer();
module.exports = server;
