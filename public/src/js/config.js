// API Configuration
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.API_BASE_URL = isLocalHost
  ? 'http://localhost:8787'
  : 'https://notebook-writer.fhardy25.workers.dev';