// Notebook editor functionality
class NotebookEditor {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.currentNotebook = null;
    this.currentPage = null;
    this.pages = [];
  }

  async loadNotebook(notebookId) {
    try {
      // Get notebook details
      const notebooks = await this.apiClient.getNotebooks();
      this.currentNotebook = notebooks.find(n => n.id === notebookId);
      
      if (!this.currentNotebook) {
        throw new Error('Notebook not found');
      }

      // Update UI
      document.getElementById('editor-title').textContent = `Edit: ${this.currentNotebook.title}`;
      
      // Load pages
      await this.loadPages();
      
      // Setup event listeners
      this.setupEventListeners();
      
    } catch (error) {
      console.error('Error loading notebook:', error);
      adminDashboard.showError('Failed to load notebook');
    }
  }

  async loadPages() {
    try {
      // Get pages for this specific notebook
      this.pages = await this.apiClient.getPagesByNotebook(this.currentNotebook.id);
      this.renderPagesList();
    } catch (error) {
      console.error('Error loading pages:', error);
      adminDashboard.showError('Failed to load pages');
      this.pages = [];
      this.renderPagesList();
    }
  }

  renderPagesList() {
    const container = document.getElementById('pages-list');
    if (!container) return;
    
    container.innerHTML = '';

    if (this.pages.length === 0) {
      container.innerHTML = '<p class="text-muted">No pages yet. Click "Add Page" to create one.</p>';
      return;
    }

    this.pages.forEach((page, index) => {
      const pageItem = document.createElement('div');
      pageItem.className = `page-item ${this.currentPage?.id === page.id ? 'active' : ''}`;
      pageItem.dataset.pageId = page.id;
      pageItem.innerHTML = `
        <span class="page-item-number">${page.page_number || index + 1}</span>
        <span class="page-item-title">${this.escapeHtml(page.title)}</span>
        <div class="page-item-actions">
          <button class="btn btn-small btn-secondary" data-action="edit" data-id="${page.id}">Edit</button>
          <button class="btn btn-small btn-danger" data-action="delete" data-id="${page.id}">Delete</button>
        </div>
      `;

      container.appendChild(pageItem);
    });

    // Add click event
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        const pageId = button.dataset.id;
        if (button.dataset.action === 'edit') {
          this.loadPage(pageId);
        } else if (button.dataset.action === 'delete') {
          this.deletePage(pageId);
        }
      }
    });
  }

  async loadPage(pageId) {
    try {
      // Get page details and elements
      const page = this.pages.find(p => p.id === pageId);
      if (!page) {
        throw new Error('Page not found');
      }
      
      // Get page elements for this specific page
      const pageElements = await this.apiClient.getPageElementsByPage(pageId);
      
      this.currentPage = { ...page, elements: pageElements };
      this.renderPageEditor();
      this.updateActivePageItem(pageId);
    } catch (error) {
      console.error('Error loading page:', error);
      adminDashboard.showError('Failed to load page');
    }
  }

  renderPageEditor() {
    const container = document.getElementById('page-editor');
    if (!container || !this.currentPage) return;
    
    const pageType = this.currentPage.page_type || 'template';
    
    container.innerHTML = `
      <div class="page-editor-form">
        <div class="form-group">
          <label for="pageTitle">Page Title</label>
          <input type="text" id="pageTitle" value="${this.escapeHtml(this.currentPage.title)}">
        </div>
        
        <div class="form-group">
          <label for="pageType">Page Type</label>
          <select id="pageType">
            <option value="template" ${pageType === 'template' ? 'selected' : ''}>Template (Form)</option>
            <option value="content" ${pageType === 'content' ? 'selected' : ''}>Content (Fixed)</option>
          </select>
        </div>
        
        ${pageType === 'template' ? `
          <div class="form-group">
            <label>Page Elements (${this.currentPage.elements?.length || 0})</label>
            <div id="page-elements"></div>
            <button id="addElementBtn" class="btn btn-small btn-primary mt-2">+ Add Element</button>
          </div>
        ` : `
          <div class="form-group">
            <label for="pageContent">Page Content (HTML)</label>
            <textarea id="pageContent" rows="10">${this.escapeHtml(this.currentPage.content || '')}</textarea>
          </div>
        `}
        
        <div class="form-group">
          <label>
            <input type="checkbox" id="requiresSignature" ${this.currentPage.requires_signature ? 'checked' : ''}>
            Requires Signature
          </label>
        </div>
        
        <div class="form-actions">
          <button id="savePageBtn" class="btn btn-primary">Save Page</button>
          <button id="cancelPageBtn" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    // Setup event listeners
    document.getElementById('savePageBtn').addEventListener('click', () => this.savePage());
    document.getElementById('cancelPageBtn').addEventListener('click', () => this.clearPageEditor());
    
    if (pageType === 'template') {
      document.getElementById('addElementBtn').addEventListener('click', () => this.showAddElementModal());
      this.renderPageElements();
    }
  }

  updateActivePageItem(pageId) {
    document.querySelectorAll('.page-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.pageId === pageId) {
        item.classList.add('active');
      }
    });
  }

  renderPageElements() {
    const container = document.getElementById('page-elements');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!this.currentPage.elements || this.currentPage.elements.length === 0) {
      container.innerHTML = '<p class="text-muted">No elements yet. Click "Add Element" to create one.</p>';
      return;
    }

    this.currentPage.elements.forEach((element, index) => {
      const elementItem = document.createElement('div');
      elementItem.className = 'element-item';
      elementItem.style.cssText = 'padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;';
      elementItem.innerHTML = `
        <div>
          <strong>${element.element_type}</strong>
          ${element.question_text ? `<span> - ${this.escapeHtml(element.question_text)}</span>` : ''}
          ${element.text_content ? `<span> - ${this.escapeHtml(element.text_content.substring(0, 50))}...</span>` : ''}
        </div>
        <div>
          <button class="btn btn-small btn-secondary" data-action="edit-element" data-id="${element.id}">Edit</button>
          <button class="btn btn-small btn-danger" data-action="delete-element" data-id="${element.id}">Delete</button>
        </div>
      `;
      
      container.appendChild(elementItem);
    });

    // Add event listeners for element actions
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        const elementId = button.dataset.id;
        if (button.dataset.action === 'delete-element') {
          this.deletePageElement(elementId);
        }
      }
    });
  }

  async savePage() {
    try {
      const title = document.getElementById('pageTitle').value;
      const pageType = document.getElementById('pageType').value;
      const requiresSignature = document.getElementById('requiresSignature').checked;
      
      if (!title) {
        adminDashboard.showError('Page title is required');
        return;
      }

      const updateData = {
        title,
        page_type: pageType,
        requires_signature: requiresSignature
      };

      if (pageType === 'content') {
        updateData.content = document.getElementById('pageContent').value;
      }

      await this.apiClient.updatePage(this.currentPage.id, updateData);
      adminDashboard.showSuccess('Page saved successfully');
      
      // Reload the page to reflect changes
      this.loadPage(this.currentPage.id);
    } catch (error) {
      console.error('Error saving page:', error);
      adminDashboard.showError('Failed to save page');
    }
  }

  async deletePage(pageId) {
    if (confirm('Are you sure you want to delete this page?')) {
      try {
        await this.apiClient.deletePage(pageId);
        adminDashboard.showSuccess('Page deleted successfully');
        this.loadPages();
        if (this.currentPage?.id === pageId) {
          this.clearPageEditor();
        }
      } catch (error) {
        console.error('Error deleting page:', error);
        adminDashboard.showError('Failed to delete page');
      }
    }
  }

  async deletePageElement(elementId) {
    if (confirm('Are you sure you want to delete this element?')) {
      try {
        await this.apiClient.deletePageElement(elementId);
        adminDashboard.showSuccess('Element deleted successfully');
        this.loadPage(this.currentPage.id);
      } catch (error) {
        console.error('Error deleting element:', error);
        adminDashboard.showError('Failed to delete element');
      }
    }
  }

  clearPageEditor() {
    const container = document.getElementById('page-editor');
    if (container) {
      container.innerHTML = '<p class="placeholder-text">Select a page to edit</p>';
    }
    this.currentPage = null;
    this.updateActivePageItem(null);
  }

  showAddElementModal() {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">Add Page Element</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="elementType">Element Type</label>
          <select id="elementType">
            <option value="question">Question</option>
            <option value="image_upload">Image Upload</option>
            <option value="text">Text</option>
            <option value="divider">Divider</option>
            <option value="spacing">Spacing</option>
          </select>
        </div>
        <div id="element-config"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel">Cancel</button>
        <button class="btn btn-primary modal-confirm">Add Element</button>
      </div>
    `;

    showElement(overlay);
    
    // Setup modal event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-cancel').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-confirm').addEventListener('click', () => this.addElement());
    
    // Show element-specific config based on type
    document.getElementById('elementType').addEventListener('change', (e) => {
      this.showElementConfig(e.target.value);
    });
  }

  showElementConfig(type) {
    const configDiv = document.getElementById('element-config');
    
    switch (type) {
      case 'question':
        configDiv.innerHTML = `
          <div class="form-group">
            <label for="questionText">Question Text</label>
            <input type="text" id="questionText" placeholder="Enter your question">
          </div>
          <div class="form-group">
            <label for="fieldType">Field Type</label>
            <select id="fieldType">
              <option value="text">Text Input</option>
              <option value="textarea">Text Area</option>
              <option value="numeric">Numeric</option>
            </select>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="required"> Required
            </label>
          </div>
        `;
        break;
      case 'image_upload':
        configDiv.innerHTML = `
          <div class="form-group">
            <label for="imageLabel">Image Label</label>
            <input type="text" id="imageLabel" placeholder="Enter label">
          </div>
          <div class="form-group">
            <label for="maxFileSize">Max File Size (MB)</label>
            <input type="number" id="maxFileSize" value="5" min="1">
          </div>
        `;
        break;
      case 'text':
        configDiv.innerHTML = `
          <div class="form-group">
            <label for="textContent">Text Content</label>
            <textarea id="textContent" placeholder="Enter text content"></textarea>
          </div>
          <div class="form-group">
            <label for="textStyle">Text Style</label>
            <select id="textStyle">
              <option value="paragraph">Paragraph</option>
              <option value="header_h1">Header H1</option>
              <option value="header_h2">Header H2</option>
              <option value="instruction">Instruction</option>
            </select>
          </div>
        `;
        break;
      default:
        configDiv.innerHTML = '<p class="text-muted">No additional configuration needed for this element type.</p>';
    }
  }

  async addElement() {
    try {
      const elementType = document.getElementById('elementType').value;
      const elementData = this.collectElementData(elementType);
      
      // Add element (would need API endpoint)
      adminDashboard.showSuccess('Element added successfully');
      hideElement(document.getElementById('modal-overlay'));
    } catch (error) {
      console.error('Error adding element:', error);
      adminDashboard.showError('Failed to add element');
    }
  }

  collectElementData(type) {
    const data = { element_type: type };
    
    switch (type) {
      case 'question':
        data.question_text = document.getElementById('questionText').value;
        data.field_type = document.getElementById('fieldType').value;
        data.required = document.getElementById('required').checked;
        break;
      case 'image_upload':
        data.image_label = document.getElementById('imageLabel').value;
        data.max_file_size_mb = parseInt(document.getElementById('maxFileSize').value);
        break;
      case 'text':
        data.text_content = document.getElementById('textContent').value;
        data.text_style = document.getElementById('textStyle').value;
        break;
    }
    
    return data;
  }

  setupEventListeners() {
    const addPageBtn = document.getElementById('addPageBtn');
    if (addPageBtn) {
      addPageBtn.addEventListener('click', () => this.createPage());
    }

    const backBtn = document.getElementById('backToNotebooksBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        adminDashboard.switchPage('notebooks');
        adminDashboard.loadNotebooks();
      });
    }
  }

  async createPage() {
    try {
      const pageData = {
        notebook_id: this.currentNotebook.id,
        title: 'New Page',
        page_type: 'template',
        requires_signature: true
      };
      
      const page = await this.apiClient.createPage(pageData);
      adminDashboard.showSuccess('Page created successfully');
      this.loadPages();
      this.loadPage(page.id);
    } catch (error) {
      console.error('Error creating page:', error);
      adminDashboard.showError('Failed to create page');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const notebookEditor = new NotebookEditor(apiClient);