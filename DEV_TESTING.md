# Local browser testing

## Start the frontend on port 8080

From the repository root in Google Cloud Shell:

```bash
python3 -m http.server 8080 --bind 0.0.0.0 --directory public
```

Open the Cloud Shell **Web preview** for port `8080`. This only serves the static frontend.

## Use an in-memory API mock

Open the browser DevTools Console on the local preview, paste the complete script below, and press Enter. It intercepts only requests whose path starts with `/api/`; all other requests continue to use the browser's original `fetch`.

The mock accepts any login values, keeps changes in memory for the current tab, and provides `window.notebookMock.disable()` to restore the original API immediately. It never changes application source files, local storage, or the deployed Worker.

```js
(() => {
  if (window.notebookMock) window.notebookMock.disable();

  const originalFetch = window.fetch.bind(window);
  const state = {
    notebooks: [{
      id: 'nb-demo',
      title: 'Demo Notebook',
      description: 'Local browser test data',
      status: 'draft',
      page_count: 1,
      entry_count: 0,
      cover_title: 'Demo Notebook',
      cover_subtitle: 'Local test data',
      cover_background_color: '#17324d',
      cover_text_color: '#ffffff',
      global_font_family: 'Georgia'
    }],
    pages: [{
      id: 'page-demo',
      notebook_id: 'nb-demo',
      page_number: 1,
      title: 'Daily Check-In',
      page_type: 'template',
      elements: [{
        id: 'element-demo',
        page_id: 'page-demo',
        element_type: 'question',
        field_type: 'textarea',
        question_text: 'What went well today?',
        order_position: 1,
        required: false
      }]
    }],
    groups: [{ id: 'group-demo', name: 'Demo Group', description: 'Local test group' }],
    users: [{
      id: 'user-demo', user_id: 'user-demo', first_name: 'Test', full_name: 'Test User',
      email: 'test@example.com', group_id: 'group-demo', notebook_id: 'nb-demo', status: 'active',
      assigned_pages: [{ page_id: 'page-demo', status: 'pending' }]
    }],
    schedules: [],
    entries: [],
    auditLog: []
  };

  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
  const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const bodyOf = async (init) => {
    if (!init || !init.body) return {};
    if (typeof init.body === 'string') return JSON.parse(init.body);
    return {};
  };
  const findById = (items, value) => items.find(item => item.id === value);
  const pageView = (page) => page ? { ...page, elements: page.elements || [] } : null;

  async function mockFetch(input, init) {
    const requestUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(requestUrl, window.location.href);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);

    const method = (init && init.method) || (typeof input !== 'string' && input.method) || 'GET';
    const path = url.pathname;
    const data = await bodyOf(init);

    if (path === '/api/auth/admin/login' && method === 'POST') {
      return jsonResponse({ admin_id: 'admin-demo', username: data.username || 'demo-admin', email: 'admin@example.com' });
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const user = { ...state.users[0], first_name: data.first_name || 'Test' };
      return jsonResponse(user);
    }
    if (path === '/api/admin/initialize' && method === 'POST') return jsonResponse({ success: true });

    if (path === '/api/admin/statistics') {
      return jsonResponse({ total_entries: state.entries.length, entries_this_week: state.entries.length, pending_entries: 0 });
    }
    if (path === '/api/admin/audit-log') return jsonResponse(state.auditLog);
    if (path === '/api/admin/notebooks' && method === 'GET') return jsonResponse(state.notebooks);
    if (path === '/api/admin/notebooks' && method === 'POST') {
      const notebook = { id: id('nb'), status: 'draft', page_count: 0, entry_count: 0, ...data };
      state.notebooks.push(notebook);
      return jsonResponse(notebook, 201);
    }
    if (path.startsWith('/api/admin/notebooks/')) {
      const parts = path.split('/');
      const notebookId = parts[4];
      const notebook = findById(state.notebooks, notebookId);
      if (parts[5] === 'publish') {
        if (notebook) notebook.status = 'published';
        return jsonResponse(notebook || {});
      }
      if (parts[5] === 'entries') return jsonResponse(state.entries.filter(entry => entry.notebook_id === notebookId));
      if (method === 'PUT') {
        if (notebook) Object.assign(notebook, data);
        return jsonResponse(notebook || {});
      }
      if (method === 'DELETE') {
        state.notebooks = state.notebooks.filter(item => item.id !== notebookId);
        return jsonResponse({ success: true });
      }
    }

    if (path === '/api/admin/pages' && method === 'GET') {
      const notebookId = url.searchParams.get('notebook_id');
      return jsonResponse(notebookId ? state.pages.filter(page => page.notebook_id === notebookId).map(pageView) : state.pages.map(pageView));
    }
    if (path === '/api/admin/pages' && method === 'POST') {
      const page = { id: id('page'), page_number: state.pages.length + 1, elements: [], ...data };
      state.pages.push(page);
      return jsonResponse(page, 201);
    }
    if (path === '/api/admin/pages/reorder') return jsonResponse({ success: true });
    if (path.startsWith('/api/admin/pages/')) {
      const pageId = path.split('/')[4];
      const page = findById(state.pages, pageId);
      if (method === 'PUT') { if (page) Object.assign(page, data); return jsonResponse(page || {}); }
      if (method === 'DELETE') { state.pages = state.pages.filter(item => item.id !== pageId); return jsonResponse({ success: true }); }
    }

    if (path === '/api/admin/page-elements' && method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      return jsonResponse(state.pages.flatMap(page => page.elements || []).filter(element => !pageId || element.page_id === pageId));
    }
    if (path === '/api/admin/page-elements' && method === 'POST') {
      const element = { id: id('element'), ...data };
      const page = findById(state.pages, data.page_id);
      if (page) (page.elements ||= []).push(element);
      return jsonResponse(element, 201);
    }
    if (path.startsWith('/api/admin/page-elements/')) {
      const elementId = path.split('/')[4];
      const page = state.pages.find(item => (item.elements || []).some(element => element.id === elementId));
      const element = page && findById(page.elements, elementId);
      if (method === 'PUT') { if (element) Object.assign(element, data); return jsonResponse(element || {}); }
      if (method === 'DELETE') { if (page) page.elements = page.elements.filter(item => item.id !== elementId); return jsonResponse({ success: true }); }
    }

    const collections = [
      ['/api/admin/groups', 'groups'], ['/api/admin/users', 'users'], ['/api/admin/schedule', 'schedules']
    ];
    for (const [prefix, key] of collections) {
      if (path === prefix && method === 'GET') return jsonResponse(state[key]);
      if (path === prefix && method === 'POST') { const item = { id: id(key.slice(0, -1)), ...data }; state[key].push(item); return jsonResponse(item, 201); }
      if (path.startsWith(`${prefix}/`)) {
        const itemId = path.slice(prefix.length + 1);
        const item = findById(state[key], itemId);
        if (method === 'PUT') { if (item) Object.assign(item, data); return jsonResponse(item || {}); }
        if (method === 'DELETE') { state[key] = state[key].filter(value => value.id !== itemId); return jsonResponse({ success: true }); }
      }
    }
    if (path.match(/^\/api\/admin\/groups\/[^/]+\/users$/)) return jsonResponse(state.users);
    if (path === '/api/admin/users/assign-pages' && method === 'POST') return jsonResponse({ success: true });

    if (path === '/api/user/entries' && method === 'POST') {
      const entry = { id: id('entry'), created_at: new Date().toISOString(), ...data };
      state.entries.push(entry);
      return jsonResponse(entry, 201);
    }
    if (path.startsWith('/api/user/pages/')) {
      const page = findById(state.pages, path.split('/')[4]);
      return jsonResponse(pageView(page) || { id: path.split('/')[4], title: 'Demo Page', elements: [] });
    }
    if (path === '/api/files/upload' && method === 'POST') {
      const fileId = id('file');
      return jsonResponse({ file_id: fileId, url: URL.createObjectURL((init && init.body && init.body.get('file')) || new Blob()) });
    }
    if (path === '/api/pdf/export' && method === 'POST') return jsonResponse({ url: '#', export_url: '#', file_id: id('pdf') });
    if (path.startsWith('/api/email/')) return jsonResponse({ success: true, mocked: true });
    if (path.match(/^\/api\/admin\/entries\/[^/]+/)) return jsonResponse({ success: true });

    return jsonResponse([], 200);
  }

  window.fetch = mockFetch;
  window.notebookMock = {
    state,
    disable() {
      window.fetch = originalFetch;
      delete window.notebookMock;
      console.info('Notebook API mock disabled; original fetch restored.');
    },
    reset() { window.location.reload(); }
  };
  console.info('Notebook API mock enabled. Demo logins: any admin username/password or Test. Disable with notebookMock.disable().');
})();
```

This is a browser test fixture, not an authentication bypass. Do not paste it into a deployed site or use it to evaluate production security.