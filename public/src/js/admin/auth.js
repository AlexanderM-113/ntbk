// Admin authentication handling
class AdminAuth {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.session = null;
  }

  init() {
    this.checkExistingSession();
    this.setupLoginForm();
  }

  checkExistingSession() {
    const session = getAdminSession();
    if (session) {
      this.session = session;
      this.showDashboard();
    } else {
      this.showLogin();
    }
  }

  setupLoginForm() {
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
  }

  async handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!username || !password) {
      errorDiv.textContent = 'Please enter both username and password';
      return;
    }

    try {
      const response = await this.apiClient.adminLogin(username, password);
      
      this.session = response;
      setAdminSession(response);
      
      errorDiv.textContent = '';
      this.showDashboard();
      
      // Load dashboard data
      adminDashboard.init();
    } catch (error) {
      errorDiv.textContent = 'Invalid username or password';
      console.error('Login error:', error);
    }
  }

  handleLogout() {
    clearAdminSession();
    this.session = null;
    this.showLogin();
  }

  showLogin() {
    hideElement(document.getElementById('admin-dashboard'));
    showElement(document.getElementById('admin-login'));
  }

  showDashboard() {
    hideElement(document.getElementById('admin-login'));
    showElement(document.getElementById('admin-dashboard'));
    
    if (this.session) {
      document.getElementById('adminName').textContent = this.session.username;
    }
  }

  isAuthenticated() {
    return !!this.session;
  }

  async initializeFirstAdmin(username, password, email) {
    try {
      const response = await this.apiClient.initializeAdmin(username, password, email);
      return response;
    } catch (error) {
      console.error('Initialization error:', error);
      throw error;
    }
  }
}

const adminAuth = new AdminAuth(apiClient);