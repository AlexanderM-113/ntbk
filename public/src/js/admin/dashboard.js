// Admin dashboard functionality
class AdminDashboard {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async init() {
    await this.loadNotebooks();
    await this.loadStatistics();
  }

  async loadNotebooks() {
    try {
      const notebooks = await this.apiClient.getNotebooks();
      this.renderNotebookCards(notebooks);
    } catch (error) {
      console.error('Error loading notebooks:', error);
      this.showError('Failed to load notebooks');
    }
  }

  renderNotebookCards(notebooks) {
    const container = document.getElementById('notebook-cards');
    if (!container) return;
    
    container.innerHTML = '';

    if (notebooks.length === 0) {
      container.innerHTML = '<p class="text-muted">No notebooks created yet.</p>';
      return;
    }

    notebooks.forEach(notebook => {
      const card = document.createElement('div');
      card.className = 'notebook-card';
      card.innerHTML = `
        <h3>${this.escapeHtml(notebook.title)}</h3>
        <p>${this.escapeHtml(notebook.description || 'No description')}</p>
        <div class="notebook-stats">
          <span>${notebook.page_count || 0} pages</span>
          <span>${notebook.entry_count || 0} entries</span>
        </div>
        <div class="notebook-status">
          <span class="badge badge-${notebook.status}">${notebook.status}</span>
        </div>
        <div class="notebook-actions">
          <button class="btn btn-small btn-primary" data-action="edit" data-id="${notebook.id}">
            Edit
          </button>
          <button class="btn btn-small btn-secondary" data-action="entries" data-id="${notebook.id}">
            Entries
          </button>
          <button class="btn btn-small btn-danger" data-action="delete" data-id="${notebook.id}">
            Delete
          </button>
        </div>
      `;

      container.appendChild(card);
    });

    // Add event listeners
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        this.handleNotebookAction(button.dataset.action, button.dataset.id);
      }
    });
  }

  handleNotebookAction(action, notebookId) {
    switch (action) {
      case 'edit':
        this.navigateToNotebookEditor(notebookId);
        break;
      case 'entries':
        this.navigateToEntries(notebookId);
        break;
      case 'delete':
        if (confirm('Are you sure you want to delete this notebook? This cannot be undone.')) {
          this.deleteNotebook(notebookId);
        }
        break;
    }
  }

  async deleteNotebook(notebookId) {
    try {
      await this.apiClient.deleteNotebook(notebookId);
      this.showSuccess('Notebook deleted successfully');
      this.loadNotebooks();
    } catch (error) {
      this.showError('Failed to delete notebook');
      console.error('Delete error:', error);
    }
  }

  async loadStatistics() {
    try {
      const stats = await this.apiClient.getStatistics();
      this.renderStatistics(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  }

  renderStatistics(stats) {
    const container = document.getElementById('statistics');
    if (!container) return;
    
    container.innerHTML = `
      <div class="stat-card">
        <h4>Total Entries</h4>
        <p class="stat-value">${stats.total_entries || 0}</p>
      </div>
      <div class="stat-card">
        <h4>This Week</h4>
        <p class="stat-value">${stats.entries_this_week || 0}</p>
      </div>
      <div class="stat-card">
        <h4>Pending</h4>
        <p class="stat-value">${stats.pending_entries || 0}</p>
      </div>
    `;
  }

  navigateToNotebookEditor(notebookId) {
    // Store current notebook ID
    this.currentNotebookId = notebookId;
    
    // Switch to editor page
    this.switchPage('notebook-editor');
    
    // Load notebook editor
    if (notebookEditor) {
      notebookEditor.loadNotebook(notebookId);
    }
  }

  navigateToEntries(notebookId) {
    // Store current notebook ID
    this.currentNotebookId = notebookId;
    
    // Switch to entries page
    this.switchPage('entries');
    
    // Load entries
    if (entriesManager) {
      entriesManager.loadNotebookEntries(notebookId);
    }
  }

  switchPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    
    // Remove active class from nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Show target page
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
      targetPage.classList.add('active');
    }
    
    // Activate corresponding nav button
    const navButton = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
    if (navButton) {
      navButton.classList.add('active');
    }
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type) {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 4px;
      color: white;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;

    if (type === 'success') {
      notification.style.backgroundColor = '#28a745';
    } else {
      notification.style.backgroundColor = '#dc3545';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const adminDashboard = new AdminDashboard(apiClient);