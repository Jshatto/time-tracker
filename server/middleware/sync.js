// middleware/sync.js - Cross-platform sync middleware
const syncMiddleware = (req, res, next) => {
  // Add sync metadata to requests
  req.syncMeta = {
    timestamp: Date.now(),
    deviceId: req.get('X-Device-ID') || 'unknown',
    platform: req.get('X-Platform') || 'web',
    version: req.get('X-Version') || '1.0.0',
    sessionId: req.get('X-Session-ID') || null
  };

  // Add sync headers to responses
  res.setSyncHeaders = (data) => {
    res.set({
      'X-Sync-Timestamp': Date.now(),
      'X-Sync-Version': '1.0.0',
      'X-Server-Time': new Date().toISOString()
    });
    return data;
  };

  next();
};

module.exports = syncMiddleware;