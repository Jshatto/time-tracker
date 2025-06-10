// shared/conflict-resolution.js
class ConflictResolver {
    constructor() {
        this.strategies = new Map();
        this.userCallbacks = new Map();
        
        // Register built-in strategies
        this.registerStrategy('server_wins', this.serverWinsStrategy);
        this.registerStrategy('client_wins', this.clientWinsStrategy);
        this.registerStrategy('latest_timestamp', this.latestTimestampStrategy);
        this.registerStrategy('merge_fields', this.mergeFieldsStrategy);
        this.registerStrategy('user_choice', this.userChoiceStrategy);
        this.registerStrategy('custom_merge', this.customMergeStrategy);
    }
    
    registerStrategy(name, strategy) {
        this.strategies.set(name, strategy);
    }
    
    registerUserCallback(conflictType, callback) {
        this.userCallbacks.set(conflictType, callback);
    }
    
    async resolveConflict(conflict, strategy = 'latest_timestamp') {
        const resolver = this.strategies.get(strategy);
        
        if (!resolver) {
            throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
        }
        
        try {
            const result = await resolver.call(this, conflict);
            
            return {
                ...conflict,
                resolved: true,
                strategy: strategy,
                resolvedData: result.data,
                resolution: result.resolution,
                metadata: {
                    resolvedAt: new Date().toISOString(),
                    resolver: strategy,
                    ...result.metadata
                }
            };
        } catch (error) {
            return {
                ...conflict,
                resolved: false,
                error: error.message,
                strategy: strategy
            };
        }
    }
    
    // Built-in conflict resolution strategies
    
    serverWinsStrategy(conflict) {
        return {
            data: conflict.server,
            resolution: 'server_wins',
            metadata: {
                reason: 'Server data takes precedence'
            }
        };
    }
    
    clientWinsStrategy(conflict) {
        return {
            data: conflict.client,
            resolution: 'client_wins',
            metadata: {
                reason: 'Client data takes precedence'
            }
        };
    }
    
    latestTimestampStrategy(conflict) {
        const serverTime = this.extractTimestamp(conflict.server);
        const clientTime = this.extractTimestamp(conflict.client);
        
        if (serverTime > clientTime) {
            return {
                data: conflict.server,
                resolution: 'server_wins',
                metadata: {
                    reason: 'Server has more recent timestamp',
                    serverTime,
                    clientTime
                }
            };
        } else if (clientTime > serverTime) {
            return {
                data: conflict.client,
                resolution: 'client_wins',
                metadata: {
                    reason: 'Client has more recent timestamp',
                    serverTime,
                    clientTime
                }
            };
        } else {
            // Same timestamp, fall back to server wins
            return {
                data: conflict.server,
                resolution: 'server_wins',
                metadata: {
                    reason: 'Identical timestamps, defaulting to server',
                    serverTime,
                    clientTime
                }
            };
        }
    }
    
    mergeFieldsStrategy(conflict) {
        const merged = this.mergeObjects(conflict.client, conflict.server);
        
        return {
            data: merged,
            resolution: 'merged',
            metadata: {
                reason: 'Fields merged automatically',
                mergedFields: this.identifyMergedFields(conflict.client, conflict.server, merged)
            }
        };
    }
    
    async userChoiceStrategy(conflict) {
        const callback = this.userCallbacks.get(conflict.type) || 
                         this.userCallbacks.get('default');
        
        if (!callback) {
            // Fall back to latest timestamp if no user callback
            return this.latestTimestampStrategy(conflict);
        }
        
        try {
            const userChoice = await callback(conflict);
            
            return {
                data: userChoice.data,
                resolution: 'user_choice',
                metadata: {
                    reason: 'Resolved by user choice',
                    userSelection: userChoice.selection
                }
            };
        } catch (error) {
            throw new Error(`User choice resolution failed: ${error.message}`);
        }
    }
    
    customMergeStrategy(conflict) {
        // Apply custom merge logic based on data type
        switch (conflict.type) {
            case 'timeEntry':
                return this.mergeTimeEntry(conflict);
            case 'project':
                return this.mergeProject(conflict);
            case 'windowRule':
                return this.mergeWindowRule(conflict);
            default:
                return this.mergeFieldsStrategy(conflict);
        }
    }
    
    // Type-specific merge strategies
    
    mergeTimeEntry(conflict) {
        const server = conflict.server;
        const client = conflict.client;
        
        // For time entries, prefer server for core timing data, client for metadata
        const merged = {
            ...server,
            description: client.description || server.description,
            tags: [...new Set([...(server.tags || []), ...(client.tags || [])])],
            metadata: {
                ...server.metadata,
                ...client.metadata,
                mergedAt: new Date().toISOString()
            }
        };
        
        return {
            data: merged,
            resolution: 'custom_merge',
            metadata: {
                reason: 'Time entry custom merge: server timing, client metadata'
            }
        };
    }
    
