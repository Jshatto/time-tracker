// server/utils/keepAlive.js
const axios = require('axios');

class KeepAliveService {
  constructor() {
    this.isEnabled = process.env.ENABLE_KEEP_ALIVE === 'true';
    this.interval = parseInt(process.env.KEEP_ALIVE_INTERVAL) || 300000; // 5 minutes
    this.serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    this.pingEndpoints = this.parsePingEndpoints();
    this.intervalId = null;
    this.stats = {
      totalPings: 0,
      successfulPings: 0,
      failedPings: 0,
      lastPing: null,
      lastError: null
    };
  }

  parsePingEndpoints() {
    try {
      const endpoints = process.env.PING_ENDPOINTS;
      if (endpoints) {
        return JSON.parse(endpoints);
      }
    } catch (error) {
      console.log('Invalid PING_ENDPOINTS format, using defaults');
    }
    return ['https://uptimerobot.com', 'https://healthchecks.io'];
  }

  start() {
    if (!this.isEnabled) {
      console.log('⏸️ Keep-alive service is disabled');
      return;
    }

    console.log(`🔄 Starting keep-alive service (interval: ${this.interval}ms)`);
    
    // Initial ping
    this.performKeepAlive();
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.performKeepAlive();
    }, this.interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏹️ Keep-alive service stopped');
    }
  }

  async performKeepAlive() {
    this.stats.totalPings++;
    this.stats.lastPing = new Date();

    try {
      // Ping self to keep server awake
      await this.pingSelf();
      
      // Ping external endpoints to simulate traffic
      await this.pingExternalEndpoints();
      
      this.stats.successfulPings++;
      console.log(`💚 Keep-alive ping successful (${this.stats.successfulPings}/${this.stats.totalPings})`);
      
    } catch (error) {
      this.stats.failedPings++;
      this.stats.lastError = error.message;
      console.error(`❌ Keep-alive ping failed:`, error.message);
    }
  }

  async pingSelf() {
    try {
      const response = await axios.get(`${this.serverUrl}/ping`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'KeepAlive-Service/1.0',
          'X-Keep-Alive': 'internal'
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Self-ping failed with status: ${response.status}`);
      }
      
    } catch (error) {
      // If self-ping fails, try localhost
      try {
        await axios.get('http://localhost:3000/ping', {
          timeout: 5000,
          headers: { 'X-Keep-Alive': 'internal-localhost' }
        });
      } catch (localError) {
        throw new Error(`Both external and local pings failed: ${error.message}`);
      }
    }
  }

  async pingExternalEndpoints() {
    const pingPromises = this.pingEndpoints.map(async (endpoint) => {
      try {
        await axios.get(endpoint, {
          timeout: 5000,
          headers: {
            'User-Agent': 'HealthCheck/1.0'
          }
        });
      } catch (error) {
        // External ping failures are non-critical
        console.log(`External ping to ${endpoint} failed: ${error.message}`);
      }
    });

    await Promise.allSettled(pingPromises);
  }

  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.lastPing ? Date.now() - this.stats.lastPing.getTime() : 0,
      successRate: this.stats.totalPings > 0 ? 
        (this.stats.successfulPings / this.stats.totalPings * 100).toFixed(2) : 0
    };
  }

  // Health check endpoint data
  getHealthStatus() {
    const stats = this.getStats();
    return {
      service: 'keep-alive',
      status: this.isEnabled ? 'enabled' : 'disabled',
      interval: this.interval,
      stats,
      lastPing: stats.lastPing,
      isHealthy: stats.successRate > 80 || stats.totalPings < 3
    };
  }
}

module.exports = KeepAliveService;