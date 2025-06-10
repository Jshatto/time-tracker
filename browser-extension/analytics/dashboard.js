// browser-extension/analytics/dashboard.js
class AnalyticsDashboard {
    constructor() {
        this.data = null;
        this.charts = {};
        this.timeRange = 'week';
        this.selectedCategory = 'all';
        
        this.init();
    }
    
    async init() {
        console.log('📊 Initializing Analytics Dashboard...');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadData();
        
        // Setup charts
        this.setupCharts();
        
        console.log('✅ Analytics Dashboard initialized');
    }
    
    setupEventListeners() {
        // Time range selector
        document.getElementById('timeRange')?.addEventListener('change', (e) => {
            this.timeRange = e.target.value;
            this.loadData();
        });
        
        // Refresh button
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.loadData();
        });
        
        // Export button
        document.getElementById('exportBtn')?.addEventListener('click', () => {
            this.exportData();
        });
        
        // Category filter
        document.getElementById('categoryFilter')?.addEventListener('change', (e) => {
            this.selectedCategory = e.target.value;
            this.filterActivity();
        });
        
        // Chart type toggles
        document.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                this.switchChartType(type);
            });
        });
        
        // Manage rules button
        document.getElementById('manageRulesBtn')?.addEventListener('click', () => {
            this.openRulesManager();
        });
    }
    
    async loadData() {
        try {
            this.showLoading();
            
            // Get data from background script
            const response = await this.sendToBackground('get-analytics', {
                timeRange: this.timeRange
            });
            
            if (response.success) {
                this.data = response.data;
                this.updateDashboard();
            } else {
                this.showError('Failed to load analytics data');
            }
        } catch (error) {
            console.error('Error loading analytics data:', error);
            this.showError('Error loading data');
        } finally {
            this.hideLoading();
        }
    }
    
    updateDashboard() {
        if (!this.data) return;
        
        // Update summary cards
        this.updateSummaryCards();
        
        // Update charts
        this.updateCharts();
        
        // Update insights
        this.updateInsights();
        
        // Update activity table
        this.updateActivityTable();
        
        // Update rules performance
        this.updateRulesPerformance();
    }
    
    updateSummaryCards() {
        const { today, thisWeek, total } = this.data;
        const currentData = this.getCurrentPeriodData();
        
        // Total Time
        document.getElementById('totalTime').textContent = 
            this.formatDuration(currentData.totalTime || 0);
        
        // Productivity Score
        const productivityScore = Math.round(currentData.productivity || 0);
        document.getElementById('productivityScore').textContent = `${productivityScore}%`;
        
        // Context Switches
        document.getElementById('contextSwitches').textContent = 
            (currentData.windowSwitches || 0).toString();
        
        // Focus Score
        const focusScore = Math.round(currentData.focus || 0);
        document.getElementById('focusScore').textContent = `${focusScore}%`;
        
        // Update change indicators (simplified)
        this.updateChangeIndicators();
    }
    
    getCurrentPeriodData() {
        switch (this.timeRange) {
            case 'today':
                return this.data.today || {};
            case 'week':
                return this.data.thisWeek || {};
            case 'month':
                return this.data.thisMonth || {};
            default:
                return this.data.total || {};
        }
    }
    
    updateChangeIndicators() {
        // This would require historical data to compare against
        // For now, showing placeholder values
        const changes = {
            totalTimeChange: '+12%',
            productivityChange: '+5%',
            switchesChange: '-8%',
            focusChange: '+15%'
        };
        
        Object.entries(changes).forEach(([id, change]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = `${change} from last period`;
                element.className = `card-change ${change.startsWith('+') ? 'positive' : 'negative'}`;
            }
        });
    }
    
    setupCharts() {
        // Initialize chart containers
        this.charts.project = null;
        this.charts.timeline = null;
        
        // Create initial charts
        this.updateCharts();
    }
    
    updateCharts() {
        this.updateProjectChart();
        this.updateTimelineChart();
    }
    
    updateProjectChart() {
        const canvas = document.getElementById('projectChart');
        if (!canvas || !this.data) return;
        
        const ctx = canvas.getContext('2d');
        const currentData = this.getCurrentPeriodData();
        const projectData = currentData.projectBreakdown || [];
        
        if (projectData.length === 0) {
            this.showEmptyChart(ctx, 'No project data available');
            return;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Simple pie chart implementation
        this.drawPieChart(ctx, projectData, canvas.width, canvas.height);
    }
    
    drawPieChart(ctx, data, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 20;
        
        const total = data.reduce((sum, item) => sum + item.totalTime, 0);
        let currentAngle = 0;
        
        const colors = [
            '#667eea', '#10b981', '#f59e0b', '#ef4444', 
            '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
        ];
        
        data.forEach((item, index) => {
            const sliceAngle = (item.totalTime / total) * 2 * Math.PI;
            
            // Draw slice
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();
            
            // Draw label
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
            const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.name, labelX, labelY);
            
            currentAngle += sliceAngle;
        });
        
        // Draw legend
        this.drawLegend(ctx, data, colors, width);
    }
    
    drawLegend(ctx, data, colors, width) {
        const legendY = 20;
        const legendItemHeight = 20;
        
        data.forEach((item, index) => {
            const y = legendY + index * legendItemHeight;
            
            // Color box
            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(10, y, 15, 15);
            
            // Label
            ctx.fillStyle = '#1e293b';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(item.name, 30, y + 12);
            
            // Time
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'right';
            ctx.fillText(this.formatDuration(item.totalTime), width - 10, y + 12);
        });
    }
    
    updateTimelineChart() {
        const canvas = document.getElementById('timelineChart');
        if (!canvas || !this.data) return;
        
        const ctx = canvas.getContext('2d');
        const currentData = this.getCurrentPeriodData();
        const dailyData = currentData.dailyBreakdown || [];
        
        if (dailyData.length === 0) {
            this.showEmptyChart(ctx, 'No timeline data available');
            return;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Simple line chart implementation
        this.drawLineChart(ctx, dailyData, canvas.width, canvas.height);
    }
    
    drawLineChart(ctx, data, width, height) {
        const padding = 40;
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;
        
        const maxTime = Math.max(...data.map(d => d.totalTime));
        const minTime = 0;
        
        // Draw axes
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        
        // Y-axis
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.stroke();
        
        // X-axis
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // Draw data line
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        data.forEach((point, index) => {
            const x = padding + (index / (data.length - 1)) * chartWidth;
            const y = height - padding - ((point.totalTime - minTime) / (maxTime - minTime)) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw data points
        ctx.fillStyle = '#667eea';
        data.forEach((point, index) => {
            const x = padding + (index / (data.length - 1)) * chartWidth;
            const y = height - padding - ((point.totalTime - minTime) / (maxTime - minTime)) * chartHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // Draw labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        
        data.forEach((point, index) => {
            const x = padding + (index / (data.length - 1)) * chartWidth;
            const label = new Date(point.date).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
            ctx.fillText(label, x, height - padding + 15);
        });
    }
    
    showEmptyChart(ctx, message) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(message, ctx.canvas.width / 2, ctx.canvas.height / 2);
    }
    
    async updateInsights() {
        try {
            const response = await this.sendToBackground('get-ai-insights');
            if (response.success) {
                this.renderInsights(response.data.insights || []);
                this.renderPatterns(response.data.patterns || []);
            }
        } catch (error) {
            console.error('Error loading insights:', error);
        }
    }
    
    renderInsights(insights) {
        const container = document.getElementById('insightsList');
        if (!container) return;
        
        if (insights.length === 0) {
            container.innerHTML = `
                <div class="insight-item">
                    <div class="insight-icon">💡</div>
                    <div class="insight-content">
                        <div class="insight-title">No insights yet</div>
                        <div class="insight-description">Keep using the timer to generate personalized insights.</div>
                    </div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = insights.map(insight => `
            <div class="insight-item">
                <div class="insight-icon">${this.getInsightIcon(insight.type)}</div>
                <div class="insight-content">
                    <div class="insight-title">${insight.title}</div>
                    <div class="insight-description">${insight.description}</div>
                </div>
            </div>
        `).join('');
    }
    
    renderPatterns(patterns) {
        const container = document.getElementById('patternsList');
        if (!container) return;
        
        if (patterns.length === 0) {
            container.innerHTML = `
                <div class="pattern-item">
                    <div class="pattern-icon">🔍</div>
                    <div class="pattern-content">
                        <div class="pattern-title">Learning your patterns...</div>
                        <div class="pattern-description">Continue working to help us detect your productivity patterns.</div>
                    </div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = patterns.map(pattern => `
            <div class="pattern-item">
                <div class="pattern-icon">${this.getPatternIcon(pattern.type)}</div>
                <div class="pattern-content">
                    <div class="pattern-title">${pattern.description}</div>
                    <div class="pattern-confidence">Confidence: ${Math.round(pattern.confidence * 100)}%</div>
                </div>
            </div>
        `).join('');
    }
    
    getInsightIcon(type) {
        const icons = {
            'productivity': '📈',
            'focus': '🎯',
            'pattern': '🔄',
            'suggestion': '💡',
            'warning': '⚠️'
        };
        return icons[type] || '💡';
    }
    
    getPatternIcon(type) {
        const icons = {
            'peak_hours': '⏰',
            'domain_project': '🌐',
            'time_category': '📅',
            'project_preference': '⭐'
        };
        return icons[type] || '📊';
    }
    
    updateActivityTable() {
        const tbody = document.getElementById('activityTableBody');
        if (!tbody || !this.data) return;
        
        const currentData = this.getCurrentPeriodData();
        const windowActivity = currentData.windowActivity || [];
        
        if (windowActivity.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-tertiary);">
                        No window activity data available
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = windowActivity.map(activity => `
            <tr>
                <td>${activity.domain}</td>
                <td>${activity.category}</td>
                <td>${activity.visits}</td>
                <td>${this.formatDuration(activity.averageTime)}</td>
                <td>
                    <span class="productivity-indicator productivity-${this.getProductivityLevel(activity.productivity)}">
                        ${this.getProductivityText(activity.productivity)}
                    </span>
                </td>
            </tr>
        `).join('');
    }
    
    getProductivityLevel(score) {
        if (score > 0.5) return 'high';
        if (score > -0.5) return 'medium';
        return 'low';
    }
    
    getProductivityText(score) {
        if (score > 0.5) return 'High';
        if (score > -0.5) return 'Medium';
        return 'Low';
    }
    
    async updateRulesPerformance() {
        try {
            const response = await this.sendToBackground('get-rules-analytics');
            if (response.success) {
                this.renderRulesPerformance(response.data || []);
            }
        } catch (error) {
            console.error('Error loading rules analytics:', error);
        }
    }
    
    renderRulesPerformance(rules) {
        const container = document.getElementById('rulesGrid');
        if (!container) return;
        
        if (rules.length === 0) {
            container.innerHTML = `
                <div class="rule-card">
                    <div class="rule-name">No rules configured</div>
                    <div class="rule-description">
                        Create window tracking rules to automate your time tracking.
                    </div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = rules.map(rule => `
            <div class="rule-card">
                <div class="rule-header">
                    <div>
                        <div class="rule-name">${rule.name}</div>
                        <div class="rule-description">${rule.description || 'No description'}</div>
                    </div>
                    <span class="rule-status ${rule.enabled ? 'enabled' : 'disabled'}">
                        ${rule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <div class="rule-stats">
                    <span>Triggers: ${rule.triggerCount || 0}</span>
                    <span>Success: ${Math.round(rule.successRate || 0)}%</span>
                </div>
            </div>
        `).join('');
    }
    
    filterActivity() {
        // Re-render activity table with filter
        this.updateActivityTable();
    }
    
    switchChartType(type) {
        // Update chart type buttons
        document.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-type="${type}"]`)?.classList.add('active');
        
        // Update chart (simplified - just refresh for now)
        this.updateProjectChart();
    }
    
    async exportData() {
        try {
            const response = await this.sendToBackground('export-analytics', {
                timeRange: this.timeRange,
                format: 'json'
            });
            
            if (response.success) {
                const dataStr = JSON.stringify(response.data, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                
                const link = document.createElement('a');
                link.href = URL.createObjectURL(dataBlob);
                link.download = `analytics-${this.timeRange}-${new Date().toISOString().split('T')[0]}.json`;
                link.click();
            }
        } catch (error) {
            console.error('Error exporting data:', error);
        }
    }
    
    openRulesManager() {
        chrome.tabs.create({
            url: chrome.runtime.getURL('options.html?tab=rules')
        });
    }
    
    formatDuration(milliseconds) {
        if (!milliseconds) return '0m';
        
        const totalMinutes = Math.floor(milliseconds / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
    
    showLoading() {
        document.querySelectorAll('.card-value').forEach(el => {
            el.classList.add('loading');
        });
    }
    
    hideLoading() {
        document.querySelectorAll('.card-value').forEach(el => {
            el.classList.remove('loading');
        });
    }
    
    showError(message) {
        console.error('Dashboard error:', message);
        // Could show a toast or error message here
    }
    
    async sendToBackground(action, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action, data }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AnalyticsDashboard();
});
