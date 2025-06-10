// desktop-app/src/renderer.js
class DesktopTimerApp {
    constructor() {
        this.currentTimer = null;
        this.startTime = null;
        this.timerInterval = null;
        this.projects = [];
        this.isLoading = false;
        this.connectionStatus = 'disconnected';
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Desktop Timer App initializing...');
        
        // Check if electronAPI is available
        if (!window.electronAPI) {
            console.error('Electron API not available');
            this.showError('Application not properly initialized');
            return;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadInitialData();
        
        // Setup periodic updates
        this.startPeriodicUpdates();
        
        console.log('✅ Desktop Timer App initialized');
    }
    
    setupEventListeners() {
        // Timer controls
        document.getElementById('playBtn')?.addEventListener('click', () => this.startTimer());
        document.getElementById('pauseBtn')?.addEventListener('click', () => this.pauseTimer());
        document.getElementById('stopBtn')?.addEventListener('click', () => this.stopTimer());
        
        // Project management
        document.getElementById('addProjectBtn')?.addEventListener('click', () => this.showAddProjectDialog());
        document.getElementById('projectSelect')?.addEventListener('change', (e) => this.onProjectChange(e));
        
        // Header controls
        document.getElementById('settingsBtn')?.addEventListener('click', () => this.openSettings());
        document.getElementById('minimizeBtn')?.addEventListener('click', () => this.minimizeWindow());
        document.getElementById('closeBtn')?.addEventListener('click', () => this.closeWindow());
        
        // Bottom actions
        document.getElementById('syncAction')?.addEventListener('click', () => this.forceSync());
        document.getElementById('analyticsAction')?.addEventListener('click', () => this.openAnalytics());
        document.getElementById('rulesAction')?.addEventListener('click', () => this.openRulesManager());
        document.getElementById('exportAction')?.addEventListener('click', () => this.exportData());
        
        // Smart suggestions
        document.getElementById('acceptSuggestion')?.addEventListener('click', () => this.acceptSuggestion());
        document.getElementById('declineSuggestion')?.addEventListener('click', () => this.declineSuggestion());
        document.getElementById('dismissSuggestion')?.addEventListener('click', () => this.dismissSuggestion());
        
        // Window tracking settings
        document.getElementById('trackingSettingsBtn')?.addEventListener('click', () => this.openTrackingSettings());
        
        // View all activity
        document.getElementById('viewAllBtn')?.addEventListener('click', () => this.openActivityView());
        
        // Listen for electron events
        this.setupElectronEventListeners();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }
    
    setupElectronEventListeners() {
        // Timer events from main process
        const removeStartListener = window.electronAPI.timer.onStartNew(() => {
            this.startTimer();
        });
        
        const removeStopListener = window.electronAPI.timer.onStop(() => {
            this.stopTimer();
        });
        
        const removeToggleListener = window.electronAPI.timer.onToggle(() => {
            this.toggleTimer();
        });
        
        // Session events
        const removeSessionStartedListener = window.electronAPI.session.onSessionStarted((event, session) => {
            this.handleSessionStarted(session);
        });
        
        const removeSessionStoppedListener = window.electronAPI.session.onSessionStopped((event, session) => {
            this.handleSessionStopped(session);
        });
        
        // Sync events
        const removeSyncSuccessListener = window.electronAPI.sync.onSyncSuccess((event, data) => {
            this.handleSyncSuccess(data);
        });
        
        const removeSyncErrorListener = window.electronAPI.sync.onSyncError((event, error) => {
            this.handleSyncError(error);
        });
        
        // Project suggestions
        const removeSuggestProjectListener = window.electronAPI.suggestions.onProjectSuggested((event, projectId) => {
            this.handleProjectSuggestion(projectId);
        });
        
        // Store cleanup functions for later
        this.electronListenerCleanup = [
            removeStartListener,
            removeStopListener,
            removeToggleListener,
            removeSessionStartedListener,
            removeSessionStoppedListener,
            removeSyncSuccessListener,
            removeSyncErrorListener,
            removeSuggestProjectListener
        ];
    }
    
    async loadInitialData() {
        try {
            this.setLoading(true);
            
            // Load projects
            await this.loadProjects();
            
            // Check for current session
            await this.checkCurrentSession();
            
            // Load stats
            await this.loadStats();
            
            // Check window tracking status
            await this.updateWindowTrackingStatus();
            
            // Load recent activity
            await this.loadRecentActivity();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load application data');
        } finally {
            this.setLoading(false);
        }
    }
    
    async loadProjects() {
        try {
            const response = await window.electronAPI.api.get('/projects');
            if (response.success) {
                this.projects = response.data;
                this.populateProjectSelect();
            } else {
                throw new Error(response.error || 'Failed to load projects');
            }
        } catch (error) {
            console.error('Error loading projects:', error);
            // Use cached projects or defaults
            this.projects = await this.getDefaultProjects();
            this.populateProjectSelect();
        }
    }
    
    async getDefaultProjects() {
        return [
            { _id: 'dev', name: 'Development Work', color: '#667eea' },
            { _id: 'design', name: 'Design Projects', color: '#f093fb' },
            { _id: 'meetings', name: 'Client Meetings', color: '#4ecdc4' },
            { _id: 'admin', name: 'Administrative', color: '#fce38a' }
        ];
    }
    
    populateProjectSelect() {
        const select = document.getElementById('projectSelect');
        if (!select) return;
        
        select.innerHTML = '<option value="">Select Project...</option>';
        
        this.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project._id;
            option.textContent = project.name;
            option.style.color = project.color;
            select.appendChild(option);
        });
    }
    
    async checkCurrentSession() {
        try {
            const session = await window.electronAPI.session.getCurrent();
            if (session) {
                this.currentTimer = session;
                this.startTime = new Date(session.startTime);
                this.startTimerDisplay();
                this.updateTimerControls(true);
                
                // Set project selection
                const projectSelect = document.getElementById('projectSelect');
                if (projectSelect && session.projectId) {
                    projectSelect.value = session.projectId;
                }
            }
        } catch (error) {
            console.error('Error checking current session:', error);
        }
    }
    
    async loadStats() {
        try {
            const analytics = await window.electronAPI.analytics.getProductivity();
            
            // Update today's time
            const todayElement = document.getElementById('todayTime');
            if (todayElement && analytics.today) {
                todayElement.textContent = this.formatDuration(analytics.today.totalTime || 0);
            }
            
            // Update week's time
            const weekElement = document.getElementById('weekTime');
            if (weekElement && analytics.thisWeek) {
                weekElement.textContent = this.formatDuration(analytics.thisWeek.totalTime || 0);
            }
            
            // Update productivity score
            const productivityElement = document.getElementById('productivityScore');
            if (productivityElement && analytics.overall) {
                productivityElement.textContent = `${Math.round(analytics.overall.productivityScore || 0)}%`;
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    async updateWindowTrackingStatus() {
        try {
            const enabled = await window.electronAPI.settings.get('windowTracking.enabled');
            const indicator = document.getElementById('windowTrackingIndicator');
            
            if (indicator) {
                if (enabled) {
                    indicator.classList.remove('hidden');
                } else {
                    indicator.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Error checking window tracking status:', error);
        }
    }
    
    async loadRecentActivity() {
        try {
            const response = await window.electronAPI.api.get('/time-entries?limit=5');
            if (response.success) {
                this.renderRecentActivity(response.data.timeEntries || []);
            }
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }
    
    renderRecentActivity(activities) {
        const container = document.getElementById('activityList');
        if (!container) return;
        
        if (activities.length === 0) {
            container.innerHTML = `
                <div class="activity-placeholder">
                    <span class="placeholder-icon">📝</span>
                    <span>No recent activity</span>
                </div>
            `;
            return;
        }
        
        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-project">${activity.projectId?.name || 'Unknown Project'}</div>
                <div class="activity-duration">${this.formatDuration(activity.duration || 0)}</div>
            </div>
        `).join('');
    }
    
    // Timer Control Methods
    async startTimer() {
        const projectSelect = document.getElementById('projectSelect');
        const projectId = projectSelect?.value;
        
        if (!projectId) {
            this.showError('Please select a project first');
            return;
        }
        
        try {
            this.setLoading(true);
            
            const result = await window.electronAPI.session.start(projectId, 'Desktop timer session');
            
            if (result.success) {
                this.currentTimer = result.session;
                this.startTime = new Date(this.currentTimer.startTime);
                this.startTimerDisplay();
                this.updateTimerControls(true);
                this.showSuccess('Timer started!');
            } else {
                this.showError(result.error || 'Failed to start timer');
            }
        } catch (error) {
            console.error('Error starting timer:', error);
            this.showError('Failed to start timer');
        } finally {
            this.setLoading(false);
        }
    }
    
    async pauseTimer() {
        // For now, pause just stops the display update
        // In a full implementation, you'd want to track pause state
        this.stopTimerDisplay();
        this.updateTimerControls(false, true);
        this.showInfo('Timer paused');
    }
    
    async stopTimer() {
        if (!this.currentTimer) return;
        
        try {
            this.setLoading(true);
            
            const result = await window.electronAPI.session.stop();
            
            if (result.success) {
                this.stopTimerDisplay();
                this.updateTimerControls(false);
                this.currentTimer = null;
                this.startTime = null;
                
                const duration = this.formatDuration(result.session.duration);
                this.showSuccess(`Timer stopped! Total: ${duration}`);
                
                // Reload stats and activity
                await this.loadStats();
                await this.loadRecentActivity();
            } else {
                this.showError(result.error || 'Failed to stop timer');
            }
        } catch (error) {
            console.error('Error stopping timer:', error);
            this.showError('Failed to stop timer');
        } finally {
            this.setLoading(false);
        }
    }
    
    async toggleTimer() {
        if (this.currentTimer) {
            await this.stopTimer();
        } else {
            await this.startTimer();
        }
    }
    
    startTimerDisplay() {
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            this.updateTimerDisplay();
        }, 1000);
    }
    
    stopTimerDisplay() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        const timeElement = document.getElementById('timerTime');
        const statusElement = document.getElementById('timerStatus');
        
        if (timeElement) timeElement.textContent = '00:00:00';
        if (statusElement) statusElement.textContent = 'Ready to start';
    }
    
    updateTimerDisplay() {
        if (!this.startTime) return;
        
        const now = new Date();
        const elapsed = now - this.startTime;
        
        const timeElement = document.getElementById('timerTime');
        const statusElement = document.getElementById('timerStatus');
        
        if (timeElement) {
            timeElement.textContent = this.formatTime(elapsed);
        }
        
        if (statusElement) {
            const project = this.projects.find(p => p._id === this.currentTimer?.projectId);
            statusElement.textContent = `Tracking: ${project?.name || 'Unknown Project'}`;
        }
    }
    
    updateTimerControls(isRunning, isPaused = false) {
        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        const timerTime = document.getElementById('timerTime');
        
        if (isRunning) {
            playBtn?.classList.add('hidden');
            pauseBtn?.classList.remove('hidden');
            stopBtn?.classList.remove('hidden');
            timerTime?.classList.add('running');
        } else {
            playBtn?.classList.remove('hidden');
            pauseBtn?.classList.add('hidden');
            stopBtn?.classList.add('hidden');
            timerTime?.classList.remove('running');
        }
    }
    
    // Event Handlers
    handleSessionStarted(session) {
        this.currentTimer = session;
        this.startTime = new Date(session.startTime);
        this.startTimerDisplay();
        this.updateTimerControls(true);
    }
    
    handleSessionStopped(session) {
        this.stopTimerDisplay();
        this.updateTimerControls(false);
        this.currentTimer = null;
        this.startTime = null;
        this.loadStats();
        this.loadRecentActivity();
    }
    
    handleSyncSuccess(data) {
        this.updateConnectionStatus('connected');
        this.showSuccess('Sync completed');
        this.loadStats();
        this.loadRecentActivity();
    }
    
    handleSyncError(error) {
        this.updateConnectionStatus('error');
        this.showError('Sync failed');
    }
    
    handleProjectSuggestion(projectId) {
        const project = this.projects.find(p => p._id === projectId);
        if (project) {
            this.showSmartSuggestion(`Start tracking "${project.name}"?`, projectId);
        }
    }
    
    // UI Helper Methods
    updateConnectionStatus(status) {
        this.connectionStatus = status;
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        
        if (statusDot && statusText) {
            statusDot.className = 'status-dot';
            
            switch (status) {
                case 'connected':
                    statusDot.classList.add('connected');
                    statusText.textContent = 'Online';
                    break;
                case 'connecting':
                    statusText.textContent = 'Connecting...';
                    break;
                case 'error':
                    statusText.textContent = 'Sync Error';
                    break;
                default:
                    statusText.textContent = 'Offline';
            }
        }
    }
    
    showSmartSuggestion(message, data = null) {
        const container = document.getElementById('smartSuggestions');
        const content = document.getElementById('suggestionContent');
        
        if (container && content) {
            content.textContent = message;
            container.classList.remove('hidden');
            container.dataset.suggestionData = JSON.stringify(data);
        }
    }
    
    async acceptSuggestion() {
        const container = document.getElementById('smartSuggestions');
        const data = container?.dataset.suggestionData;
        
        if (data) {
            const suggestionData = JSON.parse(data);
            
            // Set project and start timer
            const projectSelect = document.getElementById('projectSelect');
            if (projectSelect) {
                projectSelect.value = suggestionData;
                await this.startTimer();
            }
        }
        
        this.dismissSuggestion();
    }
    
    declineSuggestion() {
        this.dismissSuggestion();
        // Could record this as negative feedback for AI learning
    }
    
    dismissSuggestion() {
        const container = document.getElementById('smartSuggestions');
        container?.classList.add('hidden');
    }
    
    setLoading(loading) {
        this.isLoading = loading;
        const app = document.getElementById('app');
        
        if (app) {
            if (loading) {
                app.classList.add('loading');
            } else {
                app.classList.remove('loading');
            }
        }
    }
    
    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('statusMessage');
        if (!statusDiv) return;
        
        statusDiv.className = `status-message status-${type}`;
        statusDiv.textContent = message;
        statusDiv.classList.remove('hidden');
        
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 3000);
    }
    
    showSuccess(message) { this.showStatus(message, 'success'); }
    showError(message) { this.showStatus(message, 'error'); }
    showInfo(message) { this.showStatus(message, 'info'); }
    
    // Action Methods
    async forceSync() {
        try {
            this.updateConnectionStatus('connecting');
            const result = await window.electronAPI.sync.force();
            
            if (result.success) {
                this.updateConnectionStatus('connected');
                this.showSuccess('Sync completed');
            } else {
                this.updateConnectionStatus('error');
                this.showError('Sync failed');
            }
        } catch (error) {
            this.updateConnectionStatus('error');
            this.showError('Sync failed');
        }
    }
    
    async openAnalytics() {
        try {
            await window.electronAPI.system.openExternal('analytics://dashboard');
        } catch (error) {
            this.showError('Failed to open analytics');
        }
    }
    
    async openSettings() {
        try {
            // This would open a settings modal or window
            this.showInfo('Settings panel would open here');
        } catch (error) {
            this.showError('Failed to open settings');
        }
    }
    
    async openRulesManager() {
        try {
            // This would open rules management
            this.showInfo('Rules manager would open here');
        } catch (error) {
            this.showError('Failed to open rules manager');
        }
    }
    
    async exportData() {
        try {
            const result = await window.electronAPI.file.export(this.getAllData(), 'time-tracking-export.json');
            if (result.success) {
                this.showSuccess('Data exported successfully');
            } else {
                this.showError('Export failed');
            }
        } catch (error) {
            this.showError('Export failed');
        }
    }
    
    async minimizeWindow() {
        try {
            await window.electronAPI.window.minimize();
        } catch (error) {
            console.error('Error minimizing window:', error);
        }
    }
    
    async closeWindow() {
        try {
            await window.electronAPI.window.hide();
        } catch (error) {
            console.error('Error closing window:', error);
        }
    }
    
    // Utility Methods
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    formatDuration(milliseconds) {
        if (!milliseconds) return '0h';
        
        const totalMinutes = Math.floor(milliseconds / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return '0m';
        }
    }
    
    getAllData() {
        return {
            currentTimer: this.currentTimer,
            projects: this.projects,
            exportDate: new Date().toISOString()
        };
    }
    
    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    this.toggleTimer();
                    break;
                case 's':
                    e.preventDefault();
                    this.stopTimer();
                    break;
                case 'r':
                    e.preventDefault();
                    this.forceSync();
                    break;
            }
        }
    }
    
    startPeriodicUpdates() {
        // Update stats every 5 minutes
        setInterval(() => {
            this.loadStats();
        }, 5 * 60 * 1000);
        
        // Check connection every 30 seconds
        setInterval(async () => {
            try {
                const status = await window.electronAPI.sync.getStatus();
                this.updateConnectionStatus(status.isOnline ? 'connected' : 'disconnected');
            } catch (error) {
                this.updateConnectionStatus('error');
            }
        }, 30000);
    }
    
    onProjectChange(e) {
        const projectId = e.target.value;
        if (this.currentTimer && projectId && projectId !== this.currentTimer.projectId) {
            this.showInfo('Project will be updated when timer is stopped');
        }
    }
    
    showAddProjectDialog() {
        // This would open a modal to add a new project
        this.showInfo('Add project dialog would open here');
    }
    
    openTrackingSettings() {
        this.showInfo('Window tracking settings would open here');
    }
    
    openActivityView() {
        this.showInfo('Activity view would open here');
    }
    
    // Cleanup
    destroy() {
        // Clear timers
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        // Remove electron event listeners
        if (this.electronListenerCleanup) {
            this.electronListenerCleanup.forEach(cleanup => cleanup());
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.timerApp = new DesktopTimerApp();
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
    if (window.timerApp) {
        window.timerApp.destroy();
    }
});