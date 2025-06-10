const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // App control
    app: {
        getVersion: () => ipcRenderer.invoke('app:getVersion'),
        getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
        quit: () => ipcRenderer.invoke('app:quit')
    },

    // Window control
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        hide: () => ipcRenderer.invoke('window:hide'),
        show: () => ipcRenderer.invoke('window:show'),
        toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop')
    },

    // Settings management
    settings: {
        get: (key) => ipcRenderer.invoke('settings:get', key),
        set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
        getAll: () => ipcRenderer.invoke('settings:getAll')
    },

    // API requests (with proper error handling)
    api: {
        request: (options) => ipcRenderer.invoke('api:request', options),
        
        // Convenience methods for common operations
        get: (path, headers = {}) => ipcRenderer.invoke('api:request', {
            method: 'GET',
            path,
            headers
        }),
        
        post: (path, body, headers = {}) => ipcRenderer.invoke('api:request', {
            method: 'POST',
            path,
            body,
            headers
        }),
        
        put: (path, body, headers = {}) => ipcRenderer.invoke('api:request', {
            method: 'PUT',
            path,
            body,
            headers
        }),
        
        delete: (path, headers = {}) => ipcRenderer.invoke('api:request', {
            method: 'DELETE',
            path,
            headers
        })
    },

    // Window tracking functionality
    windowTracking: {
        getRules: () => ipcRenderer.invoke('windowTracking:getRules'),
        addRule: (rule) => ipcRenderer.invoke('windowTracking:addRule', rule),
        updateRule: (id, updates) => ipcRenderer.invoke('windowTracking:updateRule', id, updates),
        deleteRule: (id) => ipcRenderer.invoke('windowTracking:deleteRule', id),
        getAnalytics: () => ipcRenderer.invoke('windowTracking:getAnalytics'),
        
        // Event listeners for window tracking events
        onRuleTriggered: (callback) => {
            ipcRenderer.on('window-rule-triggered', callback);
            return () => ipcRenderer.removeListener('window-rule-triggered', callback);
        },
        
        onWindowChanged: (callback) => {
            ipcRenderer.on('window-changed', callback);
            return () => ipcRenderer.removeListener('window-changed', callback);
        }
    },

    // Session management
    session: {
        getCurrent: () => ipcRenderer.invoke('session:getCurrent'),
        start: (projectId, description) => ipcRenderer.invoke('session:start', projectId, description),
        stop: () => ipcRenderer.invoke('session:stop'),
        
        // Event listeners for session events
        onSessionStarted: (callback) => {
            ipcRenderer.on('session-started', callback);
            return () => ipcRenderer.removeListener('session-started', callback);
        },
        
        onSessionStopped: (callback) => {
            ipcRenderer.on('session-stopped', callback);
            return () => ipcRenderer.removeListener('session-stopped', callback);
        },
        
        onSessionUpdated: (callback) => {
            ipcRenderer.on('session-updated', callback);
            return () => ipcRenderer.removeListener('session-updated', callback);
        }
    },

    // Sync operations
    sync: {
        force: () => ipcRenderer.invoke('sync:force'),
        getStatus: () => ipcRenderer.invoke('sync:status'),
        getQueue: () => ipcRenderer.invoke('sync:getQueue'),
        
        // Event listeners for sync status
        onSyncStart: (callback) => {
            ipcRenderer.on('sync:start', callback);
            return () => ipcRenderer.removeListener('sync:start', callback);
        },
        
        onSyncSuccess: (callback) => {
            ipcRenderer.on('sync:success', callback);
            return () => ipcRenderer.removeListener('sync:success', callback);
        },
        
        onSyncError: (callback) => {
            ipcRenderer.on('sync:error', callback);
            return () => ipcRenderer.removeListener('sync:error', callback);
        }
    },

    // Analytics functionality
    analytics: {
        getProductivity: () => ipcRenderer.invoke('analytics:getProductivity'),
        getPatterns: () => ipcRenderer.invoke('analytics:getPatterns'),
        
        // Real-time analytics events
        onProductivityUpdate: (callback) => {
            ipcRenderer.on('analytics:productivity-update', callback);
            return () => ipcRenderer.removeListener('analytics:productivity-update', callback);
        },
        
        onPatternDetected: (callback) => {
            ipcRenderer.on('analytics:pattern-detected', callback);
            return () => ipcRenderer.removeListener('analytics:pattern-detected', callback);
        }
    },

    // File operations
    file: {
        export: (data, filename) => ipcRenderer.invoke('file:export', data, filename)
    },

    // Notifications
    notification: {
        show: (options) => ipcRenderer.invoke('notification:show', options)
    },

    // System integration
    system: {
        openExternal: (url) => ipcRenderer.invoke('system:openExternal', url)
    },

    // Timer control events (from menu/shortcuts)
    timer: {
        onStartNew: (callback) => {
            ipcRenderer.on('start-new-timer', callback);
            return () => ipcRenderer.removeListener('start-new-timer', callback);
        },
        
        onStop: (callback) => {
            ipcRenderer.on('stop-timer', callback);
            return () => ipcRenderer.removeListener('stop-timer', callback);
        },
        
        onToggle: (callback) => {
            ipcRenderer.on('toggle-timer', callback);
            return () => ipcRenderer.removeListener('toggle-timer', callback);
        }
    },

    // Project suggestions (from window tracking)
    suggestions: {
        onProjectSuggested: (callback) => {
            ipcRenderer.on('suggest-project', callback);
            return () => ipcRenderer.removeListener('suggest-project', callback);
        }
    },

    // Theme management
    theme: {
        get: () => ipcRenderer.invoke('settings:get', 'theme'),
        set: (theme) => ipcRenderer.invoke('settings:set', 'theme', theme),
        
        // System theme change listener
        onSystemThemeChange: (callback) => {
            ipcRenderer.on('theme:system-changed', callback);
            return () => ipcRenderer.removeListener('theme:system-changed', callback);
        }
    },

    // Advanced features
    features: {
        // Machine learning patterns
        getLearnedPatterns: () => ipcRenderer.invoke('features:getLearnedPatterns'),
        suggestOptimizations: () => ipcRenderer.invoke('features:suggestOptimizations'),
        
        // Productivity insights
        getProductivityInsights: () => ipcRenderer.invoke('features:getProductivityInsights'),
        getFocusAnalysis: () => ipcRenderer.invoke('features:getFocusAnalysis'),
        
        // Smart suggestions
        getSmartSuggestions: () => ipcRenderer.invoke('features:getSmartSuggestions'),
        
        // Event listeners for AI-like features
        onInsightGenerated: (callback) => {
            ipcRenderer.on('insight-generated', callback);
            return () => ipcRenderer.removeListener('insight-generated', callback);
        },
        
        onOptimizationSuggested: (callback) => {
            ipcRenderer.on('optimization-suggested', callback);
            return () => ipcRenderer.removeListener('optimization-suggested', callback);
        }
    },

    // Development helpers (only available in dev mode)
    dev: {
        log: (...args) => {
            if (process.env.NODE_ENV === 'development') {
                console.log('[DEV]', ...args);
            }
        },
        
        isDevMode: () => process.env.NODE_ENV === 'development',
        
        // Debug information
        getDebugInfo: () => ipcRenderer.invoke('dev:getDebugInfo'),
        
        // Performance monitoring
        getPerformanceMetrics: () => ipcRenderer.invoke('dev:getPerformanceMetrics')
    },

    // Event management utilities
    events: {
        // Generic event listener helper
        on: (channel, callback) => {
            ipcRenderer.on(channel, callback);
            return () => ipcRenderer.removeListener(channel, callback);
        },
        
        // One-time event listener
        once: (channel, callback) => {
            ipcRenderer.once(channel, callback);
        },
        
        // Remove all listeners for a channel
        removeAllListeners: (channel) => {
            ipcRenderer.removeAllListeners(channel);
        }
    }
});

