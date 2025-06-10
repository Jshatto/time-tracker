class TimerPopup {
  constructor() {
    this.isTimerRunning = false;
    this.currentTimer = null;
    this.projects = [];
    this.timeEntries = [];
    this.showingAddProject = false;
    this.currentSession = null;
    this.selectedProject = null;
    this.timerInterval = null;
    this.syncInProgress = false;
    
    // Server configuration
    this.serverConfig = {
      baseUrl: 'https://your-api-server.com/api', // Replace with your actual API
      apiKey: null, // Will be loaded from storage
      userId: null   // Will be loaded from storage
    };
    
    this.init();
  }

  async init() {
    try {
      // Load server config and authenticate
      await this.loadServerConfig();
      
      // Load data from server if authenticated, otherwise load locally
      if (this.serverConfig.apiKey) {
        await this.syncFromServer();
      } else {
        await this.loadLocalData();
      }
      
      this.setupEventListeners();
      this.populateProjectSelector();
      this.updateStats();
      this.updateRecentActivity();
      
      // Check for running timer
      this.checkForRunningTimer();
      
      // Auto-sync every 5 minutes if authenticated
      if (this.serverConfig.apiKey) {
        setInterval(() => this.autoSync(), 5 * 60 * 1000);
      }
      
    } catch (error) {
      console.error('Initialization error:', error);
      this.showNotification('Failed to initialize app', 'error');
    }
  }

  // ===== SERVER AUTHENTICATION & CONFIG =====
  
  async loadServerConfig() {
    try {
      const result = await chrome.storage.local.get(['timer_api_key', 'timer_user_id']);
      this.serverConfig.apiKey = result.timer_api_key;
      this.serverConfig.userId = result.timer_user_id;
      
      // If no credentials, try to authenticate
      if (!this.serverConfig.apiKey) {
        await this.authenticateUser();
      }
    } catch (error) {
      console.error('Error loading server config:', error);
    }
  }

  async authenticateUser() {
    try {
      // Get or create a unique device ID
      let deviceId = await this.getDeviceId();
      
      const response = await fetch(`${this.serverConfig.baseUrl}/auth/device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: deviceId,
          deviceName: navigator.userAgent,
          appVersion: '1.0.0'
        })
      });

      if (response.ok) {
        const authData = await response.json();
        this.serverConfig.apiKey = authData.apiKey;
        this.serverConfig.userId = authData.userId;
        
        // Save credentials
        await chrome.storage.local.set({
          'timer_api_key': authData.apiKey,
          'timer_user_id': authData.userId
        });
        
        this.showNotification('Authentication successful', 'success');
      } else {
        throw new Error('Authentication failed');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      this.showNotification('Using offline mode', 'warning');
    }
  }

  async getDeviceId() {
    try {
      const result = await chrome.storage.local.get('device_id');
      if (result.device_id) {
        return result.device_id;
      }
      
      // Generate new device ID
      const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      await chrome.storage.local.set({ 'device_id': deviceId });
      return deviceId;
    } catch (error) {
      return 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  }

  // ===== SERVER API METHODS =====

  async makeApiRequest(endpoint, options = {}) {
    if (!this.serverConfig.apiKey) {
      throw new Error('Not authenticated');
    }

    const url = `${this.serverConfig.baseUrl}${endpoint}`;
    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.serverConfig.apiKey}`,
        'X-User-ID': this.serverConfig.userId,
        ...options.headers
      },
      ...options
    };

    const response = await fetch(url, requestOptions);
    
    if (response.status === 401) {
      // Token expired, try to re-authenticate
      await this.authenticateUser();
      if (this.serverConfig.apiKey) {
        // Retry the request with new token
        requestOptions.headers['Authorization'] = `Bearer ${this.serverConfig.apiKey}`;
        return await fetch(url, requestOptions);
      }
    }
    
    return response;
  }

  // ===== PROJECT MANAGEMENT =====

  async saveNewProject() {
    const nameInput = document.getElementById('projectName');
    const descInput = document.getElementById('projectDescription');
    const colorInput = document.getElementById('projectColor');
    
    const name = nameInput.value.trim();
    
    if (!name) {
      this.showNotification('Project name is required', 'error');
      nameInput.focus();
      return;
    }

    // Check if project name already exists
    if (this.projects.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      this.showNotification('Project name already exists', 'error');
      nameInput.focus();
      return;
    }

    const saveBtn = document.getElementById('saveProject');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const projectData = {
        name: name,
        description: descInput.value.trim(),
        color: colorInput.value,
        isActive: true,
        createdAt: new Date().toISOString()
      };

      let newProject;

      if (this.serverConfig.apiKey) {
        // Create on server
        const response = await this.makeApiRequest('/projects', {
          method: 'POST',
          body: JSON.stringify(projectData)
        });

        if (response.ok) {
          newProject = await response.json();
          this.showNotification(`Project "${name}" created successfully`, 'success');
        } else {
          throw new Error('Server creation failed');
        }
      } else {
        // Create locally if no server connection
        newProject = {
          id: `local_project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...projectData,
          isLocal: true
        };
        this.showNotification(`Project "${name}" created locally`, 'warning');
      }

      // Add to local projects array
      this.projects.push(newProject);
      
      // Save locally as backup
      await this.saveLocalData();
      
      // Update UI
      this.populateProjectSelector();
      const projectSelect = document.getElementById('projectSelect');
      projectSelect.value = newProject.id;
      this.selectedProject = newProject.id;
      
      this.hideAddProjectForm();
      
    } catch (error) {
      console.error('Error creating project:', error);
      
      // Fallback to local creation
      const localProject = {
        id: `local_project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name,
        description: descInput.value.trim(),
        color: colorInput.value,
        isActive: true,
        isLocal: true,
        createdAt: new Date().toISOString()
      };
      
      this.projects.push(localProject);
      await this.saveLocalData();
      this.populateProjectSelector();
      
      const projectSelect = document.getElementById('projectSelect');
      projectSelect.value = localProject.id;
      this.selectedProject = localProject.id;
      
      this.hideAddProjectForm();
      this.showNotification(`Project "${name}" created locally`, 'warning');
      
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Project';
      }
    }
  }

  async deleteProject(projectId) {
    try {
      if (this.serverConfig.apiKey) {
        // Delete from server
        const response = await this.makeApiRequest(`/projects/${projectId}`, {
          method: 'DELETE'
        });
        
        if (!response.ok && response.status !== 404) {
          throw new Error('Server deletion failed');
        }
      }
      
      // Remove from local array
      this.projects = this.projects.filter(p => p.id !== projectId);
      await this.saveLocalData();
      
      // Update UI
      this.populateProjectSelector();
      if (this.selectedProject === projectId) {
        this.selectedProject = null;
        document.getElementById('projectSelect').value = '';
      }
      
      this.showNotification('Project deleted', 'success');
      
    } catch (error) {
      console.error('Error deleting project:', error);
      this.showNotification('Failed to delete project', 'error');
    }
  }

  // ===== TIME TRACKING =====

  async toggleTimer() {
    if (this.isTimerRunning) {
      await this.stopTimer();
    } else {
      await this.startTimer();
    }
  }

  async startTimer() {
    if (!this.selectedProject) {
      this.showNotification('Please select a project first', 'error');
      return;
    }

    this.isTimerRunning = true;
    this.currentSession = {
      projectId: this.selectedProject,
      startTime: Date.now(),
      description: '',
      tags: []
    };

    // Save timer state
    await chrome.storage.local.set({
      'timer_running': true,
      'timer_session': this.currentSession
    });

    // Update UI
    const timerBtn = document.getElementById('timerBtn');
    if (timerBtn) {
      timerBtn.textContent = 'Stop';
      timerBtn.classList.add('active');
    }

    // Start updating the timer display
    this.updateTimerDisplay();
    this.timerInterval = setInterval(() => {
      this.updateTimerDisplay();
    }, 1000);

    this.showNotification('Timer started', 'success');
  }

  async stopTimer() {
    if (!this.currentSession) return;

    this.isTimerRunning = false;
    clearInterval(this.timerInterval);

    const endTime = Date.now();
    const duration = endTime - this.currentSession.startTime;

    // Don't save entries shorter than 1 minute
    if (duration < 60000) {
      this.showNotification('Timer stopped (too short to save)', 'info');
      await this.resetTimer();
      return;
    }

    const timeEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId: this.currentSession.projectId,
      startTime: this.currentSession.startTime,
      endTime: endTime,
      duration: duration,
      description: this.currentSession.description,
      tags: this.currentSession.tags,
      createdAt: new Date().toISOString()
    };

    try {
      if (this.serverConfig.apiKey) {
        // Save to server
        const response = await this.makeApiRequest('/time-entries', {
          method: 'POST',
          body: JSON.stringify(timeEntry)
        });

        if (response.ok) {
          const serverEntry = await response.json();
          this.timeEntries.push(serverEntry);
        } else {
          throw new Error('Server save failed');
        }
      } else {
        // Save locally
        timeEntry.isLocal = true;
        this.timeEntries.push(timeEntry);
      }
      
      // Save locally as backup
      await this.saveLocalData();
      
      // Update UI
      this.updateStats();
      this.updateRecentActivity();
      
      this.showNotification(`Timer stopped - ${this.formatDuration(duration)}`, 'success');
      
    } catch (error) {
      console.error('Error saving time entry:', error);
      
      // Save locally as fallback
      timeEntry.isLocal = true;
      this.timeEntries.push(timeEntry);
      await this.saveLocalData();
      
      this.updateStats();
      this.updateRecentActivity();
      this.showNotification(`Time saved locally - ${this.formatDuration(duration)}`, 'warning');
    }

    await this.resetTimer();
  }

  async resetTimer() {
    // Clear timer state
    await chrome.storage.local.remove(['timer_running', 'timer_session']);
    
    this.currentSession = null;
    
    // Reset UI
    const timerBtn = document.getElementById('timerBtn');
    if (timerBtn) {
      timerBtn.textContent = 'Start';
      timerBtn.classList.remove('active');
    }

    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
      timerDisplay.textContent = '00:00:00';
    }
  }

  async checkForRunningTimer() {
    try {
      const result = await chrome.storage.local.get(['timer_running', 'timer_session']);
      
      if (result.timer_running && result.timer_session) {
        this.isTimerRunning = true;
        this.currentSession = result.timer_session;
        
        // Update UI
        const timerBtn = document.getElementById('timerBtn');
        if (timerBtn) {
          timerBtn.textContent = 'Stop';
          timerBtn.classList.add('active');
        }
        
        // Resume timer display
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
          this.updateTimerDisplay();
        }, 1000);
        
        this.showNotification('Resumed running timer', 'info');
      }
    } catch (error) {
      console.error('Error checking timer state:', error);
    }
  }

  updateTimerDisplay() {
    if (!this.currentSession) return;

    const elapsed = Date.now() - this.currentSession.startTime;
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
      timerDisplay.textContent = this.formatDuration(elapsed);
    }
  }

  // ===== SYNC FUNCTIONALITY =====

  async handleSync() {
    if (this.syncInProgress) return;
    
    this.syncInProgress = true;
    const syncBtn = document.getElementById('syncBtn');
    
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<div class="loading-spinner"></div> Syncing...';
    }

    try {
      if (!this.serverConfig.apiKey) {
        await this.authenticateUser();
        if (!this.serverConfig.apiKey) {
          throw new Error('Authentication required');
        }
      }

      await this.syncToServer();
      await this.syncFromServer();
      
      this.updateStats();
      this.updateRecentActivity();
      this.populateProjectSelector();
      
      this.showNotification('Sync completed successfully', 'success');
      
    } catch (error) {
      console.error('Sync error:', error);
      this.showNotification('Sync failed - using local data', 'error');
    } finally {
      this.syncInProgress = false;
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<div class="action-btn-icon">🔄</div><div class="action-btn-label">SYNC</div>';
      }
    }
  }

  async syncToServer() {
    // Sync local-only projects
    const localProjects = this.projects.filter(p => p.isLocal);
    for (const project of localProjects) {
      try {
        const { isLocal, ...projectData } = project;
        const response = await this.makeApiRequest('/projects', {
          method: 'POST',
          body: JSON.stringify(projectData)
        });
        
        if (response.ok) {
          const serverProject = await response.json();
          // Replace local project with server project
          const index = this.projects.findIndex(p => p.id === project.id);
          if (index !== -1) {
            this.projects[index] = serverProject;
          }
        }
      } catch (error) {
        console.error('Error syncing project:', error);
      }
    }

    // Sync local-only time entries
    const localEntries = this.timeEntries.filter(e => e.isLocal);
    for (const entry of localEntries) {
      try {
        const { isLocal, ...entryData } = entry;
        const response = await this.makeApiRequest('/time-entries', {
          method: 'POST',
          body: JSON.stringify(entryData)
        });
        
        if (response.ok) {
          const serverEntry = await response.json();
          // Replace local entry with server entry
          const index = this.timeEntries.findIndex(e => e.id === entry.id);
          if (index !== -1) {
            this.timeEntries[index] = serverEntry;
          }
        }
      } catch (error) {
        console.error('Error syncing time entry:', error);
      }
    }
  }

  async syncFromServer() {
    try {
      // Fetch projects
      const projectsResponse = await this.makeApiRequest('/projects');
      if (projectsResponse.ok) {
        const serverProjects = await projectsResponse.json();
        
        // Merge with local projects (keep local-only ones)
        const localOnlyProjects = this.projects.filter(p => p.isLocal);
        this.projects = [...serverProjects, ...localOnlyProjects];
      }

      // Fetch time entries (last 30 days to avoid huge downloads)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const entriesResponse = await this.makeApiRequest(
        `/time-entries?since=${thirtyDaysAgo.toISOString()}`
      );
      
      if (entriesResponse.ok) {
        const serverEntries = await entriesResponse.json();
        
        // Merge with local entries (keep local-only ones)
        const localOnlyEntries = this.timeEntries.filter(e => e.isLocal);
        this.timeEntries = [...serverEntries, ...localOnlyEntries];
      }

      // Save merged data locally
      await this.saveLocalData();
      
    } catch (error) {
      console.error('Error syncing from server:', error);
      throw error;
    }
  }

  async autoSync() {
    if (!this.syncInProgress && this.serverConfig.apiKey) {
      try {
        await this.syncToServer();
        console.log('Auto-sync completed');
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }
  }

  // ===== LOCAL DATA MANAGEMENT =====

  async saveLocalData() {
    try {
      await chrome.storage.local.set({
        'timer_projects': this.projects,
        'timer_entries': this.timeEntries,
        'last_updated': new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving local data:', error);
      // Fallback to localStorage
      localStorage.setItem('timer_projects', JSON.stringify(this.projects));
      localStorage.setItem('timer_entries', JSON.stringify(this.timeEntries));
    }
  }

  async loadLocalData() {
    try {
      const result = await chrome.storage.local.get(['timer_projects', 'timer_entries']);
      this.projects = result.timer_projects || [];
      this.timeEntries = result.timer_entries || [];
    } catch (error) {
      console.error('Error loading local data:', error);
      // Fallback to localStorage
      const storedProjects = localStorage.getItem('timer_projects');
      const storedEntries = localStorage.getItem('timer_entries');
      this.projects = storedProjects ? JSON.parse(storedProjects) : [];
      this.timeEntries = storedEntries ? JSON.parse(storedEntries) : [];
    }
  }

  // ===== UI MANAGEMENT =====

  setupEventListeners() {
    // Timer control button
    const timerBtn = document.getElementById('timerBtn');
    if (timerBtn) {
      timerBtn.addEventListener('click', () => this.toggleTimer());
    }

    // Project selector
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
      projectSelect.addEventListener('change', (e) => {
        this.selectedProject = e.target.value;
      });
    }

    // Add project button
    const addProjectBtn = document.getElementById('addProjectBtn');
    if (addProjectBtn) {
      addProjectBtn.addEventListener('click', () => this.showAddProjectForm());
    }

    // Action buttons
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => this.handleSync());
    }

    const analyticsBtn = document.getElementById('analyticsBtn');
    if (analyticsBtn) {
      analyticsBtn.addEventListener('click', () => this.showAnalytics());
    }

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportData());
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      this.handleBackgroundMessage(message);
    });
  }

  handleBackgroundMessage(message) {
    switch (message.action) {
      case 'timer-stopped':
        this.stopTimer();
        break;
      case 'sync-requested':
        this.handleSync();
        break;
      default:
        console.log('Unknown message:', message);
    }
  }

  showAddProjectForm() {
    if (this.showingAddProject) {
      this.hideAddProjectForm();
      return;
    }

    this.showingAddProject = true;
    
    const formHTML = `
      <div class="add-project-form" id="addProjectForm">
        <h3 class="form-title">Add New Project</h3>
        <div class="form-group">
          <label for="projectName">Project Name:</label>
          <input type="text" id="projectName" class="form-input" 
                 placeholder="Enter project name" maxlength="50" required>
        </div>
        <div class="form-group">
          <label for="projectDescription">Description (optional):</label>
          <input type="text" id="projectDescription" class="form-input" 
                 placeholder="Project description" maxlength="100">
        </div>
        <div class="form-group">
          <label for="projectColor">Color:</label>
          <div class="color-picker">
            <input type="color" id="projectColor" class="color-input" value="#667eea">
            <div class="color-presets">
              <button class="color-preset" style="background: #667eea" data-color="#667eea"></button>
              <button class="color-preset" style="background: #10b981" data-color="#10b981"></button>
              <button class="color-preset" style="background: #f59e0b" data-color="#f59e0b"></button>
              <button class="color-preset" style="background: #ef4444" data-color="#ef4444"></button>
              <button class="color-preset" style="background: #8b5cf6" data-color="#8b5cf6"></button>
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button class="form-btn cancel-btn" id="cancelAddProject">Cancel</button>
          <button class="form-btn save-btn" id="saveProject">Save Project</button>
        </div>
      </div>
    `;

    const projectSelector = document.querySelector('.project-selector');
    projectSelector.insertAdjacentHTML('afterend', formHTML);

    const addProjectBtn = document.getElementById('addProjectBtn');
    addProjectBtn.textContent = '✕';
    addProjectBtn.title = 'Cancel';

    this.setupAddProjectFormListeners();

    setTimeout(() => {
      document.getElementById('projectName').focus();
    }, 100);
  }

  hideAddProjectForm() {
    const form = document.getElementById('addProjectForm');
    if (form) {
      form.remove();
    }

    this.showingAddProject = false;

    const addProjectBtn = document.getElementById('addProjectBtn');
    addProjectBtn.textContent = '+';
    addProjectBtn.title = 'Add Project';
  }

  setupAddProjectFormListeners() {
    const cancelBtn = document.getElementById('cancelAddProject');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideAddProjectForm());
    }

    const saveBtn = document.getElementById('saveProject');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveNewProject());
    }

    const colorPresets = document.querySelectorAll('.color-preset');
    colorPresets.forEach(preset => {
      preset.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        document.getElementById('projectColor').value = color;
      });
    });

    const nameInput = document.getElementById('projectName');
    if (nameInput) {
      nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveNewProject();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.showingAddProject) {
        this.hideAddProjectForm();
      }
    });
  }

  populateProjectSelector() {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;

    const currentValue = projectSelect.value;
    projectSelect.innerHTML = '<option value="">Select Project...</option>';

    const sortedProjects = [...this.projects]
      .filter(p => p.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    sortedProjects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      
      const syncIndicator = project.isLocal ? ' (Local)' : '';
      option.textContent = project.name + syncIndicator;
      option.style.color = project.color || '#667eea';
      
      projectSelect.appendChild(option);
    });

    if (currentValue && this.projects.some(p => p.id === currentValue)) {
      projectSelect.value = currentValue;
      this.selectedProject = currentValue;
    }
  }

  // ===== STATISTICS =====

  updateStats() {
    this.updateTodayStats();
    this.updateWeekStats();
    this.updateFocusStats();
  }

  updateTodayStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEntries = this.timeEntries.filter(entry => 
      new Date(entry.createdAt) >= today
    );
    
    const totalTime = todayEntries.reduce((sum, entry) => sum + entry.duration, 0);
    const todayElement = document.getElementById('todayTime');
    if (todayElement) {
      todayElement.textContent = this.formatDuration(totalTime);
    }
  }

  updateWeekStats() {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEntries = this.timeEntries.filter(entry => 
      new Date(entry.createdAt) >= weekStart
    );
    
    const totalTime = weekEntries.reduce((sum, entry) => sum + entry.duration, 0);
    const weekElement = document.getElementById('weekTime');
    if (weekElement) {
      weekElement.textContent = this.formatDuration(totalTime);
    }
  }

  updateFocusStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEntries = this.timeEntries.filter(entry => 
      new Date(entry.createdAt) >= today
    );
    
    const totalTime = todayEntries.reduce((sum, entry) => sum + entry.duration, 0);
    const focusTime = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
    const focusPercentage = Math.min(100, Math.round((totalTime / focusTime) * 100));
    
    const focusElement = document.getElementById('focusPercentage');
    if (focusElement) {
      focusElement.textContent = `${focusPercentage}%`;
    }
  }

  updateRecentActivity() {
    const activityContainer = document.getElementById('recentActivity');
    if (!activityContainer) return;

    const recentEntries = [...this.timeEntries]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    if (recentEntries.length === 0) {
      activityContainer.innerHTML = `
        <div class="no-activity">
          <div class="activity-icon">📋</div>
          <p>No recent activity</p>
        </div>
      `;
      return;
    }

    const activityHTML = recentEntries.map(entry => {
      const project = this.projects.find(p => p.id === entry.projectId);
      const projectName = project ? project.name : 'Unknown Project';
      const projectColor = project ? project.color : '#667eea';
      const syncIndicator = entry.isLocal ? ' (Local)' : '';
      
      return `
        <div class="activity-item">
          <div class="activity-project" style="background-color: ${projectColor}20; border-left: 3px solid ${projectColor};">
            <div class="activity-project-name">${projectName}${syncIndicator}</div>
            <div class="activity-time">${this.formatDuration(entry.duration)}</div>
          </div>
          <div class="activity-date">${this.formatRelativeTime(entry.createdAt)}</div>
        </div>
      `;
    }).join('');

    activityContainer.innerHTML = activityHTML;
  }

  // ===== ANALYTICS =====

  showAnalytics() {
    const analyticsHTML = `
      <div class="modal-overlay" id="analyticsModal">
        <div class="modal-content analytics-modal">
          <div class="modal-header">
            <h2>Analytics</h2>
            <button class="modal-close" id="closeAnalytics">✕</button>
          </div>
          <div class="modal-body">
            ${this.generateAnalyticsHTML()}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', analyticsHTML);

    document.getElementById('closeAnalytics').addEventListener('click', () => {
      document.getElementById('analyticsModal').remove();
    });

    // Close on overlay click
    document.getElementById('analyticsModal').addEventListener('click', (e) => {
      if (e.target.id === 'analyticsModal') {
        document.getElementById('analyticsModal').remove();
      }
    });
  }

  generateAnalyticsHTML() {
    const totalTime = this.timeEntries.reduce((sum, entry) => sum + entry.duration, 0);
    const projectStats = this.getProjectStats();
    const dailyStats = this.getDailyStats();

    return `
      <div class="analytics-section">
        <h3>Total Time Tracked</h3>
        <div class="stat-large">${this.formatDuration(totalTime)}</div>
      </div>

      <div class="analytics-section">
        <h3>Project Breakdown</h3>
        <div class="project-stats">
          ${projectStats.map(stat => `
            <div class="project-stat-item">
              <div class="project-stat-bar">
                <div class="project-stat-fill" style="width: ${stat.percentage}%; background-color: ${stat.color}"></div>
              </div>
              <div class="project-stat-info">
                <span class="project-stat-name">${stat.name}</span>
                <span class="project-stat-time">${this.formatDuration(stat.time)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="analytics-section">
        <h3>Daily Activity (Last 7 Days)</h3>
        <div class="daily-chart">
          ${dailyStats.map(day => `
            <div class="daily-bar">
              <div class="daily-bar-fill" style="height: ${day.percentage}%"></div>
              <div class="daily-label">${day.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ===== EXPORT =====

  async exportData() {
    try {
      const exportData = {
        projects: this.projects,
        timeEntries: this.timeEntries,
        exportDate: new Date().toISOString(),
        version: '1.0',
        serverSynced: !!this.serverConfig.apiKey
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timer-data-${new Date().toISOString().split('T')[0]}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.showNotification('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.showNotification('Export failed', 'error');
    }
  }

  // ===== UTILITY METHODS =====

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours === 0 && minutes === 0) {
      return `${remainingSeconds}s`;
    } else if (hours === 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${hours}h ${minutes}m`;
    }
  }

  formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  getProjectStats() {
    const projectTimes = {};
    let totalTime = 0;

    this.timeEntries.forEach(entry => {
      if (!projectTimes[entry.projectId]) {
        projectTimes[entry.projectId] = 0;
      }
      projectTimes[entry.projectId] += entry.duration;
      totalTime += entry.duration;
    });

    return Object.entries(projectTimes).map(([projectId, time]) => {
      const project = this.projects.find(p => p.id === projectId);
      return {
        name: project ? project.name : 'Unknown',
        color: project ? project.color : '#667eea',
        time: time,
        percentage: totalTime > 0 ? (time / totalTime) * 100 : 0
      };
    }).sort((a, b) => b.time - a.time);
  }

  getDailyStats() {
    const dailyTimes = {};
    const last7Days = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toDateString();
      last7Days.push(dateKey);
      dailyTimes[dateKey] = 0;
    }

    this.timeEntries.forEach(entry => {
      const entryDate = new Date(entry.createdAt).toDateString();
      if (dailyTimes.hasOwnProperty(entryDate)) {
        dailyTimes[entryDate] += entry.duration;
      }
    });

    const maxTime = Math.max(...Object.values(dailyTimes));

    return last7Days.map(dateKey => {
      const date = new Date(dateKey);
      const time = dailyTimes[dateKey];
      return {
        label: date.toLocaleDateString('en', { weekday: 'short' }),
        time: time,
        percentage: maxTime > 0 ? (time / maxTime) * 100 : 0
      };
    });
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TimerPopup();
});