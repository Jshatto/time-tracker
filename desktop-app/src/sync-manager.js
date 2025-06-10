const fetch = require('node-fetch');
const Store = require('electron-store');

class SyncManager {
  constructor(mainApp) {
    this.app = mainApp;
    this.store = new Store();
    this.syncQueue = [];
    this.lastSync = this.store.get('lastSync', 0);
    this.isSyncing = false;
    this.syncInterval = null;
  }

  async init() {
    console.log('🔄 Initializing Sync Manager...');
    
    // Load queued items from storage
    this.syncQueue = this.store.get('syncQueue', []);
    
    // Start periodic sync
    this.startPeriodicSync();
    
    console.log('✅ Sync Manager initialized');
  }

  startPeriodicSync() {
    const interval = this.store.get('sync.syncInterval', 30000);
    
    this.syncInterval = setInterval(async () => {
      if (this.store.get('sync.autoSync', true)) {
        await this.performSync();
      }
    }, interval);
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async performSync() {
    if (this.isSyncing) return { success: false, error: 'Sync already in progress' };
    
    this.isSyncing = true;
    
    try {
      const serverUrl = this.store.get('serverUrl');
      if (!serverUrl) {
        throw new Error('Server URL not configured');
      }

      console.log('🔄 Starting sync...');

      // Check if server is online
      const isOnline = await this.checkServerConnection();
      if (!isOnline) {
        throw new Error('Server is not reachable');
      }

      // Prepare sync data
      const syncData = {
        lastSync: this.lastSync,
        deviceId: this.getDeviceId(),
        platform: 'desktop',
        data: {
          timeEntries: this.getQueuedTimeEntries(),
          windowEvents: this.getQueuedWindowEvents(),
          rules: this.getQueuedRules()
        }
      };

      // Send sync request
      const response = await fetch(`${serverUrl}/sync/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': this.getDeviceId(),
          'X-Platform': 'desktop-app',
          'X-Version': this.app.version || '2.0.0'
        },
        body: JSON.stringify(syncData),
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Process server changes
      await this.processServerChanges(result.serverChanges);
      
      // Clear successfully synced items
      this.clearSyncedItems();
      
      // Update last sync time
      this.lastSync = Date.now();
      this.store.set('lastSync', this.lastSync);

      console.log('✅ Sync completed successfully');
      
      return { 
        success: true, 
        data: result,
        timestamp: this.lastSync
      };

    } catch (error) {
      console.error('❌ Sync failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  async checkServerConnection() {
    try {
      const serverUrl = this.store.get('serverUrl');
      const response = await fetch(`${serverUrl}/ping`, {
        method: 'GET',
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  queueTimeEntry(action, data) {
    const item = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'timeEntry',
      action, // 'create', 'update', 'delete'
      data,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.syncQueue.push(item);
    this.store.set('syncQueue', this.syncQueue);
    
    console.log(`📝 Queued ${action} time entry:`, data.id || 'new');
  }

  queueWindowEvent(eventData) {
    const item = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'windowEvent',
      action: 'create',
      data: eventData,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.syncQueue.push(item);
    
    // Auto-flush if queue gets too large
    if (this.syncQueue.length > 100) {
      this.syncQueue = this.syncQueue.slice(-50); // Keep only recent items
    }
    
    this.store.set('syncQueue', this.syncQueue);
  }

  getQueuedTimeEntries() {
    return this.syncQueue
      .filter(item => item.type === 'timeEntry')
      .map(item => ({
        action: item.action,
        data: item.data,
        timestamp: item.timestamp
      }));
  }

  getQueuedWindowEvents() {
    return this.syncQueue
      .filter(item => item.type === 'windowEvent')
      .map(item => item.data);
  }

  getQueuedRules() {
    return this.syncQueue
      .filter(item => item.type === 'rule')
      .map(item => ({
        action: item.action,
        data: item.data,
        timestamp: item.timestamp
      }));
  }

  async processServerChanges(serverChanges) {
    if (!serverChanges) return;

    // Process time entries from server
    if (serverChanges.timeEntries) {
      for (const entry of serverChanges.timeEntries) {
        await this.mergeTimeEntry(entry);
      }
    }

    // Process projects from server
    if (serverChanges.projects) {
      for (const project of serverChanges.projects) {
        await this.mergeProject(project);
      }
    }

    // Process rules from server
    if (serverChanges.rules) {
      for (const rule of serverChanges.rules) {
        await this.mergeRule(rule);
      }
    }
  }

  async mergeTimeEntry(serverEntry) {
    // Simple merge strategy - server wins for now
    // In a real implementation, you'd want more sophisticated conflict resolution
    
    const localEntries = this.store.get('timeEntries', []);
    const existingIndex = localEntries.findIndex(entry => entry.id === serverEntry._id);
    
    if (existingIndex >= 0) {
      // Update existing entry
      localEntries[existingIndex] = {
        ...localEntries[existingIndex],
        ...serverEntry,
        id: serverEntry._id,
        lastSync: Date.now()
      };
    } else {
      // Add new entry
      localEntries.push({
        ...serverEntry,
        id: serverEntry._id,
        lastSync: Date.now()
      });
    }
    
    this.store.set('timeEntries', localEntries);
  }

  async mergeProject(serverProject) {
    const localProjects = this.store.get('projects', []);
    const existingIndex = localProjects.findIndex(project => project.id === serverProject._id);
    
    if (existingIndex >= 0) {
      localProjects[existingIndex] = {
        ...localProjects[existingIndex],
        ...serverProject,
        id: serverProject._id,
        lastSync: Date.now()
      };
    } else {
      localProjects.push({
        ...serverProject,
        id: serverProject._id,
        lastSync: Date.now()
      });
    }
    
    this.store.set('projects', localProjects);
  }

  async mergeRule(serverRule) {
    const localRules = this.store.get('windowRules', []);
    const existingIndex = localRules.findIndex(rule => rule.id === serverRule._id);
    
    if (existingIndex >= 0) {
      localRules[existingIndex] = {
        ...localRules[existingIndex],
        ...serverRule,
        id: serverRule._id,
        lastSync: Date.now()
      };
    } else {
      localRules.push({
        ...serverRule,
        id: serverRule._id,
        lastSync: Date.now()
      });
    }
    
    this.store.set('windowRules', localRules);
  }

  clearSyncedItems() {
    // Remove successfully synced items from queue
    this.syncQueue = this.syncQueue.filter(item => {
      // Keep items that failed to sync (for retry)
      return item.retryCount > 0;
    });
    
    this.store.set('syncQueue', this.syncQueue);
  }

  getDeviceId() {
    let deviceId = this.store.get('deviceId');
    if (!deviceId) {
      deviceId = `desktop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.store.set('deviceId', deviceId);
    }
    return deviceId;
  }

  getSyncStatus() {
    return {
      lastSync: this.lastSync,
      queueLength: this.syncQueue.length,
      isSyncing: this.isSyncing,
      deviceId: this.getDeviceId(),
      autoSync: this.store.get('sync.autoSync', true)
    };
  }

  async forceSync() {
    return await this.performSync();
  }

  destroy() {
    this.stopPeriodicSync();
  }
}

module.exports = SyncManager;