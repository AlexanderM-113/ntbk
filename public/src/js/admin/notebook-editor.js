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
    container.onclick = (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        const pageId = button.dataset.id;
        if (button.dataset.action === 'edit') {
          this.loadPage(pageId);
        } else if (button.dataset.action === 'delete') {
          this.deletePage(pageId);
        }
      }
    };
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
      <div class="design-toolbar">
        <div>
          <label for="pageTitle">Page title</label>
          <input type="text" id="pageTitle" value="${this.escapeHtml(this.currentPage.title)}">
        </div>
        <div>
          <label for="pageType">Page type</label>
          <select id="pageType">
            <option value="template" ${pageType === 'template' ? 'selected' : ''}>Template</option>
            <option value="content" ${pageType === 'content' ? 'selected' : ''}>Content</option>
          </select>
        </div>
        <label class="signature-toggle"><input type="checkbox" id="requiresSignature" ${this.currentPage.requires_signature ? 'checked' : ''}> Signature</label>
        <span class="paper-size">US Letter 8.5 x 11 in</span>
        <button id="savePageBtn" class="btn btn-primary">Save Page</button>
        <button id="cancelPageBtn" class="btn btn-secondary">Cancel</button>
      </div>
      <div class="design-workspace">
        ${pageType === 'template' ? `
          <aside class="design-sidebar">
            <div class="design-sidebar-heading">Elements</div>
            <p class="design-hint">Drag an element onto the page.</p>
            <div class="element-palette">
              <button class="palette-item" draggable="true" data-element-type="question"><span>?</span>Question</button>
              <button class="palette-item" draggable="true" data-element-type="text"><span>T</span>Text</button>
              <button class="palette-item" draggable="true" data-element-type="image_upload"><span>IMG</span>Image</button>
              <button class="palette-item" draggable="true" data-element-type="divider"><span>---</span>Divider</button>
              <button class="palette-item" draggable="true" data-element-type="spacing"><span>↕</span>Spacing</button>
            </div>
            <div class="design-sidebar-heading">Page style</div>
            <label class="design-field">Background <input id="pageBackgroundColor" type="color" value="${this.currentPage.background_color || '#ffffff'}"></label>
            <label class="design-field">Font <select id="pageFontFamily"><option ${this.currentPage.font_family === 'Georgia' ? 'selected' : ''}>Georgia</option><option ${this.currentPage.font_family === 'Arial' ? 'selected' : ''}>Arial</option><option ${this.currentPage.font_family === 'Verdana' ? 'selected' : ''}>Verdana</option><option ${this.currentPage.font_family === 'Trebuchet MS' ? 'selected' : ''}>Trebuchet MS</option></select></label>
            <div class="design-sidebar-heading">Selected element</div>
            <div id="element-style-controls"><p class="design-hint">Select an element to style it.</p></div>
          </aside>
          <div class="canvas-stage"><div id="page-canvas" class="page-canvas"></div></div>
        ` : `
          <div class="content-page-editor">
            <label for="pageContent">Content</label>
            <textarea id="pageContent" rows="18">${this.escapeHtml(this.currentPage.content || '')}</textarea>
          </div>
        `}
      </div>
    `;

    document.getElementById('savePageBtn').addEventListener('click', () => this.savePage());
    document.getElementById('cancelPageBtn').addEventListener('click', () => this.clearPageEditor());

    if (pageType === 'template') {
      this.setupDesignSurface();
    } else {
      this.renderPreview();
    }
  }

  setupDesignSurface() {
    const canvas = document.getElementById('page-canvas');
    if (!canvas) return;
    canvas.addEventListener('dragover', (event) => event.preventDefault());
    canvas.addEventListener('drop', (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('element-type');
      const elementId = event.dataTransfer.getData('element-id');
      if (type) this.addElementFromPalette(type);
      if (elementId) {
        const target = event.target.closest('.canvas-element');
        const before = target && event.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2;
        this.moveElement(elementId, target?.dataset.elementId, before);
      }
    });
    document.querySelectorAll('.palette-item').forEach((item) => {
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('element-type', item.dataset.elementType);
      });
      item.addEventListener('click', () => this.addElementFromPalette(item.dataset.elementType));
    });
    document.getElementById('pageBackgroundColor').addEventListener('input', (event) => {
      canvas.style.backgroundColor = event.target.value;
      this.renderPreview();
    });
    document.getElementById('pageFontFamily').addEventListener('change', (event) => {
      canvas.style.fontFamily = event.target.value;
      this.renderPreview();
    });
    this.renderCanvas();
  }

  renderCanvas() {
    const canvas = document.getElementById('page-canvas');
    if (!canvas) return;
    canvas.style.backgroundColor = this.currentPage.background_color || '#ffffff';
    canvas.style.fontFamily = this.currentPage.font_family || 'Georgia';
    const logoId = this.currentNotebook?.cover_logo_id;
    const logoUrl = logoId ? `${this.apiClient.baseURL}/api/files/${encodeURIComponent(logoId)}` : '';
    canvas.innerHTML = `
      <header class="page-frame-header">
        <div class="page-frame-title">${this.escapeHtml(this.currentPage.title)}</div>
        ${logoUrl ? `<img src="${this.escapeHtml(logoUrl)}" alt="Page logo">` : ''}
      </header>
      <div class="page-frame-rule"></div>
      <div id="page-content-canvas" class="page-content-canvas"></div>
      <footer class="page-frame-footer">
        ${this.currentPage.requires_signature ? '<div class="signature-line"><span>Signature</span></div>' : '<div></div>'}
        <div class="page-meta">Page ${this.currentPage.page_number || 1} | ${new Date().toLocaleDateString()}</div>
      </footer>
    `;
    const contentCanvas = document.getElementById('page-content-canvas');
    if (!this.currentPage.elements?.length) {
      contentCanvas.innerHTML = '<div class="canvas-empty">Drop elements here to design this page</div>';
      this.renderPreview();
      return;
    }
    this.currentPage.elements.forEach((element) => {
      const block = document.createElement('div');
      block.className = 'canvas-element';
      block.draggable = true;
      block.dataset.elementId = element.id;
      block.style.cssText = this.elementStyle(element);
      block.innerHTML = this.elementMarkup(element);
      block.addEventListener('click', () => this.selectElement(element));
      block.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('element-id', element.id);
      });
      contentCanvas.appendChild(block);
    });
    this.renderPreview();
  }

  elementMarkup(element) {
    if (element.element_type === 'question') {
      return `<span class="canvas-element-type">Question</span><strong>${this.escapeHtml(element.question_text || 'Untitled question')}</strong><input disabled placeholder="${this.escapeHtml(element.field_type || 'text')}">`;
    }
    if (element.element_type === 'text') {
      return `<span class="canvas-element-type">Text</span><div>${this.escapeHtml(element.text_content || 'Double-click to add text')}</div>`;
    }
    if (element.element_type === 'image_upload') {
      return `<span class="canvas-element-type">Image</span><div class="image-placeholder">${this.escapeHtml(element.image_label || 'Image upload')}</div>`;
    }
    if (element.element_type === 'divider') return '<hr><span class="canvas-element-type">Divider</span>';
    return '<div class="spacing-placeholder">Spacing</div>';
  }

  elementStyle(element) {
    if (element.element_type === 'text') {
      return `color:${element.text_color || '#222'};background:${element.text_background_color || 'transparent'};font-size:${element.text_font_size || 16}px;text-align:${element.text_alignment || 'left'};font-weight:${element.text_font_weight || 'normal'};`;
    }
    if (element.element_type === 'question') {
      return `color:${element.field_text_color || '#222'};background:${element.field_background_color || '#fff'};font-size:${element.field_font_size || 16}px;`;
    }
    return '';
  }

  renderPreview() {
    const preview = document.getElementById('page-preview');
    if (!preview || !this.currentPage) return;
    const logoId = this.currentNotebook?.cover_logo_id;
    const logoUrl = logoId ? `${this.apiClient.baseURL}/api/files/${encodeURIComponent(logoId)}` : '';
    const content = this.currentPage.page_type === 'content'
      ? this.escapeHtml(document.getElementById('pageContent')?.value || '')
      : (this.currentPage.elements || []).map((element) => `<div class="preview-element" style="${this.elementStyle(element)}">${this.elementMarkup(element)}</div>`).join('');
    preview.innerHTML = `<div class="preview-page" style="background:${this.currentPage.background_color || '#fff'};font-family:${this.currentPage.font_family || 'Georgia'}"><header class="page-frame-header"><div class="page-frame-title">${this.escapeHtml(this.currentPage.title)}</div>${logoUrl ? `<img src="${this.escapeHtml(logoUrl)}" alt="Page logo">` : ''}</header><div class="page-frame-rule"></div><div class="preview-content">${content}</div><footer class="page-frame-footer">${this.currentPage.requires_signature ? '<div class="signature-line"><span>Signature</span></div>' : '<div></div>'}<div class="page-meta">Page ${this.currentPage.page_number || 1} | ${new Date().toLocaleDateString()}</div></footer></div>`;
    const content = document.getElementById('pageContent');
    if (content) content.addEventListener('input', () => this.renderPreview());
  }

  async addElementFromPalette(type) {
    const defaults = {
      question_text: type === 'question' ? 'New question' : undefined,
      field_type: type === 'question' ? 'text' : undefined,
      text_content: type === 'text' ? 'New text block' : undefined,
      text_style: type === 'text' ? 'paragraph' : undefined,
      image_label: type === 'image_upload' ? 'Upload an image' : undefined
    };
    try {
      const elementData = {
        page_id: this.currentPage.id,
        element_type: type,
        order_position: (this.currentPage.elements || []).length + 1,
        ...defaults
      };
      const createdElement = await this.apiClient.addPageElement(elementData);
      const element = { ...elementData, ...createdElement };
      this.currentPage.elements = [...(this.currentPage.elements || []), element];
      this.renderCanvas();
      this.selectElement(element);
    } catch (error) {
      console.error('Error adding palette element:', error);
      adminDashboard.showError('Failed to add element');
    }
  }

  async moveElementToEnd(elementId) {
    return this.moveElement(elementId);
  }

  async moveElement(elementId, targetId, before = false) {
    const elements = this.currentPage.elements || [];
    const moved = elements.find((element) => element.id === elementId);
    if (!moved) return;
    const remaining = elements.filter((element) => element.id !== elementId);
    const targetIndex = targetId ? remaining.findIndex((element) => element.id === targetId) : -1;
    const insertIndex = targetIndex < 0 ? remaining.length : targetIndex + (before ? 0 : 1);
    remaining.splice(insertIndex, 0, moved);
    this.currentPage.elements = remaining;
    for (const [index, element] of this.currentPage.elements.entries()) {
      await this.apiClient.updatePageElement(element.id, { order_position: index + 1 });
    }
    this.renderCanvas();
  }

  selectElement(element) {
    const controls = document.getElementById('element-style-controls');
    if (!controls) return;
    const isText = element.element_type === 'text';
    const isQuestion = element.element_type === 'question';
    const isImage = element.element_type === 'image_upload';
    controls.innerHTML = `
      ${isQuestion ? `<label class="design-field">Question <input id="elementQuestionText" value="${this.escapeHtml(element.question_text || '')}"></label><label class="design-field">Field <select id="elementFieldType"><option ${element.field_type === 'text' ? 'selected' : ''}>text</option><option ${element.field_type === 'textarea' ? 'selected' : ''}>textarea</option><option ${element.field_type === 'numeric' ? 'selected' : ''}>numeric</option></select></label><label class="design-field">Placeholder <input id="elementPlaceholder" value="${this.escapeHtml(element.placeholder_text || '')}"></label><label class="design-field">Help text <input id="elementHelpText" value="${this.escapeHtml(element.help_text || '')}"></label><label class="design-field"><input id="elementRequired" type="checkbox" ${element.required ? 'checked' : ''}> Required</label>` : ''}
      ${isText ? `<label class="design-field">Text <textarea id="elementTextContent" rows="3">${this.escapeHtml(element.text_content || '')}</textarea></label><label class="design-field">Style <select id="elementTextStyle"><option ${element.text_style === 'paragraph' ? 'selected' : ''}>paragraph</option><option ${element.text_style === 'header_h1' ? 'selected' : ''}>header_h1</option><option ${element.text_style === 'header_h2' ? 'selected' : ''}>header_h2</option><option ${element.text_style === 'instruction' ? 'selected' : ''}>instruction</option></select></label><label class="design-field">Weight <select id="elementTextWeight"><option ${element.text_font_weight === 'normal' ? 'selected' : ''}>normal</option><option ${element.text_font_weight === 'bold' ? 'selected' : ''}>bold</option></select></label>` : ''}
      ${isImage ? `<label class="design-field">Image label <input id="elementImageLabel" value="${this.escapeHtml(element.image_label || '')}"></label><label class="design-field">Max file size (MB) <input id="elementMaxFileSize" type="number" min="1" value="${element.max_file_size_mb || 5}"></label>` : ''}
      <label class="design-field">Text color <input id="elementTextColor" type="color" value="${isText ? element.text_color || '#222222' : element.field_text_color || '#222222'}"></label>
      <label class="design-field">Fill <input id="elementFillColor" type="color" value="${isText ? element.text_background_color || '#ffffff' : element.field_background_color || '#ffffff'}"></label>
      <label class="design-field">Size <input id="elementFontSize" type="number" min="10" max="72" value="${isText ? element.text_font_size || 16 : element.field_font_size || 16}"></label>
      <label class="design-field">Align <select id="elementAlignment"><option ${element.text_alignment === 'left' ? 'selected' : ''}>left</option><option ${element.text_alignment === 'center' ? 'selected' : ''}>center</option><option ${element.text_alignment === 'right' ? 'selected' : ''}>right</option></select></label>
      <button class="btn btn-small btn-primary" id="applyElementStyle">Save element</button>
      <button class="btn btn-small btn-danger" id="deleteSelectedElement">Delete element</button>
    `;
    controls.querySelector('#applyElementStyle').addEventListener('click', async () => {
      const textColor = controls.querySelector('#elementTextColor').value;
      const fillColor = controls.querySelector('#elementFillColor').value;
      const fontSize = Number(controls.querySelector('#elementFontSize').value);
      const alignment = controls.querySelector('#elementAlignment').value;
      const data = isText ? { text_content: controls.querySelector('#elementTextContent').value, text_style: controls.querySelector('#elementTextStyle').value, text_font_weight: controls.querySelector('#elementTextWeight').value, text_color: textColor, text_background_color: fillColor, text_font_size: fontSize, text_alignment: alignment } : isQuestion ? { question_text: controls.querySelector('#elementQuestionText').value, field_type: controls.querySelector('#elementFieldType').value, placeholder_text: controls.querySelector('#elementPlaceholder').value, help_text: controls.querySelector('#elementHelpText').value, required: controls.querySelector('#elementRequired').checked, field_text_color: textColor, field_background_color: fillColor, field_font_size: fontSize } : isImage ? { image_label: controls.querySelector('#elementImageLabel').value, max_file_size_mb: Number(controls.querySelector('#elementMaxFileSize').value), image_border_color: textColor, image_background_color: fillColor } : {};
      await this.apiClient.updatePageElement(element.id, data);
      Object.assign(element, data);
      this.renderCanvas();
      this.selectElement(element);
      adminDashboard.showSuccess('Element style saved');
    });
    controls.querySelector('#deleteSelectedElement').addEventListener('click', () => this.deletePageElement(element.id));
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
    container.onclick = (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        const elementId = button.dataset.id;
        if (button.dataset.action === 'edit-element') {
          const element = this.currentPage.elements.find(item => item.id === elementId);
          if (element) this.showEditElementModal(element);
        }
        if (button.dataset.action === 'delete-element') {
          this.deletePageElement(elementId);
        }
      }
    };
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
        requires_signature: requiresSignature,
        background_color: document.getElementById('pageBackgroundColor')?.value,
        font_family: document.getElementById('pageFontFamily')?.value
      };

      if (pageType === 'content') {
        updateData.content = document.getElementById('pageContent').value;
      }

      await this.apiClient.updatePage(this.currentPage.id, updateData);
      Object.assign(this.currentPage, updateData);
      const pageIndex = this.pages.findIndex((page) => page.id === this.currentPage.id);
      if (pageIndex !== -1) Object.assign(this.pages[pageIndex], updateData);
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
    modal.querySelector('.modal-confirm').onclick = () => this.addElement();
    
    // Show element-specific config based on type
    document.getElementById('elementType').addEventListener('change', (e) => {
      this.showElementConfig(e.target.value);
    });
    this.showElementConfig(document.getElementById('elementType').value);
  }

  showEditElementModal(element) {
    this.showAddElementModal();
    const typeSelect = document.getElementById('elementType');
    typeSelect.value = element.element_type;
    this.showElementConfig(element.element_type);

    if (element.element_type === 'question') {
      document.getElementById('questionText').value = element.question_text || '';
      document.getElementById('fieldType').value = element.field_type || 'text';
      document.getElementById('required').checked = !!element.required;
    } else if (element.element_type === 'image_upload') {
      document.getElementById('imageLabel').value = element.image_label || '';
      document.getElementById('maxFileSize').value = element.max_file_size_mb || 5;
    } else if (element.element_type === 'text') {
      document.getElementById('textContent').value = element.text_content || '';
      document.getElementById('textStyle').value = element.text_style || 'paragraph';
    }

    const confirmButton = document.querySelector('#modal-content .modal-confirm');
    confirmButton.textContent = 'Update Element';
    confirmButton.onclick = () => this.updateElement(element);
  }

  async updateElement(element) {
    try {
      const data = this.collectElementData(element.element_type);
      delete data.element_type;
      await this.apiClient.updatePageElement(element.id, data);
      hideElement(document.getElementById('modal-overlay'));
      adminDashboard.showSuccess('Element updated successfully');
      await this.loadPage(this.currentPage.id);
    } catch (error) {
      console.error('Error updating element:', error);
      adminDashboard.showError('Failed to update element');
    }
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
      elementData.page_id = this.currentPage.id;
      elementData.order_position = (this.currentPage.elements || []).length + 1;
      await this.apiClient.addPageElement(elementData);
      adminDashboard.showSuccess('Element added successfully');
      hideElement(document.getElementById('modal-overlay'));
      await this.loadPage(this.currentPage.id);
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
      await this.loadPages();
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