// Local storage utilities

const STORAGE_KEYS = {
  ADMIN_SESSION: 'admin_session',
  USER_SESSION: 'user_session',
  THEME: 'theme',
  PREFERENCES: 'preferences'
};

function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Storage error:', error);
    return false;
  }
}

function getItem(key) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error('Storage error:', error);
    return null;
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Storage error:', error);
    return false;
  }
}

function clear() {
  try {
    localStorage.clear();
    return true;
  } catch (error) {
    console.error('Storage error:', error);
    return false;
  }
}

// Session specific functions
function setAdminSession(session) {
  return setItem(STORAGE_KEYS.ADMIN_SESSION, session);
}

function getAdminSession() {
  return getItem(STORAGE_KEYS.ADMIN_SESSION);
}

function clearAdminSession() {
  return removeItem(STORAGE_KEYS.ADMIN_SESSION);
}

function setUserSession(session) {
  return setItem(STORAGE_KEYS.USER_SESSION, session);
}

function getUserSession() {
  return getItem(STORAGE_KEYS.USER_SESSION);
}

function clearUserSession() {
  return removeItem(STORAGE_KEYS.USER_SESSION);
}

// Preferences
function setPreferences(preferences) {
  return setItem(STORAGE_KEYS.PREFERENCES, preferences);
}

function getPreferences() {
  return getItem(STORAGE_KEYS.PREFERENCES) || {};
}

function updatePreference(key, value) {
  const preferences = getPreferences();
  preferences[key] = value;
  return setPreferences(preferences);
}