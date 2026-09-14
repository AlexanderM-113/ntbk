// Audit log functionality
class AuditLog {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.auditLogs = [];
  }

  async init() {
    await this.loadAuditLogs();
    this.setupEventListeners();
  }

  async loadAuditLogs() {
    try {
      this.auditLogs = await this.apiClient.getAuditLog();
      this.renderAuditLogs();
    } catch (error) {
      console.error('Error loading audit logs:', error);
      adminDashboard.showError('Failed to load audit logs');
    }
  }

  renderAuditLogs() {
    const container = document.getElementById('audit-log-list');
    if (!container) return;
    
    container.innerHTML = '';

    if (this.auditLogs.length === 0) {
      container.innerHTML = '<p class="text-muted">No audit log entries yet.</p>';
      return;
    }

    this.auditLogs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'audit-item';
      item.innerHTML = `
        <div class="audit-action">${this.escapeHtml(log.action_type)}</div>
        <div class="audit-details">
          <p><strong>Resource:</strong> ${this.escapeHtml(log.resource_type)} - ${this.escapeHtml(log.resource_name || 'N/A')}</p>
          <p><strong>Performed by:</strong> ${this.escapeHtml(log.performed_by || 'System')}</p>
          ${log.details ? `<p><strong>Details:</strong> ${this.escapeHtml(JSON.stringify(log.details))}</p>` : ''}
        </div>
        <div class="audit-timestamp">${this.formatDate(log.timestamp)}</div>
      `;

      container.appendChild(item);
    });
  }

  setupEventListeners() {
    // Add filters for audit log if needed
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
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

const auditLog = new AuditLog(apiClient);