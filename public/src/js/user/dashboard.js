// User dashboard functionality
class UserDashboard {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.user = null;
    this.assignedPages = [];
  }

  async init() {
    this.user = getUserSession();
    if (!this.user) {
      userLogin.showLogin();
      return;
    }

    await this.loadAssignedPages();
    this.setupEventListeners();
  }

  async loadAssignedPages() {
    try {
      const container = document.getElementById('pages-list');
      container.innerHTML = '<div class="spinner"></div>';

      // Get page details for each assigned page
      const pagePromises = this.user.assigned_pages.map(pageId => 
        this.apiClient.getUserPage(pageId, this.user.user_id)
      );

      const pages = await Promise.all(pagePromises);
      this.assignedPages = pages;

      this.renderPages();
      this.updateCompletionStatus();
    } catch (error) {
      console.error('Error loading assigned pages:', error);
      this.showError('Failed to load your assigned pages');
    }
  }

  renderPages() {
    const container = document.getElementById('pages-list');
    container.innerHTML = '';

    if (this.assignedPages.length === 0) {
      container.innerHTML = '<p class="text-muted">No pages assigned to you yet.</p>';
      return;
    }

    this.assignedPages.forEach(page => {
      const card = document.createElement('div');
      card.className = 'page-card';
      card.dataset.pageId = page.id;
      
      // Check if page is completed
      const isCompleted = this.isPageCompleted(page.id);
      card.classList.add(isCompleted ? 'completed' : 'pending');
      
      card.innerHTML = `
        <h3>Page ${page.page_number}: ${this.escapeHtml(page.title)}</h3>
        <p>${page.page_type === 'template' ? 'Form to complete' : 'Content to review'}</p>
        <span class="status ${isCompleted ? 'completed' : 'pending'}">
          ${isCompleted ? 'Completed' : 'Pending'}
        </span>
      `;

      card.addEventListener('click', () => {
        if (!isCompleted) {
          this.openPage(page);
        }
      });

      container.appendChild(card);
    });
  }

  isPageCompleted(pageId) {
    // This would need to check if the page has been submitted
    // For now, we'll use localStorage to track completion
    const completedPages = JSON.parse(localStorage.getItem('completed_pages') || '[]');
    return completedPages.includes(pageId);
  }

  markPageCompleted(pageId) {
    const completedPages = JSON.parse(localStorage.getItem('completed_pages') || '[]');
    if (!completedPages.includes(pageId)) {
      completedPages.push(pageId);
      localStorage.setItem('completed_pages', JSON.stringify(completedPages));
    }
  }

  openPage(page) {
    if (pageEntry) {
      pageEntry.loadPage(page);
    }
  }

  updateCompletionStatus() {
    const completedCount = this.assignedPages.filter(page => 
      this.isPageCompleted(page.id)
    ).length;
    
    const totalCount = this.assignedPages.length;
    const statusDiv = document.getElementById('completion-status');
    
    if (totalCount === 0) {
      statusDiv.textContent = '';
    } else if (completedCount === totalCount) {
      statusDiv.textContent = '🎉 All pages completed!';
    } else {
      statusDiv.textContent = `Progress: ${completedCount}/${totalCount} pages completed`;
    }
  }

  setupEventListeners() {
    // Event listeners are handled in the renderPages method
  }

  showError(message) {
    const container = document.getElementById('pages-list');
    container.innerHTML = `<p class="error-message">${message}</p>`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const userDashboard = new UserDashboard(apiClient);