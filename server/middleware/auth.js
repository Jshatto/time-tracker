// middleware/auth.js - Simple auth for demo (no user registration)
const jwt = require('jsonwebtoken');

// Simple demo auth - creates anonymous user sessions
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') || 
                req.header('X-Auth-Token') ||
                req.query.token;

  if (!token) {
    // Create anonymous user for demo
    req.user = {
      id: 'demo-user-' + Date.now(),
      email: 'demo@financialcents.com',
      name: 'Demo User'
    };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // Fallback to demo user
    req.user = {
      id: 'demo-user-' + Date.now(),
      email: 'demo@financialcents.com',
      name: 'Demo User'
    };
    next();
  }
};

module.exports = authMiddleware;

