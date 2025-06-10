// deployment/keep-alive.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// Simple keep-alive service for Render
console.log('🚀 Starting Keep-Alive Service...');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    service: 'keep-alive'
  });
});

// Keep main service alive
const MAIN_SERVICE_URL = process.env.MAIN_SERVICE_URL || 'https://your-app-name.onrender.com';
const PING_INTERVAL = parseInt(process.env.PING_INTERVAL) || 300000; // 5 minutes

async function pingMainService() {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${MAIN_SERVICE_URL}/ping`, {
      timeout: 10000
    });
    
    if (response.ok) {
      console.log(`✅ Main service pinged successfully at ${new Date()}`);
    } else {
      console.log(`⚠️ Main service responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Failed to ping main service:`, error.message);
  }
}

// Start pinging
setInterval(pingMainService, PING_INTERVAL);

// Initial ping
pingMainService();

app.listen(PORT, () => {
  console.log(`🔄 Keep-Alive service running on port ${PORT}`);
  console.log(`📡 Pinging ${MAIN_SERVICE_URL} every ${PING_INTERVAL/1000} seconds`);
});