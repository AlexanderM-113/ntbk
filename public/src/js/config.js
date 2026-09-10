// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:8787' 
  : 'https://your-worker-url.workers.dev'; // Replace with actual Worker URL

window.API_BASE_URL = API_BASE_URL;