    mergeProject(conflict) {
        const server = conflict.server;
        const client = conflict.client;
        
        // For projects, merge settings and preserve user customizations
        const merged = {
            ...server,
            name: client.name || server.name,
            description: client.description || server.description,
            color: client.color || server.color,
            settings: {
                ...server.settings,
                ...client.settings
            },
            tags: [...new Set([...(server.tags || []), ...(client.tags || [])])]
        };
        
        return {
            data: merged,
            resolution: 'custom_merge',
            metadata: {
                reason: 'Project custom merge: combined settings and metadata'
            }
        };
    }
    
    mergeWindowRule(conflict) {
        const server = conflict.server;
        const client = conflict.client;
        
        // For window rules, prefer client configurations but server analytics
        const merged = {
            ...client,
            analytics: {
                ...client.analytics,
                ...server.analytics,
                // Combine trigger counts
                triggerCount: (client.analytics?.triggerCount || 0) + 
                             (server.analytics?.triggerCount || 0),
                successCount: (client.analytics?.successCount || 0) + 
                             (server.analytics?.successCount || 0)
            }
        };
        
        return {
            data: merged,
            resolution: 'custom_merge',
            metadata: {
                reason: 'Window rule custom merge: client config, combined analytics'
            }
        };
    }
    
    // Utility methods
    
    extractTimestamp(data) {
        return new Date(
            data.updatedAt || 
            data.lastModified || 
            data.timestamp || 
            data.createdAt || 
            0
        ).getTime();
    }
    
    mergeObjects(obj1, obj2) {
        const merged = { ...obj1 };
        
        Object.keys(obj2).forEach(key => {
            if (!(key in obj1)) {
                // New field from obj2
                merged[key] = obj2[key];
            } else if (this.isObject(obj1[key]) && this.isObject(obj2[key])) {
                // Recursive merge for nested objects
                merged[key] = this.mergeObjects(obj1[key], obj2[key]);
            } else if (Array.isArray(obj1[key]) && Array.isArray(obj2[key])) {
                // Merge arrays, removing duplicates
                merged[key] = [...new Set([...obj1[key], ...obj2[key]])];
            } else {
                // For conflicting primitives, prefer obj2 (server in most cases)
                merged[key] = obj2[key];
            }
        });
        
        return merged;
    }
    
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    identifyMergedFields(obj1, obj2, merged) {
        const fields = {
            added: [],
            modified: [],
            unchanged: []
        };
        
        Object.keys(merged).forEach(key => {
            if (!(key in obj1)) {
                fields.added.push(key);
            } else if (!(key in obj2)) {
                fields.unchanged.push(key);
            } else if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
                fields.modified.push(key);
            } else {
                fields.unchanged.push(key);
            }
        });
        
        return fields;
    }
    
    // Conflict analysis
    
    analyzeConflictSeverity(conflict) {
        const differences = this.calculateDifferences(conflict.client, conflict.server);
        
        if (differences.majorFields > 0) {
            return 'high';
        } else if (differences.minorFields > 0) {
            return 'medium';
        } else {
            return 'low';
        }
    }
    
    calculateDifferences(obj1, obj2) {
        const majorFields = ['id', 'type', 'startTime', 'endTime', 'projectId'];
        const differences = {
            majorFields: 0,
            minorFields: 0,
            totalFields: 0
        };
        
        const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
        
        allKeys.forEach(key => {
            if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
                differences.totalFields++;
                if (majorFields.includes(key)) {
                    differences.majorFields++;
                } else {
                    differences.minorFields++;
                }
            }
        });
        
        return differences;
    }
    
    // Batch conflict resolution
    
    async resolveBatchConflicts(conflicts, defaultStrategy = 'latest_timestamp') {
        const results = [];
        
        for (const conflict of conflicts) {
            const strategy = this.selectStrategyForConflict(conflict, defaultStrategy);
            const result = await this.resolveConflict(conflict, strategy);
            results.push(result);
        }
        
        return results;
    }
    
    selectStrategyForConflict(conflict, defaultStrategy) {
        // Analyze conflict and suggest appropriate strategy
        const severity = this.analyzeConflictSeverity(conflict);
        
        switch (severity) {
            case 'high':
                return 'user_choice'; // Let user decide for major conflicts
            case 'medium':
                return 'custom_merge'; // Try intelligent merge
            case 'low':
            default:
                return defaultStrategy; // Use default for minor conflicts
        }
    }
    
    // Conflict prevention
    
    generateConflictHash(data) {
        // Generate a hash of the data to detect conflicts early
        const sortedKeys = Object.keys(data).sort();
        const hashString = sortedKeys.map(key => `${key}:${JSON.stringify(data[key])}`).join('|');
        
        let hash = 0;
        for (let i = 0; i < hashString.length; i++) {
            const char = hashString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return hash.toString(36);
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConflictResolver;
} else {
    window.ConflictResolver = ConflictResolver;
}