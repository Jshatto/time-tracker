// browser-extension/sync-manager.js (FIXED TYPO)
class ExtensionSyncManager {
    constructor(extension) {
        this.extension = extension;
        this.syncQueue = [];
        this.lastSync = 0;
        this.isSyncing = false;
        this.syncInterval = null;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async init() {
        console.log('🔄 Initializing Extension Sync Manager...');
        
        // Load sync data from storage
        await this.loadSyncData();
        
        // Start periodic sync
        this.startPeriodicSync();
        
        console.log('✅ Extension Sync Manager initialized');
    }

    async loadSyncData() {
        try {
            const stored = await chrome.storage.local.get(['syncData', 'syncQueue']);
            this.lastSync = stored.syncData?.lastSync || 0;
            this.syncQueue = stored.syncQueue || [];
        } catch (error) {
            console.error('Error loading sync data:', error);
        }
    }

    startPeriodicSync() {
        // Sync every 30 seconds
        this.syncInterval = setInterval(async () => {
            if (this.extension.state.isOnline) {
                await this.performSync();
            }
        }, 30000);
    }

    async performSync() {
        if (this.isSyncing || !this.extension.state.isOnline) return;
        
        this.isSyncing = true;
        
        try {
            console.log('🔄 Starting sync...');
            
            const response = await fetch(`${this.extension.state.currentApiUrl}/sync/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-ID': await this.getDeviceId(),
                    'X-Platform': 'browser-extension'
                },
                body: JSON.stringify({
                    lastSync: this.lastSync,
                    data: {
                        syncQueue: this.syncQueue
                    }
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.lastSync = Date.now();
                this.syncQueue = []; // Clear queue on successful sync
                this.retryCount = 0;
                
                await chrome.storage.local.set({
                    syncData: { lastSync: this.lastSync },
                    syncQueue: this.syncQueue
                });
                
                console.log('✅ Sync completed successfully');
                this.extension.broadcastMessage('sync:success', { timestamp: this.lastSync });
                
                return { success: true, data: result };
            } else {
                throw new Error(`Sync failed: ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Sync failed:', error);
            this.retryCount++;
            
            if (this.retryCount >= this.maxRetries) {
                this.extension.state.isOnline = false;
                this.extension.broadcastMessage('sync:error', { error: error.message });
            }
            
            return { success: false, error: error.message };
        } finally {
            this.isSyncing = false;
        }
    }

    async createTimeEntry(entryData) {
        try {
            if (this.extension.state.isOnline) {
                const response = await fetch(`${this.extension.state.currentApiUrl}/time-entries`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Device-ID': await this.getDeviceId()
                    },
                    body: JSON.stringify(entryData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    return { success: true, data: result };
                }
            }
            
            // Fallback to offline queue
            const localEntry = {
                ...entryData,
                id: `local_${Date.now()}`,
                _pendingSync: true
            };
            
            this.queueSync('create', 'timeEntry', localEntry);
            
            return { success: true, data: localEntry };
        } catch (error) {
            console.error('Error creating time entry:', error);
            return { success: false, error: error.message };
        }
    }

    async updateTimeEntry(entryId, updateData) {
        try {
            if (this.extension.state.isOnline && !entryId.startsWith('local_')) {
                const response = await fetch(`${this.extension.state.currentApiUrl}/time-entries/${entryId}`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Device-ID': await this.getDeviceId()
                    },
                    body: JSON.stringify(updateData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    return { success: true, data: result };
                }
            }
            
            // Fallback to offline queue
            this.queueSync('update', 'timeEntry', { id: entryId, ...updateData });
            
            return { success: true, data: { ...updateData, id: entryId } };
        } catch (error) {
            console.error('Error updating time entry:', error);
            return { success: false, error: error.message };
        }
    }

    async getProjects() {
        try {
            if (this.extension.state.isOnline) {
                const response = await fetch(`${this.extension.state.currentApiUrl}/projects`, {
                    headers: {
                        'X-Device-ID': await this.getDeviceId()
                    }
                });
                
                if (response.ok) {
                    const projects = await response.json();
                    // Cache for offline use
                    await chrome.storage.local.set({ cachedProjects: projects });
                    return projects;
                }
            }
            
            // Fallback to cached data
            const cached = await chrome.storage.local.get(['cachedProjects']);
            return cached.cachedProjects || [
                {
                    _id: 'default-project',
                    name: 'General Work',
                    color: '#667eea',
                    isActive: true
                }
            ];
        } catch (error) {
            console.error('Error getting projects:', error);
            return [];
        }
    }

    queueSync(action, type, data) {
        const item = {
            id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            action,
            type,
            data,
            timestamp: Date.now(),
            retryCount: 0
        };

        this.syncQueue.push(item);
        
        // Save to storage
        chrome.storage.local.set({ syncQueue: this.syncQueue });
        
        console.log(`📝 Queued ${action} ${type}:`, data.id || 'new');
    }

    async forceSync() {
        return await this.performSync();
    }

    async getDeviceId() {
        let stored = await chrome.storage.local.get(['deviceId']);
        if (!stored.deviceId) {
            stored.deviceId = 'ext_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            await chrome.storage.local.set({ deviceId: stored.deviceId });
        }
        return stored.deviceId;
    }

    getSyncStatus() {
        return {
            lastSync: this.lastSync,
            queueLength: this.syncQueue.length,
            isSyncing: this.isSyncing,
            isOnline: this.extension.state.isOnline,
            retryCount: this.retryCount
        };
    }

    destroy() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
}