// Schedule management functionality
class ScheduleManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.scheduleAssignments = [];
  }

  async init() {
    await this.loadScheduleAssignments();
    this.setupEventListeners();
  }

  async loadScheduleAssignments() {
    try {
      const assignments = await this.apiClient.getScheduleAssignments();
      this.scheduleAssignments = assignments;
      this.renderScheduleList();
    } catch (error) {
      console.error('Error loading schedule assignments:', error);
      adminDashboard.showError('Failed to load schedule assignments');
    }
  }

  renderScheduleList() {
    const container = document.getElementById('schedule-list');
    if (!container) return;
    
    container.innerHTML = '';

    if (this.scheduleAssignments.length === 0) {
      container.innerHTML = '<p class="text-muted">No schedule assignments yet. Click "Create Schedule Assignment" to create one.</p>';
      return;
    }

    this.scheduleAssignments.forEach(assignment => {
      const item = document.createElement('div');
      item.className = 'schedule-item';
      item.innerHTML = `
        <div class="schedule-info">
          <div class="schedule-date">${this.formatDate(assignment.scheduled_date)}</div>
          <div class="schedule-user">${this.escapeHtml(assignment.first_name)} ${this.escapeHtml(assignment.full_name || '')}</div>
          <div class="schedule-page">Page ${assignment.page_number}: ${this.escapeHtml(assignment.page_title)}</div>
        </div>
        <div class="schedule-status">
          <span class="badge badge-${assignment.status}">${assignment.status}</span>
          <div class="schedule-actions mt-1">
            <button class="btn btn-small btn-secondary" data-action="edit" data-id="${assignment.id}">Edit</button>
            <button class="btn btn-small btn-danger" data-action="delete" data-id="${assignment.id}">Delete</button>
          </div>
        </div>
      `;

      container.appendChild(item);
    });

    // Add event listeners
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        const scheduleId = button.dataset.id;
        if (button.dataset.action === 'edit') {
          this.editScheduleAssignment(scheduleId);
        } else if (button.dataset.action === 'delete') {
          this.deleteScheduleAssignment(scheduleId);
        }
      }
    });
  }

  setupEventListeners() {
    const createBtn = document.getElementById('createScheduleBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateScheduleModal());
    }

    const processRemindersBtn = document.getElementById('processRemindersBtn');
    if (processRemindersBtn) {
      processRemindersBtn.addEventListener('click', () => this.processReminders());
    }
  }

  showCreateScheduleModal() {
    this.showScheduleModal();
  }

  editScheduleAssignment(scheduleId) {
    const assignment = this.scheduleAssignments.find(s => s.id === scheduleId);
    if (assignment) {
      this.showScheduleModal(assignment);
    }
  }

  async showScheduleModal(assignment = null) {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    
    // Get users and pages for dropdowns
    let users = [];
    let pages = [];
    
    try {
      users = await this.apiClient.getUsers();
      // Pages would need to be fetched - for now using placeholder
      pages = []; 
    } catch (error) {
      console.error('Error loading data:', error);
    }

    const isEdit = !!assignment;
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Edit' : 'Create'} Schedule Assignment</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="scheduleUser">User</label>
          <select id="scheduleUser" required>
            <option value="">Select a user</option>
            ${users.map(user => `
              <option value="${user.id}" ${assignment?.user_id === user.id ? 'selected' : ''}>
                ${this.escapeHtml(user.first_name)} ${this.escapeHtml(user.full_name || '')}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label for="schedulePage">Page</label>
          <select id="schedulePage" required>
            <option value="">Select a page</option>
            ${pages.map(page => `
              <option value="${page.id}" ${assignment?.page_id === page.id ? 'selected' : ''}>
                Page ${page.page_number}: ${this.escapeHtml(page.title)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label for="scheduleDate">Scheduled Date</label>
          <input type="date" id="scheduleDate" value="${assignment?.scheduled_date || ''}" required>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel">Cancel</button>
        <button class="btn btn-primary modal-confirm">${isEdit ? 'Update' : 'Create'} Assignment</button>
      </div>
    `;

    showElement(overlay);
    
    // Setup modal event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-cancel').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-confirm').addEventListener('click', () => {
      if (isEdit) {
        this.updateScheduleAssignment(assignment.id);
      } else {
        this.createScheduleAssignment();
      }
    });
  }

  async createScheduleAssignment() {
    try {
      const userId = document.getElementById('scheduleUser').value;
      const pageId = document.getElementById('schedulePage').value;
      const scheduledDate = document.getElementById('scheduleDate').value;

      if (!userId || !pageId || !scheduledDate) {
        adminDashboard.showError('Please fill in all fields');
        return;
      }

      const data = {
        user_id: userId,
        page_id: pageId,
        scheduled_date: scheduledDate
      };

      await this.apiClient.createScheduleAssignment(data);
      adminDashboard.showSuccess('Schedule assignment created successfully');
      hideElement(document.getElementById('modal-overlay'));
      this.loadScheduleAssignments();
      
      // Send initial notification email
      await this.sendAssignmentNotification(userId, pageId, scheduledDate);
      
    } catch (error) {
      console.error('Error creating schedule assignment:', error);
      adminDashboard.showError('Failed to create schedule assignment');
    }
  }

  async updateScheduleAssignment(scheduleId) {
    try {
      const scheduledDate = document.getElementById('scheduleDate').value;

      if (!scheduledDate) {
        adminDashboard.showError('Please select a date');
        return;
      }

      const data = { scheduled_date: scheduledDate };

      await this.apiClient.updateScheduleAssignment(scheduleId, data);
      adminDashboard.showSuccess('Schedule assignment updated successfully');
      hideElement(document.getElementById('modal-overlay'));
      this.loadScheduleAssignments();
      
    } catch (error) {
      console.error('Error updating schedule assignment:', error);
      adminDashboard.showError('Failed to update schedule assignment');
    }
  }

  async deleteScheduleAssignment(scheduleId) {
    if (confirm('Are you sure you want to delete this schedule assignment?')) {
      try {
        await this.apiClient.deleteScheduleAssignment(scheduleId);
        adminDashboard.showSuccess('Schedule assignment deleted successfully');
        this.loadScheduleAssignments();
      } catch (error) {
        console.error('Error deleting schedule assignment:', error);
        adminDashboard.showError('Failed to delete schedule assignment');
      }
    }
  }

  async processReminders() {
    try {
      const result = await this.apiClient.processReminders();
      adminDashboard.showSuccess(`Processed ${result.processed} reminders`);
      this.loadScheduleAssignments();
    } catch (error) {
      console.error('Error processing reminders:', error);
      adminDashboard.showError('Failed to process reminders');
    }
  }

  async sendAssignmentNotification(userId, pageId, scheduledDate) {
    try {
      // Get user details
      const users = await this.apiClient.getUsers();
      const user = users.find(u => u.id === userId);
      
      if (!user || !user.email) {
        // User has no email, skip notification silently
        return;
      }

      const data = {
        user_id: userId,
        email_type: 'assignment',
        subject: 'New Notebook Assignment',
        body: `
          <h2>Hello ${user.first_name},</h2>
          <p>You have been assigned a new notebook page to complete.</p>
          <p><strong>Due Date:</strong> ${this.formatDate(scheduledDate)}</p>
          <p>Please log in to complete this assignment by the due date.</p>
          <p>Thank you!</p>
        `
      };

      await this.apiClient.sendEmailNotification(data);
    } catch (error) {
      console.error('Error sending assignment notification:', error);
    }
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const scheduleManager = new ScheduleManager(apiClient);