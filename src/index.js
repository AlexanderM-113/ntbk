/**
 * Main Worker entry point
 * Routes all requests to appropriate handlers
 */

// Utility functions
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Validation functions
function validateNotebookInput(data) {
  const errors = [];
  
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Invalid notebook title');
  }
  
  if (data.title && data.title.length > 255) {
    errors.push('Notebook title too long (max 255 characters)');
  }
  
  if (data.group_id && typeof data.group_id !== 'string') {
    errors.push('Invalid group ID');
  }
  
  return errors;
}

function validatePageElement(element) {
  const errors = [];
  
  if (!['question', 'image_upload', 'text', 'divider', 'spacing'].includes(element.element_type)) {
    errors.push('Invalid element type');
  }
  
  if (element.element_type === 'question') {
    if (!element.question_text) {
      errors.push('Question text required');
    }
    if (!['text', 'textarea', 'numeric'].includes(element.field_type)) {
      errors.push('Invalid field type');
    }
  }
  
  return errors;
}

// Auth routes
async function handleAuthRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    return handleUserLogin(request, env, corsHeaders);
  }
  
  if (url.pathname === '/api/auth/admin/login' && request.method === 'POST') {
    return handleAdminLogin(request, env, corsHeaders);
  }
  
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

async function handleUserLogin(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { first_name } = body;
    
    if (!first_name || first_name.trim() === '') {
      return new Response(JSON.stringify({ error: 'First name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const user = await db.prepare(
      `SELECT * FROM users  
       WHERE LOWER(first_name) = LOWER(?)  
       AND status = 'active'  
       LIMIT 1`
    ).bind(first_name).first();
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Update last login
    await db.prepare(
      `UPDATE users SET last_login = ? WHERE id = ?`
    ).bind(new Date().toISOString(), user.id).run();
    
    // Get assigned pages for user
    const assignedPages = await db.prepare(
      `SELECT page_id FROM page_assignments  
       WHERE user_id = ? AND status = 'assigned'`
    ).bind(user.id).all();
    
    const response = {
      user_id: user.id,
      first_name: user.first_name,
      full_name: user.full_name,
      notebook_id: user.notebook_id,
      group_id: user.group_id,
      assigned_pages: assignedPages.results.map(r => r.page_id)
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleAdminLogin(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { username, password } = body;
    
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const admin = await db.prepare(
      `SELECT * FROM admin_users  
       WHERE username = ? AND status = 'active'  
       LIMIT 1`
    ).bind(username).first();
    
    if (!admin) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Simple password comparison (in production, use proper hashing)
    if (admin.password_hash !== password) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Update last login
    await db.prepare(
      `UPDATE admin_users SET last_login = ? WHERE id = ?`
    ).bind(new Date().toISOString(), admin.id).run();
    
    const response = {
      admin_id: admin.id,
      username: admin.username,
      email: admin.email
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Admin routes
async function handleAdminRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Notebooks
  if (pathParts[2] === 'notebooks') {
    if (request.method === 'GET' && pathParts.length === 3) {
      return getNotebooks(env, corsHeaders);
    }
    if (request.method === 'POST' && pathParts.length === 3) {
      return createNotebook(request, env, corsHeaders);
    }
    if (request.method === 'PUT' && pathParts.length === 4) {
      return updateNotebook(request, env, pathParts[3], corsHeaders);
    }
    if (request.method === 'DELETE' && pathParts.length === 4) {
      return deleteNotebook(env, pathParts[3], corsHeaders);
    }
    if (request.method === 'POST' && pathParts[4] === 'publish') {
      return publishNotebook(env, pathParts[3], corsHeaders);
    }
  }
  
  // Pages
  if (pathParts[2] === 'pages') {
    if (request.method === 'GET' && pathParts.length === 3) {
      return getPages(env, corsHeaders);
    }
    if (request.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'notebook') {
      const url = new URL(request.url);
      const notebookId = url.searchParams.get('notebook_id');
      return getPagesByNotebook(env, notebookId, corsHeaders);
    }
    if (request.method === 'POST' && pathParts.length === 3) {
      return createPage(request, env, corsHeaders);
    }
    if (request.method === 'PUT' && pathParts.length === 4) {
      return updatePage(request, env, pathParts[3], corsHeaders);
    }
    if (request.method === 'DELETE' && pathParts.length === 4) {
      return deletePage(env, pathParts[3], corsHeaders);
    }
    if (request.method === 'POST' && pathParts[4] === 'reorder') {
      return reorderPages(request, env, corsHeaders);
    }
  }
  
  // Page elements
  if (pathParts[2] === 'page-elements') {
    if (request.method === 'GET' && pathParts.length === 3) {
      return getPageElements(env, corsHeaders);
    }
    if (request.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'page') {
      const url = new URL(request.url);
      const pageId = url.searchParams.get('page_id');
      return getPageElementsByPage(env, pageId, corsHeaders);
    }
    if (request.method === 'POST' && pathParts.length === 3) {
      return addPageElement(request, env, corsHeaders);
    }
    if (request.method === 'PUT' && pathParts.length === 4) {
      return updatePageElement(request, env, pathParts[3], corsHeaders);
    }
    if (request.method === 'DELETE' && pathParts.length === 4) {
      return deletePageElement(env, pathParts[3], corsHeaders);
    }
  }
  
  // Groups
  if (pathParts[2] === 'groups') {
    if (request.method === 'GET' && pathParts.length === 3) {
      return getGroups(env, corsHeaders);
    }
    if (request.method === 'POST' && pathParts.length === 3) {
      return createGroup(request, env, corsHeaders);
    }
    if (request.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'users') {
      return getGroupUsers(env, pathParts[2], corsHeaders);
    }
  }
  
  // Users
  if (pathParts[2] === 'users') {
    if (request.method === 'POST' && pathParts.length === 3) {
      return createUser(request, env, corsHeaders);
    }
    if (request.method === 'POST' && pathParts.length === 5 && pathParts[4] === 'assign-pages') {
      return assignPagesToUser(request, env, corsHeaders);
    }
    if (request.method === 'GET' && pathParts.length === 3) {
      return getUsers(env, corsHeaders);
    }
  }
  
  // Schedule assignments
  if (pathParts[2] === 'schedule') {
    if (request.method === 'GET' && pathParts.length === 3) {
      return getScheduleAssignments(env, corsHeaders);
    }
    if (request.method === 'POST' && pathParts.length === 3) {
      return createScheduleAssignment(request, env, corsHeaders);
    }
    if (request.method === 'PUT' && pathParts.length === 4) {
      return updateScheduleAssignment(request, env, pathParts[3], corsHeaders);
    }
    if (request.method === 'DELETE' && pathParts.length === 4) {
      return deleteScheduleAssignment(env, pathParts[3], corsHeaders);
    }
  }
  
  // Entries
  if (pathParts[2] === 'entries') {
    if (request.method === 'GET' && pathParts.length === 3) {
      return getEntryDetails(request, env, pathParts[3], corsHeaders);
    }
    if (request.method === 'POST' && pathParts.length === 4 && pathParts[4] === 'unlock') {
      return unlockEntry(request, env, pathParts[3], corsHeaders);
    }
    if (request.method === 'DELETE' && pathParts.length === 4) {
      return deleteEntry(env, pathParts[3], corsHeaders);
    }
  }
  
  // Notebook entries
  if (pathParts[2] === 'notebooks' && pathParts[4] === 'entries') {
    if (request.method === 'GET') {
      return getNotebookEntries(env, pathParts[3], corsHeaders);
    }
  }
  
  // Statistics
  if (pathParts[2] === 'statistics' && request.method === 'GET') {
    return getStatistics(env, corsHeaders);
  }
  
  // Initialize admin account
  if (pathParts[2] === 'initialize' && request.method === 'POST') {
    return initializeAdminAccount(request, env, corsHeaders);
  }
  
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

// Notebook functions
async function getNotebooks(env, corsHeaders) {
  try {
    const db = env.DB;
    const notebooks = await db.prepare(
      `SELECT * FROM notebooks ORDER BY created_at DESC`
    ).all();
    
    return new Response(JSON.stringify(notebooks.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function createNotebook(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const errors = validateNotebookInput(body);
    
    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: errors.join(', ') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const {
      title,
      description,
      type,
      group_id,
      cover_title,
      cover_subtitle,
      cover_background_color,
      cover_text_color,
      global_font_family,
      global_text_color,
      global_background_color
    } = body;
    
    const db = env.DB;
    const notebookId = generateUUID();
    
    await db.prepare(
      `INSERT INTO notebooks  
       (id, title, description, type, group_id, cover_title,  
        cover_subtitle, cover_background_color, cover_text_color, 
        global_font_family, global_text_color, global_background_color, 
        status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      notebookId, title, description, type, group_id, cover_title,
      cover_subtitle, cover_background_color, cover_text_color,
      global_font_family, global_text_color, global_background_color,
      'draft', new Date().toISOString(), new Date().toISOString()
    ).run();
    
    return new Response(JSON.stringify({ id: notebookId, title, status: 'draft' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function updateNotebook(request, env, notebookId, corsHeaders) {
  try {
    const body = await request.json();
    const errors = validateNotebookInput(body);
    
    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: errors.join(', ') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    
    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    
    if (body.title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(body.title);
    }
    if (body.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(body.description);
    }
    if (body.cover_title !== undefined) {
      updateFields.push('cover_title = ?');
      updateValues.push(body.cover_title);
    }
    if (body.cover_subtitle !== undefined) {
      updateFields.push('cover_subtitle = ?');
      updateValues.push(body.cover_subtitle);
    }
    if (body.cover_background_color !== undefined) {
      updateFields.push('cover_background_color = ?');
      updateValues.push(body.cover_background_color);
    }
    if (body.cover_text_color !== undefined) {
      updateFields.push('cover_text_color = ?');
      updateValues.push(body.cover_text_color);
    }
    if (body.global_font_family !== undefined) {
      updateFields.push('global_font_family = ?');
      updateValues.push(body.global_font_family);
    }
    if (body.global_text_color !== undefined) {
      updateFields.push('global_text_color = ?');
      updateValues.push(body.global_text_color);
    }
    if (body.global_background_color !== undefined) {
      updateFields.push('global_background_color = ?');
      updateValues.push(body.global_background_color);
    }
    
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(notebookId);
    
    await db.prepare(
      `UPDATE notebooks SET ${updateFields.join(', ')} WHERE id = ?`
    ).bind(...updateValues).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function deleteNotebook(env, notebookId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM notebooks WHERE id = ?').bind(notebookId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function publishNotebook(env, notebookId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare(
      `UPDATE notebooks SET status = 'published', updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), notebookId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Page functions
async function getPages(env, corsHeaders) {
  try {
    const db = env.DB;
    const pages = await db.prepare(
      `SELECT * FROM pages ORDER BY notebook_id, page_number ASC`
    ).all();
    
    return new Response(JSON.stringify(pages.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function getPagesByNotebook(env, notebookId, corsHeaders) {
  try {
    if (!notebookId) {
      return new Response(JSON.stringify({ error: 'Notebook ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const pages = await db.prepare(
      `SELECT * FROM pages WHERE notebook_id = ? ORDER BY page_number ASC`
    ).bind(notebookId).all();
    
    return new Response(JSON.stringify(pages.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function createPage(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const {
      notebook_id,
      title,
      page_type,
      background_color,
      font_family,
      requires_signature,
      content
    } = body;
    
    if (!notebook_id || !title || !page_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const pageId = generateUUID();
    
    // Get next page number
    const lastPage = await db.prepare(
      `SELECT MAX(page_number) as max_num FROM pages  
       WHERE notebook_id = ? AND page_type != 'toc'`
    ).bind(notebook_id).first();
    
    const pageNumber = (lastPage?.max_num || 0) + 1;
    
    await db.prepare(
      `INSERT INTO pages  
       (id, notebook_id, page_number, title, page_type,  
        background_color, font_family, requires_signature, content, 
        order_position, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      pageId, notebook_id, pageNumber, title, page_type,
      background_color, font_family, requires_signature, content,
      pageNumber, new Date().toISOString(), new Date().toISOString()
    ).run();
    
    // Update notebook page count
    await db.prepare(
      `UPDATE notebooks SET page_count = page_count + 1, updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), notebook_id).run();
    
    return new Response(JSON.stringify({ id: pageId, page_number: pageNumber, title }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function updatePage(request, env, pageId, corsHeaders) {
  try {
    const body = await request.json();
    const db = env.DB;
    
    const updateFields = [];
    const updateValues = [];
    
    if (body.title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(body.title);
    }
    if (body.background_color !== undefined) {
      updateFields.push('background_color = ?');
      updateValues.push(body.background_color);
    }
    if (body.font_family !== undefined) {
      updateFields.push('font_family = ?');
      updateValues.push(body.font_family);
    }
    if (body.requires_signature !== undefined) {
      updateFields.push('requires_signature = ?');
      updateValues.push(body.requires_signature ? 1 : 0);
    }
    if (body.content !== undefined) {
      updateFields.push('content = ?');
      updateValues.push(body.content);
    }
    
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(pageId);
    
    await db.prepare(
      `UPDATE pages SET ${updateFields.join(', ')} WHERE id = ?`
    ).bind(...updateValues).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function deletePage(env, pageId, corsHeaders) {
  try {
    const db = env.DB;
    
    // Get notebook_id before deleting
    const page = await db.prepare('SELECT notebook_id FROM pages WHERE id = ?').bind(pageId).first();
    
    await db.prepare('DELETE FROM pages WHERE id = ?').bind(pageId).run();
    
    // Update notebook page count
    if (page) {
      await db.prepare(
        `UPDATE notebooks SET page_count = page_count - 1, updated_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), page.notebook_id).run();
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function reorderPages(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { pages } = body;
    
    if (!Array.isArray(pages)) {
      return new Response(JSON.stringify({ error: 'Invalid pages array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    
    for (const { page_id, new_position } of pages) {
      await db.prepare(
        `UPDATE pages SET order_position = ?, updated_at = ?  
         WHERE id = ?`
      ).bind(new_position, new Date().toISOString(), page_id).run();
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Page element functions
async function getPageElements(env, corsHeaders) {
  try {
    const db = env.DB;
    const elements = await db.prepare(
      `SELECT * FROM page_elements ORDER BY page_id, order_position ASC`
    ).all();
    
    return new Response(JSON.stringify(elements.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function getPageElementsByPage(env, pageId, corsHeaders) {
  try {
    if (!pageId) {
      return new Response(JSON.stringify({ error: 'Page ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const elements = await db.prepare(
      `SELECT * FROM page_elements WHERE page_id = ? ORDER BY order_position ASC`
    ).bind(pageId).all();
    
    return new Response(JSON.stringify(elements.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function addPageElement(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const errors = validatePageElement(body);
    
    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: errors.join(', ') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const {
      page_id,
      element_type,
      order_position,
      question_text,
      required,
      field_type,
      field_height,
      max_characters,
      min_value,
      max_value,
      placeholder_text,
      validation_message,
      help_text,
      image_label,
      image_description,
      max_file_size_mb,
      allowed_formats,
      text_content,
      text_style,
      text_color,
      text_alignment
    } = body;
    
    const db = env.DB;
    const elementId = generateUUID();
    
    await db.prepare(
      `INSERT INTO page_elements 
       (id, page_id, element_type, order_position,  
        question_text, required, field_type, field_height, 
        max_characters, min_value, max_value, placeholder_text, 
        validation_message, help_text, image_label, image_description, 
        max_file_size_mb, allowed_formats, text_content, text_style, 
        text_color, text_alignment, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      elementId, page_id, element_type, order_position,
      question_text, required ? 1 : 0, field_type, field_height,
      max_characters, min_value, max_value, placeholder_text,
      validation_message, help_text, image_label, image_description,
      max_file_size_mb, JSON.stringify(allowed_formats || []), text_content,
      text_style, text_color, text_alignment,
      new Date().toISOString(), new Date().toISOString()
    ).run();
    
    return new Response(JSON.stringify({ id: elementId, page_id }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function updatePageElement(request, env, elementId, corsHeaders) {
  try {
    const body = await request.json();
    const db = env.DB;
    
    const updateFields = [];
    const updateValues = [];
    
    if (body.question_text !== undefined) {
      updateFields.push('question_text = ?');
      updateValues.push(body.question_text);
    }
    if (body.required !== undefined) {
      updateFields.push('required = ?');
      updateValues.push(body.required ? 1 : 0);
    }
    if (body.field_type !== undefined) {
      updateFields.push('field_type = ?');
      updateValues.push(body.field_type);
    }
    if (body.placeholder_text !== undefined) {
      updateFields.push('placeholder_text = ?');
      updateValues.push(body.placeholder_text);
    }
    if (body.text_content !== undefined) {
      updateFields.push('text_content = ?');
      updateValues.push(body.text_content);
    }
    
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(elementId);
    
    await db.prepare(
      `UPDATE page_elements SET ${updateFields.join(', ')} WHERE id = ?`
    ).bind(...updateValues).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function deletePageElement(env, elementId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM page_elements WHERE id = ?').bind(elementId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Group functions
async function getGroups(env, corsHeaders) {
  try {
    const db = env.DB;
    const groups = await db.prepare(
      `SELECT * FROM groups ORDER BY created_at DESC`
    ).all();
    
    return new Response(JSON.stringify(groups.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function createGroup(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { name, notebook_id, description } = body;
    
    if (!name) {
      return new Response(JSON.stringify({ error: 'Group name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const groupId = generateUUID();
    
    await db.prepare(
      `INSERT INTO groups (id, name, notebook_id, description, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(groupId, name, notebook_id, description, new Date().toISOString(), new Date().toISOString()).run();
    
    return new Response(JSON.stringify({ id: groupId, name, notebook_id }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function getGroupUsers(env, groupId, corsHeaders) {
  try {
    const db = env.DB;
    const users = await db.prepare(
      `SELECT * FROM users WHERE group_id = ? ORDER BY first_name ASC`
    ).bind(groupId).all();
    
    return new Response(JSON.stringify(users.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// User functions
async function getUsers(env, corsHeaders) {
  try {
    const db = env.DB;
    const users = await db.prepare(
      `SELECT * FROM users ORDER BY first_name ASC`
    ).all();
    
    return new Response(JSON.stringify(users.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function createUser(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { first_name, full_name, email, group_id, notebook_id } = body;
    
    if (!first_name || !group_id || !notebook_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const userId = generateUUID();
    
    await db.prepare(
      `INSERT INTO users  
       (id, first_name, full_name, email, group_id, notebook_id,  
        status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      userId, first_name, full_name, email, group_id, notebook_id,
      'active', new Date().toISOString(), new Date().toISOString()
    ).run();
    
    // Update group user count
    await db.prepare(
      `UPDATE groups SET user_count = user_count + 1, updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), group_id).run();
    
    return new Response(JSON.stringify({ id: userId, first_name, full_name }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function assignPagesToUser(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { user_id, page_ids } = body;
    
    if (!user_id || !Array.isArray(page_ids)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    
    for (const page_id of page_ids) {
      const assignmentId = generateUUID();
      await db.prepare(
        `INSERT INTO page_assignments  
         (id, user_id, page_id, assigned_date, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        assignmentId, user_id, page_id, new Date().toISOString(),
        'assigned', new Date().toISOString(), new Date().toISOString()
      ).run();
    }
    
    return new Response(JSON.stringify({ success: true, assigned_count: page_ids.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Schedule functions
async function getScheduleAssignments(env, corsHeaders) {
  try {
    const db = env.DB;
    const schedules = await db.prepare(
      `SELECT sa.*, u.first_name, u.full_name, p.title as page_title, p.page_number
       FROM schedule_assignments sa
       JOIN users u ON sa.user_id = u.id
       JOIN pages p ON sa.page_id = p.id
       ORDER BY sa.scheduled_date ASC`
    ).all();
    
    return new Response(JSON.stringify(schedules.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function createScheduleAssignment(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { user_id, page_id, scheduled_date } = body;
    
    if (!user_id || !page_id || !scheduled_date) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const scheduleId = generateUUID();
    
    await db.prepare(
      `INSERT INTO schedule_assignments  
       (id, user_id, page_id, scheduled_date, notification_sent, reminder_count, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      scheduleId, user_id, page_id, scheduled_date, 0, 0, 'pending',
      new Date().toISOString(), new Date().toISOString()
    ).run();
    
    return new Response(JSON.stringify({ id: scheduleId, user_id, page_id, scheduled_date }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function updateScheduleAssignment(request, env, scheduleId, corsHeaders) {
  try {
    const body = await request.json();
    const db = env.DB;
    
    const updateFields = [];
    const updateValues = [];
    
    if (body.scheduled_date !== undefined) {
      updateFields.push('scheduled_date = ?');
      updateValues.push(body.scheduled_date);
    }
    if (body.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(body.status);
    }
    if (body.notification_sent !== undefined) {
      updateFields.push('notification_sent = ?');
      updateValues.push(body.notification_sent ? 1 : 0);
    }
    if (body.reminder_count !== undefined) {
      updateFields.push('reminder_count = ?');
      updateValues.push(body.reminder_count);
    }
    
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(scheduleId);
    
    await db.prepare(
      `UPDATE schedule_assignments SET ${updateFields.join(', ')} WHERE id = ?`
    ).bind(...updateValues).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function deleteScheduleAssignment(env, scheduleId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM schedule_assignments WHERE id = ?').bind(scheduleId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Entry functions
async function getNotebookEntries(env, notebookId, corsHeaders) {
  try {
    const db = env.DB;
    const entries = await db.prepare(
      `SELECT  
       e.id, e.user_id, e.notebook_id, e.submission_date, 
       e.is_locked, u.first_name, u.full_name, 
       COUNT(DISTINCT er.id) as response_count 
     FROM entries e 
     JOIN users u ON e.user_id = u.id 
     LEFT JOIN entry_responses er ON e.id = er.entry_id 
     WHERE e.notebook_id = ? 
     GROUP BY e.id 
     ORDER BY e.submission_date DESC`
    ).bind(notebookId).all();
    
    return new Response(JSON.stringify(entries.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function getEntryDetails(request, env, entryId, corsHeaders) {
  try {
    const db = env.DB;
    
    const entry = await db.prepare(
      `SELECT * FROM entries WHERE id = ?`
    ).bind(entryId).first();
    
    if (!entry) {
      return new Response(JSON.stringify({ error: 'Entry not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const responses = await db.prepare(
      `SELECT * FROM entry_responses WHERE entry_id = ? 
       ORDER BY created_at ASC`
    ).bind(entryId).all();
    
    return new Response(JSON.stringify({
      ...entry,
      responses: responses.results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function unlockEntry(request, env, entryId, corsHeaders) {
  try {
    const body = await request.json();
    const { admin_user_id } = body;
    
    const db = env.DB;
    
    await db.prepare(
      `UPDATE entries  
       SET is_locked = 0, unlocked_by = ?, unlocked_at = ?,  
           submission_status = 'unlocked', updated_at = ? 
       WHERE id = ?`
    ).bind(admin_user_id, new Date().toISOString(), new Date().toISOString(), entryId).run();
    
    return new Response(JSON.stringify({ success: true, entry_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function deleteEntry(env, entryId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM entries WHERE id = ?').bind(entryId).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Statistics
async function getStatistics(env, corsHeaders) {
  try {
    const db = env.DB;
    
    const totalEntries = await db.prepare(
      `SELECT COUNT(*) as count FROM entries`
    ).first();
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const entriesThisWeek = await db.prepare(
      `SELECT COUNT(*) as count FROM entries WHERE submission_date >= ?`
    ).bind(weekAgo.toISOString()).first();
    
    const pendingEntries = await db.prepare(
      `SELECT COUNT(*) as count FROM schedule_assignments WHERE status = 'pending'`
    ).first();
    
    return new Response(JSON.stringify({
      total_entries: totalEntries.count,
      entries_this_week: entriesThisWeek.count,
      pending_entries: pendingEntries.count
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Initialize admin account
async function initializeAdminAccount(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { username, password, email } = body;
    
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Username and password required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    
    // Check if admin already exists
    const existingAdmin = await db.prepare(
      `SELECT COUNT(*) as count FROM admin_users`
    ).first();
    
    if (existingAdmin.count > 0) {
      return new Response(JSON.stringify({ error: 'Admin account already exists' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const adminId = generateUUID();
    
    await db.prepare(
      `INSERT INTO admin_users (id, username, password_hash, email, created_at, status) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(adminId, username, password, email, new Date().toISOString(), 'active').run();
    
    return new Response(JSON.stringify({ id: adminId, username, email }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// User routes
async function handleUserRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  if (pathParts[2] === 'pages' && request.method === 'GET' && pathParts.length === 4) {
    return getUserPage(request, env, pathParts[3], corsHeaders);
  }
  
  if (pathParts[2] === 'entries' && request.method === 'POST') {
    return submitEntry(request, env, corsHeaders);
  }
  
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

async function getUserPage(request, env, pageId, corsHeaders) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    
    // Verify page is assigned to user
    const assignment = await db.prepare(
      `SELECT * FROM page_assignments  
       WHERE user_id = ? AND page_id = ? AND status = 'assigned'`
    ).bind(userId, pageId).first();
    
    if (!assignment) {
      return new Response(JSON.stringify({ error: 'Page not assigned to user' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Get page details
    const page = await db.prepare(
      `SELECT * FROM pages WHERE id = ?`
    ).bind(pageId).first();
    
    if (!page) {
      return new Response(JSON.stringify({ error: 'Page not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Get elements for template pages
    let elements = [];
    if (page.page_type === 'template') {
      const result = await db.prepare(
        `SELECT * FROM page_elements WHERE page_id = ?  
         ORDER BY order_position ASC`
      ).bind(pageId).all();
      elements = result.results;
    }
    
    return new Response(JSON.stringify({
      ...page,
      elements
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function submitEntry(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const {
      user_id,
      notebook_id,
      page_id,
      responses,
      signature_data
    } = body;
    
    if (!user_id || !notebook_id || !page_id || !Array.isArray(responses)) {
      return new Response(JSON.stringify({ error: 'Invalid request data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    const entryId = generateUUID();
    
    // Create entry record
    await db.prepare(
      `INSERT INTO entries  
       (id, user_id, notebook_id, page_id, submission_date,  
        submission_status, is_locked, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      entryId, user_id, notebook_id, page_id,
      new Date().toISOString(), 'submitted', 1,
      new Date().toISOString(), new Date().toISOString()
    ).run();
    
    // Save all responses
    for (const response of responses) {
      const responseId = generateUUID();
      await db.prepare(
        `INSERT INTO entry_responses 
         (id, entry_id, page_element_id, response_type, 
          response_value, response_numeric, uploaded_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        responseId, entryId, response.element_id, response.type,
        response.value, response.numeric,
        new Date().toISOString()
      ).run();
    }
    
    // Save signature if provided
    if (signature_data) {
      const signatureId = generateUUID();
      await db.prepare(
        `INSERT INTO entry_responses 
         (id, entry_id, response_type, response_value, uploaded_at) 
         VALUES (?, ?, ?, ?, ?)`
      ).bind(signatureId, entryId, 'signature', signature_data, new Date().toISOString()).run();
    }
    
    // Update page assignment status
    await db.prepare(
      `UPDATE page_assignments SET status = 'completed', updated_at = ? 
       WHERE user_id = ? AND page_id = ?`
    ).bind(new Date().toISOString(), user_id, page_id).run();
    
    // Update schedule assignment if exists
    await db.prepare(
      `UPDATE schedule_assignments SET status = 'completed', updated_at = ? 
       WHERE user_id = ? AND page_id = ? AND scheduled_date <= ?`
    ).bind(new Date().toISOString(), user_id, page_id, new Date().toISOString().split('T')[0]).run();
    
    // Update user entry count
    await db.prepare(
      `UPDATE users SET entry_count = entry_count + 1, updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), user_id).run();
    
    // Update notebook entry count
    await db.prepare(
      `UPDATE notebooks SET entry_count = entry_count + 1, updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), notebook_id).run();
    
    return new Response(JSON.stringify({ id: entryId, status: 'submitted' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// File routes
async function handleFileRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  if (pathParts[2] === 'upload' && request.method === 'POST') {
    return uploadFile(request, env, corsHeaders);
  }
  
  if (pathParts.length === 3 && request.method === 'GET') {
    return downloadFile(env, pathParts[2], corsHeaders);
  }
  
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

async function uploadFile(request, env, corsHeaders) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder');
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const filename = `${folder}/${generateUUID()}_${file.name}`;
    const buffer = await file.arrayBuffer();
    
    // Upload to R2
    await env.BUCKET.put(filename, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });
    
    return new Response(JSON.stringify({ 
      file_id: filename, 
      url: `https://cdn.example.com/${filename}` 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function downloadFile(env, fileId, corsHeaders) {
  try {
    const object = await env.BUCKET.get(fileId);
    
    if (!object) {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
    
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileId.split('/').pop()}"`,
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// PDF routes
async function handlePdfRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  if (pathParts[2] === 'export' && request.method === 'POST') {
    return generatePdf(request, env, corsHeaders);
  }
  
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

async function generatePdf(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { entry_id, notebook_id, user_id } = body;
    
    const db = env.DB;
    
    // Get entry and all associated data
    const entry = await db.prepare(
      `SELECT * FROM entries WHERE id = ?`
    ).bind(entry_id).first();
    
    const user = await db.prepare(
      `SELECT * FROM users WHERE id = ?`
    ).bind(entry.user_id).first();
    
    const notebook = await db.prepare(
      `SELECT * FROM notebooks WHERE id = ?`
    ).bind(notebook_id).first();
    
    // Get all assigned pages
    const pages = await db.prepare(
      `SELECT p.* FROM pages p 
       JOIN page_assignments pa ON p.id = pa.page_id 
       WHERE pa.user_id = ? AND pa.status = 'completed' 
       ORDER BY p.page_number ASC`
    ).bind(user_id).all();
    
    // Get all responses
    const responses = await db.prepare(
      `SELECT * FROM entry_responses WHERE entry_id = ?`
    ).bind(entry_id).all();
    
    // Generate PDF using pdf-lib
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    
    // Add cover page
    const coverPage = pdfDoc.addPage([612, 792]); // Letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Cover title
    coverPage.drawText(notebook.cover_title || notebook.title, {
      x: 50,
      y: 700,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Cover subtitle
    if (notebook.cover_subtitle) {
      coverPage.drawText(notebook.cover_subtitle, {
        x: 50,
        y: 660,
        size: 16,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    // User info
    coverPage.drawText(`Submitted by: ${user.full_name || user.first_name}`, {
      x: 50,
      y: 600,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Date: ${new Date(entry.submission_date).toLocaleDateString()}`, {
      x: 50,
      y: 580,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Add content pages
    for (const page of pages.results) {
      const contentPage = pdfDoc.addPage([612, 792]);
      
      // Page title
      contentPage.drawText(`Page ${page.page_number}: ${page.title}`, {
        x: 50,
        y: 750,
        size: 18,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      if (page.page_type === 'content') {
        // Render content page text
        const text = page.content.replace(/<[^>]*>/g, ''); // Strip HTML
        const lines = text.match(/.{1,80}/g) || [];
        
        lines.forEach((line, index) => {
          contentPage.drawText(line, {
            x: 50,
            y: 700 - (index * 20),
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
          });
        });
      } else if (page.page_type === 'template') {
        // Get page elements
        const elements = await db.prepare(
          `SELECT * FROM page_elements WHERE page_id = ? ORDER BY order_position ASC`
        ).bind(page.id).all();
        
        let yPosition = 700;
        
        for (const element of elements.results) {
          if (element.element_type === 'question') {
            // Question text
            contentPage.drawText(element.question_text, {
              x: 50,
              y: yPosition,
              size: 12,
              font: boldFont,
              color: rgb(0, 0, 0),
            });
            
            // Find response
            const response = responses.results.find(
              r => r.page_element_id === element.id
            );
            
            if (response) {
              contentPage.drawText(`Answer: ${response.response_value || '(No answer)'}`, {
                x: 70,
                y: yPosition - 20,
                size: 11,
                font: font,
                color: rgb(0, 0, 0),
              });
              yPosition -= 40;
            } else {
              yPosition -= 25;
            }
          } else if (element.element_type === 'text') {
            contentPage.drawText(element.text_content, {
              x: 50,
              y: yPosition,
              size: 12,
              font: font,
              color: rgb(0, 0, 0),
            });
            yPosition -= 25;
          }
        }
      }
      
      // Signature section if required
      if (page.requires_signature) {
        const signature = responses.results.find(
          r => r.response_type === 'signature'
        );
        
        if (signature) {
          contentPage.drawText('Signed:', {
            x: 50,
            y: 100,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
          });
          
          // Draw signature line
          contentPage.drawLine({
            start: { x: 50, y: 90 },
            end: { x: 250, y: 90 },
            thickness: 1,
            color: rgb(0, 0, 0),
          });
        }
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    
    // Save to R2
    const filename = `exports/${entry_id}_${Date.now()}.pdf`;
    await env.BUCKET.put(filename, pdfBytes);
    
    return new Response(JSON.stringify({
      filename,
      url: `https://cdn.example.com/${filename}`,
      size: pdfBytes.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Email notification routes (Resend integration)
async function handleEmailRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  if (pathParts[2] === 'send' && request.method === 'POST') {
    return sendEmailNotification(request, env, corsHeaders);
  }
  
  if (pathParts[2] === 'reminders' && request.method === 'POST') {
    return processReminders(env, corsHeaders);
  }
  
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

async function sendEmailNotification(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { user_id, email_type, subject, body: emailBody } = body;
    
    if (!user_id || !email_type || !subject || !emailBody) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    const db = env.DB;
    
    // Get user details
    const user = await db.prepare(
      `SELECT * FROM users WHERE id = ?`
    ).bind(user_id).first();
    
    if (!user || !user.email) {
      return new Response(JSON.stringify({ error: 'User not found or no email' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@yourdomain.com',
        to: user.email,
        subject: subject,
        html: emailBody,
      }),
    });
    
    if (!resendResponse.ok) {
      const error = await resendResponse.json();
      throw new Error(error.message || 'Email send failed');
    }
    
    // Log email notification
    const notificationId = generateUUID();
    await db.prepare(
      `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(notificationId, user_id, email_type, subject, emailBody, new Date().toISOString(), 'sent').run();
    
    return new Response(JSON.stringify({ success: true, notification_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function processReminders(env, corsHeaders) {
  try {
    const db = env.DB;
    const today = new Date().toISOString().split('T')[0];
    
    // Get pending schedule assignments for today that haven't been notified
    const pendingAssignments = await db.prepare(
      `SELECT sa.*, u.email, u.first_name, p.title as page_title
       FROM schedule_assignments sa
       JOIN users u ON sa.user_id = u.id
       JOIN pages p ON sa.page_id = p.id
       WHERE sa.scheduled_date <= ? 
       AND sa.status = 'pending' 
       AND (sa.notification_sent = 0 OR sa.last_reminder_sent < ?)`
    ).bind(today, today).all();
    
    for (const assignment of pendingAssignments.results) {
      if (!assignment.email) continue;
      
      // Send reminder email
      const subject = `Reminder: Complete ${assignment.page_title}`;
      const body = `
        <h2>Hello ${assignment.first_name},</h2>
        <p>This is a reminder to complete your assigned page: <strong>${assignment.page_title}</strong></p>
        <p>Please log in to complete this task as soon as possible.</p>
        <p>Thank you!</p>
      `;
      
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'noreply@yourdomain.com',
            to: assignment.email,
            subject: subject,
            html: body,
          }),
        });
        
        if (resendResponse.ok) {
          // Update schedule assignment
          await db.prepare(
            `UPDATE schedule_assignments 
             SET notification_sent = 1, 
                 reminder_count = reminder_count + 1, 
                 last_reminder_sent = ?, 
                 updated_at = ? 
             WHERE id = ?`
          ).bind(new Date().toISOString(), new Date().toISOString(), assignment.id).run();
          
          // Log notification
          await db.prepare(
            `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            generateUUID(), assignment.user_id, 'reminder', subject, body, 
            new Date().toISOString(), 'sent'
          ).run();
        }
      } catch (error) {
        console.error('Failed to send reminder:', error);
      }
    }
    
    return new Response(JSON.stringify({ success: true, processed: pendingAssignments.results.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// Main Worker entry point
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    const corsHeaders = getCorsHeaders();
    
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Route based on path
      if (path.startsWith('/api/auth')) {
        return handleAuthRoutes(request, env, corsHeaders);
      } else if (path.startsWith('/api/admin')) {
        return handleAdminRoutes(request, env, corsHeaders);
      } else if (path.startsWith('/api/user')) {
        return handleUserRoutes(request, env, corsHeaders);
      } else if (path.startsWith('/api/files')) {
        return handleFileRoutes(request, env, corsHeaders);
      } else if (path.startsWith('/api/pdf')) {
        return handlePdfRoutes(request, env, corsHeaders);
      } else if (path.startsWith('/api/email')) {
        return handleEmailRoutes(request, env, corsHeaders);
      } else {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};