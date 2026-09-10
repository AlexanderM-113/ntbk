// Page entry form functionality
class PageEntry {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.currentPage = null;
    this.currentEntry = {};
    this.signatureData = null;
  }

  async loadPage(page) {
    try {
      this.currentPage = page;
      this.renderPage(page);
      this.navigateTo('entry-page');
      
      // Initialize signature pad
      if (signaturePad) {
        signaturePad.init();
      }
    } catch (error) {
      console.error('Error loading page:', error);
      this.showError('Failed to load page');
    }
  }

  renderPage(page) {
    // Set page title
    document.getElementById('pageTitle').textContent = `Page ${page.page_number}: ${page.title}`;
    document.getElementById('pageInfo').textContent = 
      page.page_type === 'template' ? 'Fill out the form below' : 'Review the content below';

    const fieldsContainer = document.getElementById('form-fields');
    fieldsContainer.innerHTML = '';

    if (page.page_type === 'template') {
      // Render form fields
      if (page.elements && page.elements.length > 0) {
        page.elements.forEach((element) => {
          const field = this.createFormField(element);
          fieldsContainer.appendChild(field);
        });
      } else {
        fieldsContainer.innerHTML = '<p class="text-muted">No form elements on this page.</p>';
      }
    } else if (page.page_type === 'content') {
      // Render fixed content
      const content = document.createElement('div');
      content.className = 'page-content';
      content.innerHTML = page.content || '<p class="text-muted">No content available.</p>';
      fieldsContainer.appendChild(content);
    }

    // Setup form submission
    this.setupFormSubmission();
  }

  createFormField(element) {
    const container = document.createElement('div');
    container.className = 'form-group';

    if (element.element_type === 'question') {
      const label = document.createElement('label');
      label.innerHTML = element.question_text;
      if (element.required) {
        label.innerHTML += ' <span class="required">*</span>';
      }

      let input;
      if (element.field_type === 'text') {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = element.placeholder_text || '';
        input.maxLength = element.max_characters || null;
        input.dataset.elementId = element.id;
        input.dataset.type = 'text';
        input.required = element.required;
      } else if (element.field_type === 'textarea') {
        input = document.createElement('textarea');
        input.placeholder = element.placeholder_text || '';
        input.style.height = (element.field_height || 120) + 'px';
        input.dataset.elementId = element.id;
        input.dataset.type = 'text';
        input.required = element.required;
        
        if (element.max_characters) {
          const counter = document.createElement('div');
          counter.className = 'char-counter';
          counter.textContent = `0/${element.max_characters}`;
          input.addEventListener('input', (e) => {
            counter.textContent = `${e.target.value.length}/${element.max_characters}`;
          });
          container.appendChild(counter);
        }
      } else if (element.field_type === 'numeric') {
        input = document.createElement('input');
        input.type = 'number';
        input.min = element.min_value || 0;
        input.max = element.max_value || 100;
        input.dataset.elementId = element.id;
        input.dataset.type = 'numeric';
        input.required = element.required;
      }

      container.appendChild(label);
      container.appendChild(input);

      if (element.help_text) {
        const helpText = document.createElement('div');
        helpText.className = 'help-text';
        helpText.textContent = element.help_text;
        container.appendChild(helpText);
      }
    } else if (element.element_type === 'image_upload') {
      const label = document.createElement('label');
      label.textContent = element.image_label || 'Upload Image';
      if (element.image_required) {
        label.innerHTML += ' <span class="required">*</span>';
      }

      const uploadBox = document.createElement('div');
      uploadBox.className = 'image-upload-box';
      uploadBox.innerHTML = `
        <input type="file" accept="image/*" data-element-id="${element.id}" data-type="image">
        <p>Click to upload or drag and drop</p>
        <p class="help-text">Max file size: ${element.max_file_size_mb || 5}MB</p>
      `;

      uploadBox.addEventListener('click', () => {
        uploadBox.querySelector('input').click();
      });

      uploadBox.querySelector('input').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleImageUpload(e.target.files[0], element.id, uploadBox);
        }
      });

      uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('dragover');
      });

      uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('dragover');
      });

      uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          this.handleImageUpload(files[0], element.id, uploadBox);
        }
      });

      container.appendChild(label);
      container.appendChild(uploadBox);
    } else if (element.element_type === 'text') {
      const text = document.createElement('div');
      text.className = `text-${element.text_style || 'paragraph'}`;
      text.innerHTML = element.text_content || '';
      container.appendChild(text);
    } else if (element.element_type === 'divider') {
      const divider = document.createElement('hr');
      divider.style.cssText = 'border: none; border-top: 1px solid #ddd; margin: 20px 0;';
      container.appendChild(divider);
    } else if (element.element_type === 'spacing') {
      const spacing = document.createElement('div');
      spacing.style.height = '20px';
      container.appendChild(spacing);
    }

    return container;
  }

  async handleImageUpload(file, elementId, uploadBox) {
    // Validate file size
    const maxSize = 5 * 1024 * 1024; // 5MB default
    if (file.size > maxSize) {
      this.showError('File size exceeds maximum limit');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.showError('Please upload an image file');
      return;
    }

    try {
      const result = await this.apiClient.uploadFile(file, 'entry_images');
      
      this.currentEntry[elementId] = {
        type: 'image',
        value: result.file_id,
        url: result.url,
      };

      // Show preview
      const preview = document.createElement('img');
      preview.src = result.url;
      preview.className = 'image-preview';
      preview.style.maxWidth = '100%';
      preview.style.maxHeight = '200px';
      
      // Remove existing preview if any
      const existingPreview = uploadBox.querySelector('.image-preview');
      if (existingPreview) {
        existingPreview.remove();
      }
      
      uploadBox.appendChild(preview);
      
      this.showSuccess('Image uploaded successfully');
    } catch (error) {
      console.error('Image upload error:', error);
      this.showError('Failed to upload image');
    }
  }

  setupFormSubmission() {
    const form = document.getElementById('entry-form');
    const submitBtn = document.getElementById('submitBtn');
    const backBtn = document.getElementById('backBtn');

    // Remove existing listeners
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    // Add new listeners
    newForm.addEventListener('submit', (e) => this.submitPage(e));
    
    if (backBtn) {
      backBtn.addEventListener('click', () => this.navigateTo('dashboard-page'));
    }
  }

  async submitPage(event) {
    event.preventDefault();

    const user = getUserSession();
    if (!user) {
      this.showError('User session expired. Please log in again.');
      userLogin.showLogin();
      return;
    }

    // Validate form
    const formFields = document.querySelectorAll('#form-fields input[required], #form-fields textarea[required]');
    let isValid = true;

    formFields.forEach((field) => {
      if (!field.value && field.required) {
        field.classList.add('error');
        isValid = false;
      } else {
        field.classList.remove('error');
      }
    });

    if (!isValid) {
      this.showError('Please fill in all required fields');
      return;
    }

    // Check signature if required
    if (this.currentPage.requires_signature && !this.signatureData) {
      this.showError('Please sign the page before submitting');
      return;
    }

    // Collect responses
    const responses = [];
    formFields.forEach((field) => {
      if (field.dataset.elementId) {
        const response = {
          element_id: field.dataset.elementId,
          value: field.value,
          type: field.dataset.type || 'text',
        };
        
        if (field.dataset.type === 'numeric') {
          response.numeric = parseFloat(field.value);
        }
        
        responses.push(response);
      }
    });

    // Add image responses
    Object.keys(this.currentEntry).forEach(elementId => {
      if (this.currentEntry[elementId].type === 'image') {
        responses.push({
          element_id: elementId,
          value: this.currentEntry[elementId].value,
          type: 'image'
        });
      }
    });

    try {
      const entry = await this.apiClient.submitEntry({
        user_id: user.user_id,
        notebook_id: user.notebook_id,
        page_id: this.currentPage.id,
        responses,
        signature_data: this.signatureData
      });

      // Mark page as completed
      userDashboard.markPageCompleted(this.currentPage.id);
      
      this.showSuccessMessage();
      this.navigateTo('success-page');
      
      // Clear form data
      this.currentEntry = {};
      this.signatureData = null;
      
    } catch (error) {
      console.error('Submission error:', error);
      this.showError('Failed to submit page. Please try again.');
    }
  }

  setSignatureData(dataUrl) {
    this.signatureData = dataUrl;
    document.getElementById('signatureStatus').textContent = 'Signature confirmed';
    document.getElementById('signatureStatus').classList.add('signed');
    document.getElementById('submitBtn').disabled = false;
  }

  clearSignatureData() {
    this.signatureData = null;
    document.getElementById('signatureStatus').textContent = '';
    document.getElementById('signatureStatus').classList.remove('signed');
    document.getElementById('submitBtn').disabled = true;
  }

  showSuccessMessage() {
    const message = `You have successfully completed "${this.currentPage.title}".`;
    document.getElementById('successMessage').textContent = message;
  }

  navigateTo(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    
    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
    }
  }

  showError(message) {
    const errorDiv = document.getElementById('formError');
    errorDiv.textContent = message;
    setTimeout(() => {
      errorDiv.textContent = '';
    }, 5000);
  }

  showSuccess(message) {
    // Could implement success notification
    // For now, we'll use form error div for success messages too
    const errorDiv = document.getElementById('formError');
    errorDiv.textContent = message;
    errorDiv.className = 'success-message';
    setTimeout(() => {
      errorDiv.textContent = '';
      errorDiv.className = 'error-message';
    }, 3000);
  }
}

const pageEntry = new PageEntry(apiClient);