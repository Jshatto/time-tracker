class FinancialCentsWebApp {
    constructor() {
        this.apiUrl = '/api';
        this.currentTimer = null;
        this.startTime = null;
        this.timerInterval = null;
        this.projects = [];
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Financial Cents Web App initializing...');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadProjects();
        
        // Check for running timer
        await this.checkRunningTimer();
        
        // Setup theme
        this.setupTheme();
        
        console.log('✅ Web App initialized');
    }
    
    setupEventListeners() {
        // Timer toggle button
        const timerToggle = document.getElementById('timerToggle');
        timerToggle?.addEventListener('click', () => this.toggleTimer());
        
        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        themeToggle?.addEventListener('click', () => this.toggleTheme());
        
        // Project selection
        const projectSelect = document.getElementById('projectSelect');
        projectSelect?.addEventListener('change', (e) => {
            if (this.currentTimer) {
                this.showStatus('Project will be updated when timer is stopped', 'warning');
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === ' ') {
                e.preventDefault();
                this.toggleTimer();
            }
        });
        
        // Page visibility API to handle tab switching
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.currentTimer) {
                this.syncTimer();
            }
        });
    }
    
    async loadProjects() {
        try {
            const response = await fetch(`${this.apiUrl}/demo/projects`);
            if (response.ok) {
                this.projects = await response.json();
                this.populateProjectSelect();
            } else {
                console.warn('Failed to load projects, using defaults');
                this.useDefaultProjects();
            }
        } catch (error) {
            console.error('Error loading projects:', error);
            this.useDefaultProjects();
        }
    }
    
    useDefaultProjects() {
        this.projects = [
            { _id: 'dev', name: 'Development Work', color: '#667eea' },
            { _id: 'design', name: 'Design Projects', color: '#f093fb' },
            { _id: 'meetings', name: 'Client Meetings', color: '#4ecdc4' },
            { _id: 'admin', name: 'Administrative', color: '#fce38a' }
        ];
        this.populateProjectSelect();
    }
    
    populateProjectSelect() {
        const select = document.getElementById('projectSelect');
        if (!select) return;
        
        // Clear existing options except first
        select.innerHTML = '<option value="">Select Project...</option>';
        
        // Add project options
        this.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project._id;
            option.textContent = project.name;
            select.appendChild(option);
        });
    }
    
    async checkRunningTimer() {
        try {
            const response = await fetch(`${this.apiUrl}/time-entries/status/running`);
            if (response.ok) {
                const runningTimer = await response.json();
                if (runningTimer) {
                    this.currentTimer = runningTimer;
                    this.startTime = new Date(runningTimer.startTime);
                    this.startTimerDisplay();
                    this.updateTimerButton(true);
                    
                    // Set project selection
                    const projectSelect = document.getElementById('projectSelect');
                    if (projectSelect && runningTimer.projectId) {
                        projectSelect.value = runningTimer.projectId._id || runningTimer.projectId;
                    }
                }
            }
        } catch (error) {
            console.error('Error checking running timer:', error);
        }
    }
    
    async toggleTimer() {
        if (this.currentTimer) {
            await this.stopTimer();
        } else {
            await this.startTimer();
        }
    }
    
    async startTimer() {
        const projectSelect = document.getElementById('projectSelect');
        const projectId = projectSelect?.value;
        
        if (!projectId) {
            this.showStatus('Please select a project first', 'error');
            return;
        }
        
        this.setLoading(true);
        
        try {
            const response = await fetch(`${this.apiUrl}/time-entries`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId: projectId,
                    description: 'Web timer session',
                    startTime: new Date().toISOString(),
                    metadata: {
                        source: 'web_app',
                        deviceInfo: {
                            platform: 'web',
                            userAgent: navigator.userAgent
                        }
                    }
                })
            });
            
            if (response.ok) {
                this.currentTimer = await response.json();
                this.startTime = new Date(this.currentTimer.startTime);
                this.startTimerDisplay();
                this.updateTimerButton(true);
                this.showStatus('Timer started!', 'success');
            } else {
                const error = await response.json();
                this.showStatus(error.error || 'Failed to start timer', 'error');
            }
        } catch (error) {
            console.error('Error starting timer:', error);
            this.showStatus('Failed to start timer', 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    async stopTimer() {
        if (!this.currentTimer) return;
        
        this.setLoading(true);
        
        try {
            const response = await fetch(`${this.apiUrl}/time-entries/${this.currentTimer._id}/stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const completedTimer = await response.json();
                this.stopTimerDisplay();
                this.updateTimerButton(false);
                this.currentTimer = null;
                this.startTime = null;
                
                const duration = this.formatDuration(completedTimer.duration);
                this.showStatus(`Timer stopped! Total time: ${duration}`, 'success');
            } else {
                const error = await response.json();
                this.showStatus(error.error || 'Failed to stop timer', 'error');
            }
        } catch (error) {
            console.error('Error stopping timer:', error);
            this.showStatus('Failed to stop timer', 'error');
        } finally {
            this.setLoading(false);
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
        
        // Reset display
        const display = document.getElementById('timerDisplay');
        if (display) {
            display.textContent = '00:00:00';
        }
    }
    
    updateTimerDisplay() {
        if (!this.startTime) return;
        
        const now = new Date();
        const elapsed = now - this.startTime;
        
        const display = document.getElementById('timerDisplay');
        if (display) {
            display.textContent = this.formatTime(elapsed);
        }
    }
    
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    formatDuration(milliseconds) {
        const totalMinutes = Math.floor(milliseconds / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
    
    updateTimerButton(isRunning) {
        const button = document.getElementById('timerToggle');
        const buttonText = document.getElementById('timerButtonText');
        
        if (button && buttonText) {
            if (isRunning) {
                button.className = 'btn btn-danger';
                buttonText.textContent = 'Stop Timer';
            } else {
                button.className = 'btn btn-primary';
                buttonText.textContent = 'Start Timer';
            }
        }
    }
    
    setLoading(loading) {
        const button = document.getElementById('timerToggle');
        const spinner = document.getElementById('timerSpinner');
        const buttonText = document.getElementById('timerButtonText');
        
        if (button && spinner && buttonText) {
            button.disabled = loading;
            if (loading) {
                spinner.classList.remove('hidden');
                buttonText.textContent = 'Loading...';
            } else {
                spinner.classList.add('hidden');
            }
        }
    }
    
    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('statusMessage');
        if (!statusDiv) return;
        
        statusDiv.className = `status ${type}`;
        statusDiv.textContent = message;
        statusDiv.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 5000);
    }
    
    setupTheme() {
        // Check for saved theme preference or default to 'light'
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
    
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }
    
    async syncTimer() {
        // Sync timer state with server if running
        if (this.currentTimer) {
            await this.checkRunningTimer();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.financialCentsApp = new FinancialCentsWebApp();
});
