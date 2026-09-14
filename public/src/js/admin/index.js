// Main admin application initialization
document.addEventListener('DOMContentLoaded', () => {
  // Initialize authentication
  adminAuth.init();

  // Setup navigation
  setupNavigation();

  // Setup page-specific initialization
  setupPageInitialization();
});

function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const page = button.dataset.page;
      navigateToPage(page);
    });
  });
}

function navigateToPage(pageName) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Remove active class from nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show target page
  const targetPage = document.getElementById(`${pageName}-page`);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  // Activate corresponding nav button
  const navButton = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
  if (navButton) {
    navButton.classList.add('active');
  }
  
  // Initialize page-specific functionality
  initializePage(pageName);
}

function setupPageInitialization() {
  // Each page will be initialized when navigated to
}

function initializePage(pageName) {
  switch (pageName) {
    case 'dashboard':
      if (adminDashboard) {
        adminDashboard.init();
      }
      break;
    case 'notebooks':
      if (adminDashboard) {
        adminDashboard.setupNotebookControls();
        adminDashboard.loadNotebooksPage();
      }
      break;
    case 'schedule':
      if (scheduleManager) {
        scheduleManager.init();
      }
      break;
    case 'groups':
      if (groupManager) {
        groupManager.init();
      }
      break;
    case 'audit':
      if (auditLog) {
        auditLog.init();
      }
      break;
    case 'entries':
      // Entries are loaded when a specific notebook is selected
      break;
    case 'settings':
      // Settings page initialization
      break;
  }
}

// Utility functions for modal handling
document.addEventListener('click', (e) => {
  // Close modal when clicking outside
  if (e.target.classList.contains('modal-overlay')) {
    hideElement(e.target);
  }
  
  // Close modal with escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('modal-overlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        hideElement(overlay);
      }
    }
  });
});