export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy /api/* requests to the notebook-writer Worker
    if (url.pathname.startsWith('/api')) {
      // Rewrite the path: /api/entries → /entries (adjust as needed for your Worker's routes)
      const newUrl = new URL(request.url);
      newUrl.pathname = url.pathname.replace(/^\/api/, '');
      const newRequest = new Request(newUrl, request);
      return env.API.fetch(newRequest);
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  }
};
