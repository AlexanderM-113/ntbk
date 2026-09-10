// Entries management functionality
class EntriesManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.entries = [];
    this.currentNotebookId = null;
  }

  async loadNotebookEntries(notebookId) {
    this.currentNotebookId = notebookId;
    
    try {
      const entries = await this.apiClient.getNotebookEntries(notebookId);
      this.entries = entries;
      this.renderEntriesList();
    } catch (error) {
      console.error('Error loading entries:', error);
      adminDashboard.showError('Failed to load entries');
    }
  }

  renderEntriesList() {
    const container = document.getElementById('entries-list');
    if (!container) return;
    
    container.innerHTML = '';

    if (this.entries.length === 0) {
      container.innerHTML = '<p class="text-muted">No entries yet for this notebook.</p>';
      return;
    }

    this.entries.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'entry-item';
      item.innerHTML = `
        <div class="entry-info">
          <div class="entry-user">${this.escapeHtml(entry.first_name)} ${this.escapeHtml(entry.full_name || '')}</div>
          <div class="entry-date">Submitted: ${this.formatDate(entry.submission_date)}</div>
          <div class="entry-responses">${entry.response_count || 0} responses</div>
        </div>
        <div class="entry-status">
          <span class="badge badge-${entry.is_locked ? 'locked' : 'unlocked'}">
            ${entry.is_locked ? 'Locked' : 'Unlocked'}
          </span>
          <div class="entry-actions mt-1">
            <button class="btn btn-small btn-primary" data-action="view" data-id="${entry.id}">View</button>
            ${entry.is_locked ? `
              <button class="btn btn-small btn-secondary" data-action="unlock" data-id="${entry.id}">Unlock</button>
            ` : ''}
            <button class="btn btn-small btn-danger" data-action="delete" data-id="${entry.id}">Delete</button>
            <button class="btn btn-small btn-success" data-action="pdf" data-id="${entry.id}">Export PDF</button>
          </div>
        </div>
      `;

      container.appendChild(item);
    });

    // Add event listeners
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        const entryId = button.dataset.id;
        switch (button.dataset.action) {
          case 'view':
            this.viewEntry(entryId);
            break;
          case 'unlock':
            this.unlockEntry(entryId);
            break;
          case 'delete':
            this.deleteEntry(entryId);
            break;
          case 'pdf':
            this.exportPdf(entryId);
            break;
        }
      }
    });
  }

  async viewEntry(entryId) {
    try {
      const entry = await this.apiClient.getEntryDetails(entryId);
      this.showEntryModal(entry);
    } catch (error) {
      console.error('Error viewing entry:', error);
      adminDashboard.showError('Failed to load entry details');
    }
  }

  showEntryModal(entry) {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">Entry Details</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="entry-details">
          <p><strong>User:</strong> ${this.escapeHtml(entry.first_name)} ${this.escapeHtml(entry.full_name || '')}</p>
          <p><strong>Submitted:</strong> ${this.formatDate(entry.submission_date)}</p>
          <p><strong>Status:</strong> ${entry.is_locked ? 'Locked' : 'Unlocked'}</p>
          
          <h4>Responses:</h4>
          ${entry.responses && entry.responses.length > 0 ? `
            <div class="responses-list">
              ${entry.responses.map(response => `
                <div class="response-item">
                  <p><strong>Type:</strong> ${response.response_type}</p>
                  <p><strong>Value:</strong> ${this.escapeHtml(response.response_value || 'N/A')}</p>
                </div>
              `).join('')}
            </div>
          ` : '<p class="text-muted">No responses recorded.</p>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Close</button>
      </div>
    `;

    showElement(overlay);
    
    // Setup modal event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => hideElement(overlay));
  }

  async unlockEntry(entryId) {
    if (confirm('Are you sure you want to unlock this entry? The user will be able to edit it again.')) {
      try {
        const adminSession = getAdminSession();
        await this.apiClient.unlockEntry(entryId, adminSession.admin_id);
        adminDashboard.showSuccess('Entry unlocked successfully');
        this.loadNotebookEntries(this.currentNotebookId);
      } catch (error) {
        console.error('Error unlocking entry:', error);
        adminDashboard.showError('Failed to unlock entry');
      }
    }
  }

  async deleteEntry(entryId) {
    if (confirm('Are you sure you want to delete this entry? This cannot be undone.')) {
      try {
        await this.apiClient.deleteEntry(entryId);
        adminDashboard.showSuccess('Entry deleted successfully');
        this.loadNotebookEntries(this.currentNotebookId);
      } catch (error) {
        console.error('Error deleting entry:', error);
        adminDashboard.showError('Failed to delete entry');
      }
    }
  }

  async exportPdf(entryId) {
    try {
      const adminSession = getAdminSession();
      const result = await this.apiClient.generatePdf(
        entryId, 
        this.currentNotebookId, 
        adminSession.admin_id
      );
      
      // Download the PDF
      window.open(result.url, '_blank');
      adminDashboard.showSuccess('PDF generated successfully');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      adminDashboard.showError('Failed to export PDF');
    }
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const entriesManager = new EntriesManager(apiClient);