// Main user application initialization
document.addEventListener('DOMContentLoaded', () => {
  // Initialize login
  userLogin.init();

  // Setup page navigation
  setupNavigation();
});

function setupNavigation() {
  // Dashboard button
  const dashboardBtn = document.getElementById('dashboardBtn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
      navigateTo('dashboard-page');
      if (userDashboard) {
        userDashboard.init();
      }
    });
  }

  // Next page button
  const nextPageBtn = document.getElementById('nextPageBtn');
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      navigateToNextPage();
    });
  }
}

function navigateTo(pageId) {
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

function navigateToNextPage() {
  const user = getUserSession();
  if (!user) {
    userLogin.showLogin();
    return;
  }

  // Find next incomplete page
  if (userDashboard) {
    const nextIncompletePage = userDashboard.assignedPages.find(page => 
      !userDashboard.isPageCompleted(page.id)
    );

    if (nextIncompletePage) {
      if (pageEntry) {
        pageEntry.loadPage(nextIncompletePage);
      }
    } else {
      // All pages completed, go to dashboard
      navigateTo('dashboard-page');
      if (userDashboard) {
        userDashboard.init();
      }
    }
  }
}

// Handle window resize for signature pad
window.addEventListener('resize', () => {
  if (signaturePad) {
    signaturePad.init();
  }
});