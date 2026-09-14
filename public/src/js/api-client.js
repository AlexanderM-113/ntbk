// API Client for making HTTP requests
class APIClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const config = {
      method: options.method || 'GET',
      headers,
      ...options,
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        let errorMessage = 'API Error';
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      if (response.headers.get('content-type')?.includes('application/json')) {
        return await response.json();
      }

      return response;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth endpoints
  login(firstName) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: { first_name: firstName },
    });
  }

  adminLogin(username, password) {
    return this.request('/api/auth/admin/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  initializeAdmin(username, password, email) {
    return this.request('/api/admin/initialize', {
      method: 'POST',
      body: { username, password, email },
    });
  }

  // Admin endpoints
  getNotebooks() {
    return this.request('/api/admin/notebooks');
  }

  createNotebook(data) {
    return this.request('/api/admin/notebooks', {
      method: 'POST',
      body: data,
    });
  }

  updateNotebook(notebookId, data) {
    return this.request(`/api/admin/notebooks/${notebookId}`, {
      method: 'PUT',
      body: data,
    });
  }

  deleteNotebook(notebookId) {
    return this.request(`/api/admin/notebooks/${notebookId}`, {
      method: 'DELETE',
    });
  }

  publishNotebook(notebookId) {
    return this.request(`/api/admin/notebooks/${notebookId}/publish`, {
      method: 'POST',
    });
  }

  // Pages
  getPages() {
    return this.request('/api/admin/pages');
  }

  getPagesByNotebook(notebookId) {
    return this.request(`/api/admin/pages?notebook_id=${notebookId}`);
  }

  createPage(data) {
    return this.request('/api/admin/pages', {
      method: 'POST',
      body: data,
    });
  }

  updatePage(pageId, data) {
    return this.request(`/api/admin/pages/${pageId}`, {
      method: 'PUT',
      body: data,
    });
  }

  deletePage(pageId) {
    return this.request(`/api/admin/pages/${pageId}`, {
      method: 'DELETE',
    });
  }

  reorderPages(pages) {
    return this.request('/api/admin/pages/reorder', {
      method: 'POST',
      body: { pages },
    });
  }

  // Page elements
  getPageElements() {
    return this.request('/api/admin/page-elements');
  }

  getPageElementsByPage(pageId) {
    return this.request(`/api/admin/page-elements?page_id=${pageId}`);
  }

  addPageElement(data) {
    return this.request('/api/admin/page-elements', {
      method: 'POST',
      body: data,
    });
  }

  updatePageElement(elementId, data) {
    return this.request(`/api/admin/page-elements/${elementId}`, {
      method: 'PUT',
      body: data,
    });
  }

  deletePageElement(elementId) {
    return this.request(`/api/admin/page-elements/${elementId}`, {
      method: 'DELETE',
    });
  }

  // Groups
  getGroups() {
    return this.request('/api/admin/groups');
  }

  createGroup(data) {
    return this.request('/api/admin/groups', {
      method: 'POST',
      body: data,
    });
  }

  getGroupUsers(groupId) {
    return this.request(`/api/admin/groups/${groupId}/users`);
  }

  updateGroup(groupId, data) {
    return this.request(`/api/admin/groups/${groupId}`, {
      method: 'PUT',
      body: data,
    });
  }

  deleteGroup(groupId) {
    return this.request(`/api/admin/groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  // Users
  getUsers() {
    return this.request('/api/admin/users');
  }

  createUser(data) {
    return this.request('/api/admin/users', {
      method: 'POST',
      body: data,
    });
  }

  assignPagesToUser(data) {
    return this.request('/api/admin/users/assign-pages', {
      method: 'POST',
      body: data,
    });
  }

  updateUser(userId, data) {
    return this.request(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: data,
    });
  }

  deleteUser(userId) {
    return this.request(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // Schedule
  getScheduleAssignments() {
    return this.request('/api/admin/schedule');
  }

  createScheduleAssignment(data) {
    return this.request('/api/admin/schedule', {
      method: 'POST',
      body: data,
    });
  }

  updateScheduleAssignment(scheduleId, data) {
    return this.request(`/api/admin/schedule/${scheduleId}`, {
      method: 'PUT',
      body: data,
    });
  }

  deleteScheduleAssignment(scheduleId) {
    return this.request(`/api/admin/schedule/${scheduleId}`, {
      method: 'DELETE',
    });
  }

  processReminders() {
    return this.request('/api/email/reminders', {
      method: 'POST',
    });
  }

  // Entries
  getNotebookEntries(notebookId) {
    return this.request(`/api/admin/notebooks/${notebookId}/entries`);
  }

  getEntryDetails(entryId) {
    return this.request(`/api/admin/entries/${entryId}`);
  }

  unlockEntry(entryId, adminUserId) {
    return this.request(`/api/admin/entries/${entryId}/unlock`, {
      method: 'POST',
      body: { entry_id: entryId, admin_user_id: adminUserId },
    });
  }

  deleteEntry(entryId) {
    return this.request(`/api/admin/entries/${entryId}`, {
      method: 'DELETE',
    });
  }

  // Statistics
  getStatistics() {
    return this.request('/api/admin/statistics');
  }

  // Audit Log
  getAuditLog() {
    return this.request('/api/admin/audit-log');
  }

  // User endpoints
  getUserPage(pageId, userId) {
    return this.request(`/api/user/pages/${pageId}?user_id=${userId}`);
  }

  submitEntry(data) {
    return this.request('/api/user/entries', {
      method: 'POST',
      body: data,
    });
  }

  // File endpoints
  async uploadFile(file, folder) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const response = await fetch(`${this.baseURL}/api/files/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('File upload failed');
    }

    return response.json();
  }

  // PDF endpoints
  generatePdf(entryId, notebookId, userId) {
    return this.request('/api/pdf/export', {
      method: 'POST',
      body: { entry_id: entryId, notebook_id: notebookId, user_id: userId },
    });
  }

  // Email endpoints
  sendEmailNotification(data) {
    return this.request('/api/email/send', {
      method: 'POST',
      body: data,
    });
  }
}

const apiClient = new APIClient(window.API_BASE_URL);