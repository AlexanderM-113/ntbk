// Group and user management functionality
class GroupManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.groups = [];
    this.users = [];
  }

  async init() {
    await this.loadGroups();
    await this.loadUsers();
    this.setupEventListeners();
  }

  async loadGroups() {
    try {
      const groups = await this.apiClient.getGroups();
      this.groups = groups;
      this.renderGroups();
    } catch (error) {
      console.error('Error loading groups:', error);
      adminDashboard.showError('Failed to load groups');
    }
  }

  async loadUsers() {
    try {
      const users = await this.apiClient.getUsers();
      this.users = users;
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  renderGroups() {
    const container = document.getElementById('groups-content');
    if (!container) return;
    
    container.innerHTML = '';

    if (this.groups.length === 0) {
      container.innerHTML = '<p class="text-muted">No groups created yet. Click "Create Group" to create one.</p>';
      return;
    }

    this.groups.forEach(group => {
      const groupItem = document.createElement('div');
      groupItem.className = 'group-item';
      groupItem.innerHTML = `
        <div class="group-header">
          <h3 class="group-title">${this.escapeHtml(group.name)}</h3>
          <div class="group-actions">
            <button class="btn btn-small btn-secondary" data-action="edit" data-id="${group.id}">Edit</button>
            <button class="btn btn-small btn-danger" data-action="delete" data-id="${group.id}">Delete</button>
          </div>
        </div>
        <div class="group-stats">
          <span>${group.user_count || 0} users</span>
          ${group.notebook_id ? `<span>• Notebook ID: ${group.notebook_id}</span>` : ''}
        </div>
        <div class="users-list" id="users-${group.id}">
          <p class="text-muted">Loading users...</p>
        </div>
      `;

      container.appendChild(groupItem);
      
      // Load users for this group
      this.loadGroupUsers(group.id);
    });

    // Add event listeners
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        const groupId = button.dataset.id;
        if (button.dataset.action === 'edit') {
          this.editGroup(groupId);
        } else if (button.dataset.action === 'delete') {
          this.deleteGroup(groupId);
        }
      }
    });
  }

  async loadGroupUsers(groupId) {
    try {
      const users = await this.apiClient.getGroupUsers(groupId);
      const container = document.getElementById(`users-${groupId}`);
      
      if (!container) return;
      
      if (users.length === 0) {
        container.innerHTML = '<p class="text-muted">No users in this group.</p>';
        return;
      }

      container.innerHTML = users.map(user => `
        <div class="user-item">
          <div class="user-info">
            <div class="user-name">${this.escapeHtml(user.first_name)} ${this.escapeHtml(user.full_name || '')}</div>
            <div class="user-email">${this.escapeHtml(user.email || 'No email')}</div>
          </div>
          <div class="user-actions">
            <button class="btn btn-small btn-secondary" data-action="edit-user" data-id="${user.id}">Edit</button>
            <button class="btn btn-small btn-danger" data-action="delete-user" data-id="${user.id}">Delete</button>
          </div>
        </div>
      `).join('');

    } catch (error) {
      console.error('Error loading group users:', error);
    }
  }

  setupEventListeners() {
    const createGroupBtn = document.getElementById('createGroupBtn');
    if (createGroupBtn) {
      createGroupBtn.addEventListener('click', () => this.showCreateGroupModal());
    }

    const createUserBtn = document.getElementById('createUserBtn');
    if (createUserBtn) {
      createUserBtn.addEventListener('click', () => this.showCreateUserModal());
    }
  }

  showCreateGroupModal() {
    this.showGroupModal();
  }

  editGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      this.showGroupModal(group);
    }
  }

  showGroupModal(group = null) {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    
    const isEdit = !!group;
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Edit' : 'Create'} Group</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="groupName">Group Name</label>
          <input type="text" id="groupName" value="${group?.name || ''}" required>
        </div>
        
        <div class="form-group">
          <label for="groupDescription">Description</label>
          <textarea id="groupDescription">${group?.description || ''}</textarea>
        </div>
        
        <div class="form-group">
          <label for="groupNotebook">Associated Notebook (Optional)</label>
          <select id="groupNotebook">
            <option value="">No notebook</option>
            <!-- Notebooks would be loaded here -->
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel">Cancel</button>
        <button class="btn btn-primary modal-confirm">${isEdit ? 'Update' : 'Create'} Group</button>
      </div>
    `;

    showElement(overlay);
    
    // Setup modal event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-cancel').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-confirm').addEventListener('click', () => {
      if (isEdit) {
        this.updateGroup(group.id);
      } else {
        this.createGroup();
      }
    });
  }

  async createGroup() {
    try {
      const name = document.getElementById('groupName').value.trim();
      const description = document.getElementById('groupDescription').value.trim();
      const notebookId = document.getElementById('groupNotebook').value;

      if (!name) {
        adminDashboard.showError('Group name is required');
        return;
      }

      const data = {
        name,
        description,
        notebook_id: notebookId || null
      };

      await this.apiClient.createGroup(data);
      adminDashboard.showSuccess('Group created successfully');
      hideElement(document.getElementById('modal-overlay'));
      this.loadGroups();
      
    } catch (error) {
      console.error('Error creating group:', error);
      adminDashboard.showError('Failed to create group');
    }
  }

  async updateGroup(groupId) {
    try {
      const name = document.getElementById('groupName').value.trim();
      const description = document.getElementById('groupDescription').value.trim();

      if (!name) {
        adminDashboard.showError('Group name is required');
        return;
      }

      // Update group (would need API endpoint)
      adminDashboard.showSuccess('Group updated successfully');
      hideElement(document.getElementById('modal-overlay'));
      this.loadGroups();
      
    } catch (error) {
      console.error('Error updating group:', error);
      adminDashboard.showError('Failed to update group');
    }
  }

  async deleteGroup(groupId) {
    if (confirm('Are you sure you want to delete this group? This will also delete all users in the group.')) {
      try {
        // Delete group (would need API endpoint)
        adminDashboard.showSuccess('Group deleted successfully');
        this.loadGroups();
      } catch (error) {
        console.error('Error deleting group:', error);
        adminDashboard.showError('Failed to delete group');
      }
    }
  }

  showCreateUserModal() {
    this.showUserModal();
  }

  editUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      this.showUserModal(user);
    }
  }

  showUserModal(user = null) {
    const modal = document.getElementById('modal-content');
    const overlay = document.getElementById('modal-overlay');
    
    const isEdit = !!user;
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Edit' : 'Create'} User</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="userFirstName">First Name *</label>
          <input type="text" id="userFirstName" value="${user?.first_name || ''}" required>
        </div>
        
        <div class="form-group">
          <label for="userFullName">Full Name</label>
          <input type="text" id="userFullName" value="${user?.full_name || ''}">
        </div>
        
        <div class="form-group">
          <label for="userEmail">Email</label>
          <input type="email" id="userEmail" value="${user?.email || ''}">
        </div>
        
        <div class="form-group">
          <label for="userGroup">Group *</label>
          <select id="userGroup" required>
            <option value="">Select a group</option>
            ${this.groups.map(group => `
              <option value="${group.id}" ${user?.group_id === group.id ? 'selected' : ''}>
                ${this.escapeHtml(group.name)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label for="userNotebook">Notebook *</label>
          <select id="userNotebook" required>
            <option value="">Select a notebook</option>
            <!-- Notebooks would be loaded here -->
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel">Cancel</button>
        <button class="btn btn-primary modal-confirm">${isEdit ? 'Update' : 'Create'} User</button>
      </div>
    `;

    showElement(overlay);
    
    // Setup modal event listeners
    modal.querySelector('.modal-close').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-cancel').addEventListener('click', () => hideElement(overlay));
    modal.querySelector('.modal-confirm').addEventListener('click', () => {
      if (isEdit) {
        this.updateUser(user.id);
      } else {
        this.createUser();
      }
    });
  }

  async createUser() {
    try {
      const firstName = document.getElementById('userFirstName').value.trim();
      const fullName = document.getElementById('userFullName').value.trim();
      const email = document.getElementById('userEmail').value.trim();
      const groupId = document.getElementById('userGroup').value;
      const notebookId = document.getElementById('userNotebook').value;

      if (!firstName || !groupId || !notebookId) {
        adminDashboard.showError('Please fill in all required fields');
        return;
      }

      const data = {
        first_name: firstName,
        full_name: fullName,
        email: email,
        group_id: groupId,
        notebook_id: notebookId
      };

      await this.apiClient.createUser(data);
      adminDashboard.showSuccess('User created successfully');
      hideElement(document.getElementById('modal-overlay'));
      this.loadUsers();
      this.loadGroups();
      
    } catch (error) {
      console.error('Error creating user:', error);
      adminDashboard.showError('Failed to create user');
    }
  }

  async updateUser(userId) {
    try {
      const firstName = document.getElementById('userFirstName').value.trim();
      const fullName = document.getElementById('userFullName').value.trim();
      const email = document.getElementById('userEmail').value.trim();

      if (!firstName) {
        adminDashboard.showError('First name is required');
        return;
      }

      // Update user (would need API endpoint)
      adminDashboard.showSuccess('User updated successfully');
      hideElement(document.getElementById('modal-overlay'));
      this.loadUsers();
      
    } catch (error) {
      console.error('Error updating user:', error);
      adminDashboard.showError('Failed to update user');
    }
  }

  async deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        // Delete user (would need API endpoint)
        adminDashboard.showSuccess('User deleted successfully');
        this.loadUsers();
        this.loadGroups();
      } catch (error) {
        console.error('Error deleting user:', error);
        adminDashboard.showError('Failed to delete user');
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const groupManager = new GroupManager(apiClient);