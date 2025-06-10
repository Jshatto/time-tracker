// shared/api-client.js
class APIClient {
    constructor(baseURL, options = {}) {
        this.baseURL = baseURL.replace(/\/$/, ''); // Remove trailing slash
        this.options = {
            timeout: 30000,
            retries: 3,
            retryDelay: 1000,
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        };
        
        this.requestInterceptors = [];
        this.responseInterceptors = [];
        this.errorInterceptors = [];
        
        // Default error handler
        this.onError = (error) => console.error('API Error:', error);
        
        // Request/response logging in development
        if (this.options.debug) {
            this.addRequestInterceptor((config) => {
                console.log('API Request:', config);
                return config;
            });
            
            this.addResponseInterceptor((response) => {
                console.log('API Response:', response);
                return response;
            });
        }
    }
    
    // Interceptor management
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
        return () => {
            const index = this.requestInterceptors.indexOf(interceptor);
            if (index > -1) this.requestInterceptors.splice(index, 1);
        };
    }
    
    addResponseInterceptor(interceptor) {
        this.responseInterceptors.push(interceptor);
        return () => {
            const index = this.responseInterceptors.indexOf(interceptor);
            if (index > -1) this.responseInterceptors.splice(index, 1);
        };
    }
    
    addErrorInterceptor(interceptor) {
        this.errorInterceptors.push(interceptor);
        return () => {
            const index = this.errorInterceptors.indexOf(interceptor);
            if (index > -1) this.errorInterceptors.splice(index, 1);
        };
    }
    
    // Authentication helpers
    setAuthToken(token) {
        this.options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    clearAuthToken() {
        delete this.options.headers['Authorization'];
    }
    
    setDeviceInfo(deviceId, platform, version) {
        this.options.headers['X-Device-ID'] = deviceId;
        this.options.headers['X-Platform'] = platform;
        this.options.headers['X-Version'] = version;
    }
    
    // Core request method
    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
        
        let config = {
            method: 'GET',
            headers: { ...this.options.headers },
            timeout: this.options.timeout,
            ...options
        };
        
        // Apply request interceptors
        for (const interceptor of this.requestInterceptors) {
            config = await interceptor(config) || config;
        }
        
        let lastError;
        
        // Retry logic
        for (let attempt = 0; attempt <= this.options.retries; attempt++) {
            try {
                const response = await this.fetchWithTimeout(url, config);
                
                // Check if response is ok
                if (!response.ok) {
                    throw new APIError(
                        `HTTP ${response.status}: ${response.statusText}`,
                        response.status,
                        response
                    );
                }
                
                // Parse response
                let data;
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }
                
                const result = {
                    data,
                    status: response.status,
                    headers: response.headers,
                    url: response.url
                };
                
                // Apply response interceptors
                for (const interceptor of this.responseInterceptors) {
                    await interceptor(result);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // Apply error interceptors
                for (const interceptor of this.errorInterceptors) {
                    await interceptor(error);
                }
                
                // Don't retry on certain errors
                if (error instanceof APIError && error.status < 500) {
                    break;
                }
                
                // Don't retry on last attempt
                if (attempt === this.options.retries) {
                    break;
                }
                
                // Wait before retry
                if (attempt < this.options.retries) {
                    await this.delay(this.options.retryDelay * Math.pow(2, attempt));
                }
            }
        }
        
        // Call error handler
        this.onError(lastError);
        throw lastError;
    }
    
    async fetchWithTimeout(url, config) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);
        
        try {
            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new APIError('Request timeout', 408);
            }
            throw error;
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // HTTP method helpers
    async get(endpoint, params = {}, options = {}) {
        const url = new URL(endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`);
        
        // Add query parameters
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, value);
            }
        });
        
        return this.request(url.toString(), { ...options, method: 'GET' });
    }
    
    async post(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    async put(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    async patch(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }
    
    async delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }
    
    // Convenience methods for common patterns
    async uploadFile(endpoint, file, additionalData = {}, onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);
        
        Object.entries(additionalData).forEach(([key, value]) => {
            formData.append(key, value);
        });
        
        const headers = { ...this.options.headers };
        delete headers['Content-Type']; // Let browser set it for FormData
        
        return this.request(endpoint, {
            method: 'POST',
            body: formData,
            headers
        });
    }
    
    async downloadFile(endpoint, options = {}) {
        const response = await this.request(endpoint, {
            ...options,
            headers: {
                ...this.options.headers,
                ...options.headers
            }
        });
        
        return response.data;
    }
    
    // Batch requests
    async batch(requests) {
        const promises = requests.map(req => 
            this.request(req.endpoint, req.options).catch(error => ({ error }))
        );
        
        return Promise.all(promises);
    }
    
    // Health check
    async ping() {
        try {
            const response = await this.get('/ping');
            return { healthy: true, latency: Date.now() - response.timestamp };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }
}

// Custom error class
class APIError extends Error {
    constructor(message, status, response = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.response = response;
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIClient, APIError };
} else {
    window.APIClient = APIClient;
    window.APIError = APIError;
}