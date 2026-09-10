// User login functionality
class UserLogin {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  init() {
    this.checkExistingSession();
    this.setupLoginForm();
  }

  checkExistingSession() {
    const session = getUserSession();
    if (session) {
      this.showDashboard(session);
    } else {
      this.showLogin();
    }
  }

  setupLoginForm() {
    const loginForm = document.getElementById('login-form');
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

    const firstNameInput = document.getElementById('firstNameInput');
    const firstName = firstNameInput.value.trim();
    const errorDiv = document.getElementById('loginError');

    if (!firstName) {
      errorDiv.textContent = 'Please enter your first name';
      return;
    }

    try {
      const user = await this.apiClient.login(firstName);

      // Store user session in localStorage
      setUserSession(user);

      errorDiv.textContent = '';
      this.showDashboard(user);
      
      // Load dashboard data
      userDashboard.init();
    } catch (error) {
      errorDiv.textContent = 'Name not found. Please check and try again.';
      console.error('Login error:', error);
    }
  }

  handleLogout() {
    clearUserSession();
    this.showLogin();
  }

  showLogin() {
    hideElement(document.getElementById('dashboard-page'));
    hideElement(document.getElementById('entry-page'));
    hideElement(document.getElementById('success-page'));
    showElement(document.getElementById('login-page'));
    
    // Clear input
    document.getElementById('firstNameInput').value = '';
  }

  showDashboard(user) {
    hideElement(document.getElementById('login-page'));
    showElement(document.getElementById('dashboard-page'));
    
    // Update header
    document.getElementById('userName').textContent = user.first_name;
    document.getElementById('dashboardUserName').textContent = user.first_name;
  }
}

const userLogin = new UserLogin(apiClient);