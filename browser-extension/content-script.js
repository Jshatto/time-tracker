// browser-extension/content-script.js
(function() {
  'use strict';
  
  // Content script for page interaction and data collection
  class ContentScriptManager {
    constructor() {
      this.pageData = {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        timestamp: Date.now()
      };
      
      this.init();
    }
    
    init() {
      // Listen for page changes
      this.observePageChanges();
      
      // Listen for messages from background script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });
      
      // Send initial page data
      this.sendPageData();
    }
    
    observePageChanges() {
      // Observe title changes
      const titleObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && document.title !== this.pageData.title) {
            this.pageData.title = document.title;
            this.sendPageData();
          }
        });
      });
      
      titleObserver.observe(document.querySelector('title') || document.head, {
        childList: true,
        subtree: true
      });
      
      // Observe URL changes for SPAs
      let lastUrl = location.href;
      new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          this.pageData.url = url;
          this.pageData.timestamp = Date.now();
          this.sendPageData();
        }
      }).observe(document, { subtree: true, childList: true });
    }
    
    sendPageData() {
      chrome.runtime.sendMessage({
        type: 'page-data',
        data: this.pageData
      }).catch(() => {
        // Background script might not be ready, which is fine
      });
    }
    
    handleMessage(message, sender, sendResponse) {
      switch (message.type) {
        case 'get-page-data':
          sendResponse({ success: true, data: this.pageData });
          break;
          
        case 'extract-content':
          const content = this.extractPageContent();
          sendResponse({ success: true, data: content });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    }
    
    extractPageContent() {
      // Extract useful content for categorization
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 5).map(h => h.textContent.trim()),
        domain: window.location.hostname,
        path: window.location.pathname
      };
    }
  }
  
  // Initialize content script
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new ContentScriptManager());
  } else {
    new ContentScriptManager();
  }
})();