// Enhanced security: Remove node integration and hide electron internals
delete window.require;
delete window.exports;
delete window.module;

// Prevent access to electron internals
Object.defineProperty(window, 'electron', {
    get() {
        throw new Error('Electron object is not available in renderer process for security reasons');
    }
});

// Version info
window.electronAPI.version = {
    app: process.env.npm_package_version || '2.0.0',
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
};

// Platform detection
window.electronAPI.platform = {
    isWindows: process.platform === 'win32',
    isMacOS: process.platform === 'darwin',
    isLinux: process.platform === 'linux',
    platform: process.platform
};

// Enhanced logging for development
if (process.env.NODE_ENV === 'development') {
    window.electronAPI.dev.log('Enhanced preload script loaded successfully');
    window.electronAPI.dev.log('Available APIs:', Object.keys(window.electronAPI));
    window.electronAPI.dev.log('Platform:', window.electronAPI.platform.platform);
    window.electronAPI.dev.log('Version:', window.electronAPI.version.app);
}

// Performance monitoring
window.electronAPI.performance = {
    startTime: Date.now(),
    
    // Mark performance milestones
    mark: (name) => {
        if (window.performance && window.performance.mark) {
            window.performance.mark(name);
        }
    },
    
    // Measure performance between marks
    measure: (name, startMark, endMark) => {
        if (window.performance && window.performance.measure) {
            try {
                window.performance.measure(name, startMark, endMark);
                return window.performance.getEntriesByName(name);
            } catch (error) {
                console.warn('Performance measurement failed:', error);
                return null;
            }
        }
        return null;
    },
    
    // Get navigation timing
    getNavigationTiming: () => {
        if (window.performance && window.performance.timing) {
            return window.performance.timing;
        }
        return null;
    }
};

// Initialize performance monitoring
window.electronAPI.performance.mark('preload-script-loaded');

