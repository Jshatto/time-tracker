// shared/sync-protocol.js
class SyncProtocol {
    constructor() {
        this.version = '1.0.0';
        this.conflictResolvers = new Map();
        
        // Register default conflict resolvers
        this.registerResolver('timestamp', this.timestampResolver);
        this.registerResolver('user_preference', this.userPreferenceResolver);
        this.registerResolver('merge', this.mergeResolver);
    }
    
    // Register conflict resolution strategies
    registerResolver(strategy, resolver) {
        this.conflictResolvers.set(strategy, resolver);
    }
    
    // Create sync request
    createSyncRequest(deviceId, lastSync, localChanges) {
        return {
            version: this.version,
            deviceId,
            lastSync,
            timestamp: Date.now(),
            changes: this.prepareChanges(localChanges),
            metadata: this.getDeviceMetadata()
        };
    }
    
    prepareChanges(changes) {
        return changes.map(change => ({
            id: change.id,
            type: change.type,
            action: change.action, // 'create', 'update', 'delete'
            data: change.data,
            timestamp: change.timestamp,
            checksum: this.calculateChecksum(change.data)
        }));
    }
    
    calculateChecksum(data) {
        // Simple checksum for data integrity
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }
    
    getDeviceMetadata() {
        if (typeof window !== 'undefined') {
            return {
                platform: 'web',
                userAgent: navigator.userAgent,
                timestamp: Date.now()
            };
        } else if (typeof process !== 'undefined') {
            return {
                platform: process.platform,
                nodeVersion: process.version,
                timestamp: Date.now()
            };
        }
        return { platform: 'unknown', timestamp: Date.now() };
    }
    
    // Process sync response
    processSyncResponse(response, localData) {
        const result = {
            conflicts: [],
            applied: [],
            errors: []
        };
        
        if (!response.success) {
            result.errors.push({
                type: 'sync_error',
                message: response.error
            });
            return result;
        }
        
        const serverChanges = response.serverChanges || [];
        
        // Process each server change
        for (const serverChange of serverChanges) {
            try {
                const conflict = this.detectConflict(serverChange, localData);
                
                if (conflict) {
                    const resolution = this.resolveConflict(conflict);
                    result.conflicts.push(resolution);
                    
                    if (resolution.resolved) {
                        this.applyChange(resolution.resolvedData, localData);
                        result.applied.push(resolution.resolvedData);
                    }
                } else {
                    this.applyChange(serverChange, localData);
                    result.applied.push(serverChange);
                }
            } catch (error) {
                result.errors.push({
                    type: 'processing_error',
                    change: serverChange,
                    error: error.message
                });
            }
        }
        
        return result;
    }
    
    detectConflict(serverChange, localData) {
        const localItem = this.findLocalItem(serverChange.id, serverChange.type, localData);
        
        if (!localItem) {
            return null; // No conflict, it's a new item
        }
        
        // Check for modification conflict
        if (localItem.lastModified && serverChange.lastModified) {
            if (localItem.lastModified !== serverChange.lastModified) {
                return {
                    id: serverChange.id,
                    type: serverChange.type,
                    local: localItem,
                    server: serverChange,
                    conflictType: 'modification'
                };
            }
        }
        
        // Check data differences
        const localChecksum = this.calculateChecksum(localItem.data);
        const serverChecksum = this.calculateChecksum(serverChange.data);
        
        if (localChecksum !== serverChecksum) {
            return {
                id: serverChange.id,
                type: serverChange.type,
                local: localItem,
                server: serverChange,
                conflictType: 'data_mismatch'
            };
        }
        
        return null;
    }
    
    findLocalItem(id, type, localData) {
        const collection = localData[type] || [];
        return collection.find(item => item.id === id);
    }
    
    resolveConflict(conflict, strategy = 'timestamp') {
        const resolver = this.conflictResolvers.get(strategy);
        
        if (!resolver) {
            throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
        }
        
        return resolver(conflict);
    }
    
    // Default conflict resolution strategies
    timestampResolver(conflict) {
        const localTime = new Date(conflict.local.lastModified || conflict.local.timestamp);
        const serverTime = new Date(conflict.server.lastModified || conflict.server.timestamp);
        
        const resolved = serverTime > localTime ? conflict.server : conflict.local;
        
        return {
            ...conflict,
            strategy: 'timestamp',
            resolved: true,
            resolvedData: resolved,
            resolution: serverTime > localTime ? 'server_wins' : 'local_wins'
        };
    }
    
    userPreferenceResolver(conflict) {
        // This would typically prompt the user or use a stored preference
        // For now, default to server wins
        return {
            ...conflict,
            strategy: 'user_preference',
            resolved: true,
            resolvedData: conflict.server,
            resolution: 'server_wins'
        };
    }
    
    mergeResolver(conflict) {
        try {
            const merged = this.mergeData(conflict.local.data, conflict.server.data);
            
            return {
                ...conflict,
                strategy: 'merge',
                resolved: true,
                resolvedData: {
                    ...conflict.server,
                    data: merged
                },
                resolution: 'merged'
            };
        } catch (error) {
            // Fall back to timestamp resolution
            return this.timestampResolver(conflict);
        }
    }
    
    mergeData(localData, serverData) {
        // Simple merge strategy - combines non-conflicting fields
        const merged = { ...localData };
        
        Object.keys(serverData).forEach(key => {
            if (!(key in localData)) {
                merged[key] = serverData[key];
            } else if (typeof localData[key] === 'object' && typeof serverData[key] === 'object') {
                merged[key] = this.mergeData(localData[key], serverData[key]);
            } else if (localData[key] !== serverData[key]) {
                // For conflicting primitives, prefer server
                merged[key] = serverData[key];
            }
        });
        
        return merged;
    }
    
    applyChange(change, localData) {
        const collection = localData[change.type] || [];
        const existingIndex = collection.findIndex(item => item.id === change.id);
        
        switch (change.action) {
            case 'create':
                if (existingIndex === -1) {
                    collection.push(change.data);
                }
                break;
                
            case 'update':
                if (existingIndex >= 0) {
                    collection[existingIndex] = { ...collection[existingIndex], ...change.data };
                } else {
                    collection.push(change.data);
                }
                break;
                
            case 'delete':
                if (existingIndex >= 0) {
                    collection.splice(existingIndex, 1);
                }
                break;
        }
        
        localData[change.type] = collection;
    }
    
    // Optimize changes for transmission
    optimizeChanges(changes) {
        // Remove redundant changes (e.g., create followed by update)
        const optimized = [];
        const processedIds = new Set();
        
        // Process in reverse order to get the latest change for each item
        for (let i = changes.length - 1; i >= 0; i--) {
            const change = changes[i];
            const key = `${change.type}:${change.id}`;
            
            if (!processedIds.has(key)) {
                processedIds.add(key);
                optimized.unshift(change);
            }
        }
        
        return optimized;
    }
    
    // Validate sync data integrity
    validateSyncData(data) {
        const errors = [];
        
        if (!data.version) {
            errors.push('Missing sync protocol version');
        }
        
        if (!data.deviceId) {
            errors.push('Missing device ID');
        }
        
        if (!Array.isArray(data.changes)) {
            errors.push('Changes must be an array');
        }
        
        data.changes?.forEach((change, index) => {
            if (!change.id) {
                errors.push(`Change at index ${index} missing ID`);
            }
            
            if (!change.type) {
                errors.push(`Change at index ${index} missing type`);
            }
            
            if (!['create', 'update', 'delete'].includes(change.action)) {
                errors.push(`Change at index ${index} has invalid action`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncProtocol;
} else {
    window.SyncProtocol = SyncProtocol;
}