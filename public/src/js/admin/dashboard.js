// Admin dashboard functionality
class AdminDashboard {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async init() {
    await this.loadNotebooks();
    await this.loadStatistics();
    this.setupNotebookControls();
  }

  setupNotebookControls() {
    const createButton = document.getElementById('createNotebookBtn');
    if (createButton && !createButton.dataset.bound) {
      createButton.dataset.bound = 'true';
      createButton.addEventListener('click', () => this.showCreateNotebookModal());
    }
  }

  showCreateNotebookModal() {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">Create Notebook</h3>
        <button class="modal-close" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="notebookTitle">Title</label>
          <input type="text" id="notebookTitle" required>
        </div>
        <div class="form-group">
          <label for="notebookDescription">Description</label>
          <textarea id="notebookDescription" rows="3"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel" type="button">Cancel</button>
        <button class="btn btn-primary modal-confirm" type="button">Create</button>
      </div>
    `;

    showElement(overlay);
    const close = () => hideElement(overlay);
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    modal.querySelector('.modal-confirm').addEventListener('click', () => this.createNotebook(close));
  }

  async createNotebook(close) {
    const title = document.getElementById('notebookTitle').value.trim();
    if (!title) {
      this.showError('Notebook title is required');
      return;
    }

    try {
      const notebook = await this.apiClient.createNotebook({
        title,
        description: document.getElementById('notebookDescription').value.trim(),
        type: 'standard'
      });
      close();
      this.showSuccess('Notebook created successfully');
      await this.loadNotebooks();
      this.showCoverDesigner(notebook);
    } catch (error) {
      console.error('Create notebook error:', error);
      this.showError('Failed to create notebook');
    }
  }

  showCoverDesigner(notebook) {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;

    const coverTitle = notebook.cover_title || notebook.title;
    const coverSubtitle = notebook.cover_subtitle || notebook.description || '';
    let coverLogoId = notebook.cover_logo_id || '';
    let coverLogoUrl = notebook.cover_logo_id ? `${this.apiClient.baseURL}/api/files/${encodeURIComponent(notebook.cover_logo_id)}` : '';
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">Design Your Cover</h3>
        <button class="modal-close" type="button">&times;</button>
      </div>
      <div class="cover-designer">
        <div class="cover-controls">
          <div class="form-group">
            <label for="coverLogo">Logo above title</label>
            <input id="coverLogo" type="file" accept="image/png,image/jpeg">
            <small class="text-muted">PNG or JPG</small>
          </div>
          <div class="form-group">
            <label for="coverTitle">Cover Title</label>
            <input id="coverTitle" value="${this.escapeHtml(coverTitle)}">
          </div>
          <div class="form-group">
            <label for="coverSubtitle">Subtitle</label>
            <textarea id="coverSubtitle" rows="3">${this.escapeHtml(coverSubtitle)}</textarea>
          </div>
          <div class="form-group">
            <label for="coverBackground">Background</label>
            <input id="coverBackground" type="color" value="${notebook.cover_background_color || '#17324d'}">
          </div>
          <div class="form-group">
            <label for="coverTextColor">Text Color</label>
            <input id="coverTextColor" type="color" value="${notebook.cover_text_color || '#ffffff'}">
          </div>
          <div class="form-group">
            <label for="coverFont">Font</label>
            <select id="coverFont">
              <option value="Georgia">Georgia</option>
              <option value="Arial">Arial</option>
              <option value="Verdana">Verdana</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
            </select>
          </div>
        </div>
        <div id="coverPreview" class="cover-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary cover-skip" type="button">Skip for now</button>
        <button class="btn btn-primary cover-save" type="button">Save Cover & Continue</button>
      </div>
    `;

    showElement(overlay);
    const close = () => hideElement(overlay);
    const updatePreview = () => {
      const preview = document.getElementById('coverPreview');
      preview.style.backgroundColor = document.getElementById('coverBackground').value;
      preview.style.color = document.getElementById('coverTextColor').value;
      preview.style.fontFamily = document.getElementById('coverFont').value;
      preview.innerHTML = `${coverLogoUrl ? `<img src="${this.escapeHtml(coverLogoUrl)}" alt="Cover logo">` : ''}<strong>${this.escapeHtml(document.getElementById('coverTitle').value)}</strong><span>${this.escapeHtml(document.getElementById('coverSubtitle').value)}</span>`;
    };
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.cover-skip').addEventListener('click', () => {
      close();
      this.navigateToNotebookEditor(notebook.id);
    });
    modal.querySelector('.cover-save').addEventListener('click', async () => {
      try {
        await this.apiClient.updateNotebook(notebook.id, {
          title: notebook.title,
          cover_title: document.getElementById('coverTitle').value.trim(),
          cover_subtitle: document.getElementById('coverSubtitle').value.trim(),
          cover_logo_id: coverLogoId || undefined,
          cover_background_color: document.getElementById('coverBackground').value,
          cover_text_color: document.getElementById('coverTextColor').value,
          global_font_family: document.getElementById('coverFont').value
        });
        close();
        this.showSuccess('Cover saved successfully');
        this.navigateToNotebookEditor(notebook.id);
      } catch (error) {
        console.error('Cover save error:', error);
        this.showError('Failed to save cover');
      }
    });
    document.getElementById('coverLogo').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const uploaded = await this.apiClient.uploadFile(file, 'covers');
        coverLogoId = uploaded.file_id;
        coverLogoUrl = uploaded.url;
        updatePreview();
      } catch (error) {
        console.error('Cover logo upload error:', error);
        this.showError('Failed to upload cover logo');
      }
    });
    modal.querySelectorAll('input, textarea, select').forEach((control) => {
      control.addEventListener('input', updatePreview);
      control.addEventListener('change', updatePreview);
    });
    updatePreview();
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

  async loadNotebooksPage() {
    try {
      const notebooks = await this.apiClient.getNotebooks();
      const container = document.getElementById('notebooks-list');
      if (!container) return;
      container.innerHTML = notebooks.map(notebook => `
        <div class="notebook-card">
          <h3>${this.escapeHtml(notebook.title)}</h3>
          <p>${this.escapeHtml(notebook.description || 'No description')}</p>
          <button class="btn btn-small btn-primary" data-action="edit" data-id="${notebook.id}">Edit</button>
        </div>
      `).join('') || '<p class="text-muted">No notebooks created yet.</p>';
      container.onclick = (event) => {
        const button = event.target.closest('[data-action="edit"]');
        if (button) this.navigateToNotebookEditor(button.dataset.id);
      };
    } catch (error) {
      console.error('Error loading notebooks page:', error);
      this.showError('Failed to load notebooks');
    }
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

    if (pageId === 'notebooks') {
      this.loadNotebooksPage();
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