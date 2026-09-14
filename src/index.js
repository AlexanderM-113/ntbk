/**
 * Notebook Writer - Cloudflare Worker backend
 * Matches the frontend api-client.js endpoints exactly.
 *
 * Bucket bindings (5 R2 buckets):
 *   COVERS      -> notebook-covers
 *   BACKGROUNDS -> page-backgrounds
 *   ENTRY_IMAGES-> entry-images
 *   SIGNATURES  -> signatures
 *   EXPORTS     -> exports
 */

// ---------- Utility ----------

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Simple password hashing using Web Crypto API compatible approach
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function error(message, status = 400, corsHeaders) {
  return json({ error: message }, status, corsHeaders);
}

// Map a folder name (from the frontend uploadFile call) to an R2 binding.
function bucketForFolder(folder) {
  const f = (folder || '').toLowerCase();
  if (f.includes('cover')) return 'COVERS';
  if (f.includes('background')) return 'BACKGROUNDS';
  if (f.includes('signature')) return 'SIGNATURES';
  if (f.includes('export') || f.includes('pdf')) return 'EXPORTS';
  if (f.includes('entry') || f.includes('image')) return 'ENTRY_IMAGES';
  return 'ENTRY_IMAGES'; // default
}

function getBucket(env, folder) {
  const binding = bucketForFolder(folder);
  return env[binding] || env.ENTRY_IMAGES;
}

// ---------- Validation ----------

function validateNotebookInput(data) {
  const errors = [];
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Invalid notebook title');
  }
  if (data.title && data.title.length > 255) {
    errors.push('Notebook title too long (max 255 characters)');
  }
  if (data.title && !/^[a-zA-Z0-9\s\-_.,:]+$/.test(data.title)) {
    errors.push('Notebook title contains invalid characters');
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
    if (element.question_text && element.question_text.length > 1000) {
      errors.push('Question text too long (max 1000 characters)');
    }
    if (!['text', 'textarea', 'numeric'].includes(element.field_type)) {
      errors.push('Invalid field type');
    }
  }
  return errors;
}

function validateEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeString(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>]/g, '');
}

async function logAuditAction(db, actionType, performedBy, resourceType, resourceId, resourceName, details, ipAddress) {
  try {
    const auditId = generateUUID();
    await db
      .prepare(
        `INSERT INTO audit_log (id, action_type, performed_by, resource_type, resource_id, resource_name, timestamp, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        auditId,
        actionType,
        performedBy,
        resourceType,
        resourceId,
        resourceName,
        new Date().toISOString(),
        typeof details === 'object' ? JSON.stringify(details) : details,
        ipAddress
      )
      .run();
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ---------- Auth routes ----------

async function handleAuthRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    return handleUserLogin(request, env, corsHeaders);
  }

  if (url.pathname === '/api/auth/admin/login' && request.method === 'POST') {
    return handleAdminLogin(request, env, corsHeaders);
  }

  return error('Not Found', 404, corsHeaders);
}

async function handleUserLogin(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { first_name } = body;

    if (!first_name || first_name.trim() === '') {
      return error('First name required', 400, corsHeaders);
    }

    const db = env.DB;
    const user = await db
      .prepare(
        `SELECT * FROM users
         WHERE LOWER(first_name) = LOWER(?)
         AND status = 'active'
         LIMIT 1`
      )
      .bind(first_name)
      .first();

    if (!user) {
      return error('User not found', 404, corsHeaders);
    }

    await db
      .prepare(`UPDATE users SET last_login = ? WHERE id = ?`)
      .bind(new Date().toISOString(), user.id)
      .run();

    const assignedPages = await db
      .prepare(`SELECT page_id, status FROM page_assignments WHERE user_id = ?`)
      .bind(user.id)
      .all();

    return json(
      {
        user_id: user.id,
        first_name: user.first_name,
        full_name: user.full_name,
        notebook_id: user.notebook_id,
        group_id: user.group_id,
        assigned_pages: assignedPages.results.map((r) => ({
          page_id: r.page_id,
          status: r.status
        })),
      },
      200,
      corsHeaders
    );
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function handleAdminLogin(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return error('Username and password required', 400, corsHeaders);
    }

    const db = env.DB;
    const admin = await db
      .prepare(`SELECT * FROM admin_users WHERE username = ? AND status = 'active' LIMIT 1`)
      .bind(username)
      .first();

    if (!admin) {
      return error('Invalid credentials', 401, corsHeaders);
    }

    // Hash the provided password and compare with stored hash
    const passwordHash = await hashPassword(password);
    if (admin.password_hash !== passwordHash) {
      return error('Invalid credentials', 401, corsHeaders);
    }

    await db
      .prepare(`UPDATE admin_users SET last_login = ? WHERE id = ?`)
      .bind(new Date().toISOString(), admin.id)
      .run();

    return json(
      { admin_id: admin.id, username: admin.username, email: admin.email },
      200,
      corsHeaders
    );
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Admin routes ----------

async function handleAdminRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const method = request.method;
  // pathParts = ['api', 'admin', <resource>, ...]

  // /api/admin/initialize
  if (pathParts[2] === 'initialize' && method === 'POST') {
    return initializeAdminAccount(request, env, corsHeaders);
  }

  // /api/admin/statistics
  if (pathParts[2] === 'statistics' && method === 'GET') {
    return getStatistics(env, corsHeaders);
  }

  // /api/admin/notebooks[/:id[/publish|/entries]]
  if (pathParts[2] === 'notebooks') {
    if (method === 'GET' && pathParts.length === 3) {
      return getNotebooks(env, corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 3) {
      return createNotebook(request, env, corsHeaders);
    }
    if (method === 'PUT' && pathParts.length === 4) {
      return updateNotebook(request, env, pathParts[3], corsHeaders);
    }
    if (method === 'DELETE' && pathParts.length === 4) {
      return deleteNotebook(env, pathParts[3], corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 5 && pathParts[4] === 'publish') {
      return publishNotebook(env, pathParts[3], corsHeaders);
    }
    if (method === 'GET' && pathParts.length === 5 && pathParts[4] === 'entries') {
      return getNotebookEntries(env, pathParts[3], corsHeaders);
    }
  }

  // /api/admin/pages[/:id|/reorder]  (+ ?notebook_id=)
  if (pathParts[2] === 'pages') {
    if (method === 'GET' && pathParts.length === 3) {
      const notebookId = url.searchParams.get('notebook_id');
      if (notebookId) {
        return getPagesByNotebook(env, notebookId, corsHeaders);
      }
      return getPages(env, corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 3) {
      return createPage(request, env, corsHeaders);
    }
    if (method === 'PUT' && pathParts.length === 4) {
      return updatePage(request, env, pathParts[3], corsHeaders);
    }
    if (method === 'DELETE' && pathParts.length === 4) {
      return deletePage(env, pathParts[3], corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 4 && pathParts[3] === 'reorder') {
      return reorderPages(request, env, corsHeaders);
    }
  }

  // /api/admin/page-elements[/:id]  (+ ?page_id=)
  if (pathParts[2] === 'page-elements') {
    if (method === 'GET' && pathParts.length === 3) {
      const pageId = url.searchParams.get('page_id');
      if (pageId) {
        return getPageElementsByPage(env, pageId, corsHeaders);
      }
      return getPageElements(env, corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 3) {
      return addPageElement(request, env, corsHeaders);
    }
    if (method === 'PUT' && pathParts.length === 4) {
      return updatePageElement(request, env, pathParts[3], corsHeaders);
    }
    if (method === 'DELETE' && pathParts.length === 4) {
      return deletePageElement(env, pathParts[3], corsHeaders);
    }
  }

  // /api/admin/groups[/:id[/users]]
  if (pathParts[2] === 'groups') {
    if (method === 'GET' && pathParts.length === 3) {
      return getGroups(env, corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 3) {
      return createGroup(request, env, corsHeaders);
    }
    if (method === 'PUT' && pathParts.length === 4) {
      return updateGroup(request, env, pathParts[3], corsHeaders);
    }
    if (method === 'DELETE' && pathParts.length === 4) {
      return deleteGroup(env, pathParts[3], corsHeaders);
    }
    if (method === 'GET' && pathParts.length === 5 && pathParts[4] === 'users') {
      return getGroupUsers(env, pathParts[3], corsHeaders);
    }
  }

  // /api/admin/users[/assign-pages]
  if (pathParts[2] === 'users') {
    if (method === 'GET' && pathParts.length === 3) {
      return getUsers(env, corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 3) {
      return createUser(request, env, corsHeaders);
    }
    if (method === 'PUT' && pathParts.length === 4) {
      return updateUser(request, env, pathParts[3], corsHeaders);
    }
    if (method === 'DELETE' && pathParts.length === 4) {
      return deleteUser(env, pathParts[3], corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 4 && pathParts[3] === 'assign-pages') {
      return assignPagesToUser(request, env, corsHeaders);
    }
  }

  // /api/admin/schedule[/:id]
  if (pathParts[2] === 'schedule') {
    if (method === 'GET' && pathParts.length === 3) {
      return getScheduleAssignments(env, corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 3) {
      return createScheduleAssignment(request, env, corsHeaders);
    }
    if (method === 'PUT' && pathParts.length === 4) {
      return updateScheduleAssignment(request, env, pathParts[3], corsHeaders);
    }
    if (method === 'DELETE' && pathParts.length === 4) {
      return deleteScheduleAssignment(env, pathParts[3], corsHeaders);
    }
  }

  // /api/admin/entries[/:id[/unlock]]
  if (pathParts[2] === 'entries') {
    if (method === 'GET' && pathParts.length === 4) {
      return getEntryDetails(env, pathParts[3], corsHeaders);
    }
    if (method === 'POST' && pathParts.length === 5 && pathParts[4] === 'unlock') {
      return unlockEntry(request, env, pathParts[3], corsHeaders);
    }
    if (method === 'DELETE' && pathParts.length === 4) {
      return deleteEntry(env, pathParts[3], corsHeaders);
    }
  }

  // /api/admin/audit-log
  if (pathParts[2] === 'audit-log' && method === 'GET' && pathParts.length === 3) {
    return getAuditLog(env, corsHeaders);
  }

  return error('Not Found', 404, corsHeaders);
}

// ---------- Notebook functions ----------

async function getNotebooks(env, corsHeaders) {
  try {
    const db = env.DB;
    const notebooks = await db.prepare(`SELECT * FROM notebooks ORDER BY created_at DESC`).all();
    return json(notebooks.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function createNotebook(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const errors = validateNotebookInput(body);
    if (errors.length > 0) {
      return error(errors.join(', '), 400, corsHeaders);
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
      global_background_color,
    } = body;

    const db = env.DB;
    const notebookId = generateUUID();

    await db
      .prepare(
        `INSERT INTO notebooks
         (id, title, description, type, group_id, cover_title,
          cover_subtitle, cover_background_color, cover_text_color,
          global_font_family, global_text_color, global_background_color,
          status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        notebookId,
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
        global_background_color,
        'draft',
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    return json({ id: notebookId, title, status: 'draft' }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function updateNotebook(request, env, notebookId, corsHeaders) {
  try {
    const body = await request.json();
    const errors = validateNotebookInput(body);
    if (errors.length > 0) {
      return error(errors.join(', '), 400, corsHeaders);
    }

    const db = env.DB;
    const updateFields = [];
    const updateValues = [];

    const fieldMap = {
      title: 'title',
      description: 'description',
      cover_title: 'cover_title',
      cover_subtitle: 'cover_subtitle',
      cover_logo_id: 'cover_logo_id',
      cover_background_color: 'cover_background_color',
      cover_text_color: 'cover_text_color',
      global_font_family: 'global_font_family',
      global_text_color: 'global_text_color',
      global_background_color: 'global_background_color',
      toc_title: 'toc_title',
      toc_style: 'toc_style',
      include_toc_page_numbers: 'include_toc_page_numbers',
      pdf_paper_size: 'pdf_paper_size',
      pdf_orientation: 'pdf_orientation',
      pdf_margins_top: 'pdf_margins_top',
      pdf_margins_bottom: 'pdf_margins_bottom',
      pdf_margins_left: 'pdf_margins_left',
      pdf_margins_right: 'pdf_margins_right',
      status: 'status',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) {
        updateFields.push(`${col} = ?`);
        updateValues.push(body[key]);
      }
    }

    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(notebookId);

    await db
      .prepare(`UPDATE notebooks SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...updateValues)
      .run();

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function deleteNotebook(env, notebookId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM notebooks WHERE id = ?').bind(notebookId).run();
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function publishNotebook(env, notebookId, corsHeaders) {
  try {
    const db = env.DB;
    await db
      .prepare(`UPDATE notebooks SET status = 'published', updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), notebookId)
      .run();
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Page functions ----------

async function getPages(env, corsHeaders) {
  try {
    const db = env.DB;
    const pages = await db.prepare(`SELECT * FROM pages ORDER BY notebook_id, page_number ASC`).all();
    return json(pages.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function getPagesByNotebook(env, notebookId, corsHeaders) {
  try {
    if (!notebookId) {
      return error('Notebook ID required', 400, corsHeaders);
    }
    const db = env.DB;
    const pages = await db
      .prepare(`SELECT * FROM pages WHERE notebook_id = ? ORDER BY page_number ASC`)
      .bind(notebookId)
      .all();
    return json(pages.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function createPage(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { notebook_id, title, page_type, background_color, font_family, requires_signature, content } =
      body;

    if (!notebook_id || !title || !page_type) {
      return error('Missing required fields', 400, corsHeaders);
    }

    const db = env.DB;
    const pageId = generateUUID();

    const lastPage = await db
      .prepare(`SELECT MAX(page_number) as max_num FROM pages WHERE notebook_id = ? AND page_type != 'toc'`)
      .bind(notebook_id)
      .first();

    const pageNumber = (lastPage?.max_num || 0) + 1;

    await db
      .prepare(
        `INSERT INTO pages
         (id, notebook_id, page_number, title, page_type,
          background_color, font_family, requires_signature, content,
          order_position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        pageId,
        notebook_id,
        pageNumber,
        title,
        page_type,
        background_color,
        font_family,
        requires_signature ? 1 : 0,
        content,
        pageNumber,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    await db
      .prepare(`UPDATE notebooks SET page_count = page_count + 1, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), notebook_id)
      .run();

    return json({ id: pageId, page_number: pageNumber, title }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
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
    if (body.page_type !== undefined) {
      updateFields.push('page_type = ?');
      updateValues.push(body.page_type);
    }
    if (body.background_color !== undefined) {
      updateFields.push('background_color = ?');
      updateValues.push(body.background_color);
    }
    if (body.font_family !== undefined) {
      updateFields.push('font_family = ?');
      updateValues.push(body.font_family);
    }
    if (body.font_color !== undefined) {
      updateFields.push('font_color = ?');
      updateValues.push(body.font_color);
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

    await db
      .prepare(`UPDATE pages SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...updateValues)
      .run();

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function deletePage(env, pageId, corsHeaders) {
  try {
    const db = env.DB;
    const page = await db.prepare('SELECT notebook_id FROM pages WHERE id = ?').bind(pageId).first();

    await db.prepare('DELETE FROM pages WHERE id = ?').bind(pageId).run();

    if (page) {
      await db
        .prepare(`UPDATE notebooks SET page_count = page_count - 1, updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), page.notebook_id)
        .run();
    }

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function reorderPages(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { pages } = body;

    if (!Array.isArray(pages)) {
      return error('Invalid pages array', 400, corsHeaders);
    }

    const db = env.DB;

    for (const { page_id, new_position } of pages) {
      await db
        .prepare(`UPDATE pages SET order_position = ?, updated_at = ? WHERE id = ?`)
        .bind(new_position, new Date().toISOString(), page_id)
        .run();
    }

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Page element functions ----------

async function getPageElements(env, corsHeaders) {
  try {
    const db = env.DB;
    const elements = await db
      .prepare(`SELECT * FROM page_elements ORDER BY page_id, order_position ASC`)
      .all();
    return json(elements.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function getPageElementsByPage(env, pageId, corsHeaders) {
  try {
    if (!pageId) {
      return error('Page ID required', 400, corsHeaders);
    }
    const db = env.DB;
    const elements = await db
      .prepare(`SELECT * FROM page_elements WHERE page_id = ? ORDER BY order_position ASC`)
      .bind(pageId)
      .all();
    return json(elements.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function addPageElement(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const errors = validatePageElement(body);
    if (errors.length > 0) {
      return error(errors.join(', '), 400, corsHeaders);
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
      text_alignment,
    } = body;

    const db = env.DB;
    const elementId = generateUUID();

    await db
      .prepare(
        `INSERT INTO page_elements
         (id, page_id, element_type, order_position,
          question_text, required, field_type, field_height,
          max_characters, min_value, max_value, placeholder_text,
          validation_message, help_text, image_label, image_description,
          max_file_size_mb, allowed_formats, text_content, text_style,
          text_color, text_alignment, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        elementId,
        page_id,
        element_type,
        order_position,
        question_text,
        required ? 1 : 0,
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
        JSON.stringify(allowed_formats || []),
        text_content,
        text_style,
        text_color,
        text_alignment,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    return json({ id: elementId, page_id }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
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
    if (body.order_position !== undefined) {
      updateFields.push('order_position = ?');
      updateValues.push(body.order_position);
    }
    if (body.placeholder_text !== undefined) {
      updateFields.push('placeholder_text = ?');
      updateValues.push(body.placeholder_text);
    }
    if (body.help_text !== undefined) {
      updateFields.push('help_text = ?');
      updateValues.push(body.help_text);
    }
    if (body.field_height !== undefined) {
      updateFields.push('field_height = ?');
      updateValues.push(body.field_height);
    }
    if (body.max_characters !== undefined) {
      updateFields.push('max_characters = ?');
      updateValues.push(body.max_characters);
    }
    if (body.text_content !== undefined) {
      updateFields.push('text_content = ?');
      updateValues.push(body.text_content);
    }
    if (body.text_style !== undefined) {
      updateFields.push('text_style = ?');
      updateValues.push(body.text_style);
    }
    if (body.text_color !== undefined) {
      updateFields.push('text_color = ?');
      updateValues.push(body.text_color);
    }
    if (body.text_background_color !== undefined) {
      updateFields.push('text_background_color = ?');
      updateValues.push(body.text_background_color);
    }
    if (body.text_font_size !== undefined) {
      updateFields.push('text_font_size = ?');
      updateValues.push(body.text_font_size);
    }
    if (body.text_font_weight !== undefined) {
      updateFields.push('text_font_weight = ?');
      updateValues.push(body.text_font_weight);
    }
    if (body.text_alignment !== undefined) {
      updateFields.push('text_alignment = ?');
      updateValues.push(body.text_alignment);
    }
    if (body.field_background_color !== undefined) {
      updateFields.push('field_background_color = ?');
      updateValues.push(body.field_background_color);
    }
    if (body.field_text_color !== undefined) {
      updateFields.push('field_text_color = ?');
      updateValues.push(body.field_text_color);
    }
    if (body.field_font_size !== undefined) {
      updateFields.push('field_font_size = ?');
      updateValues.push(body.field_font_size);
    }
    if (body.image_background_color !== undefined) {
      updateFields.push('image_background_color = ?');
      updateValues.push(body.image_background_color);
    }
    if (body.image_border_color !== undefined) {
      updateFields.push('image_border_color = ?');
      updateValues.push(body.image_border_color);
    }
    if (body.image_label !== undefined) {
      updateFields.push('image_label = ?');
      updateValues.push(body.image_label);
    }
    if (body.max_file_size_mb !== undefined) {
      updateFields.push('max_file_size_mb = ?');
      updateValues.push(body.max_file_size_mb);
    }

    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(elementId);

    await db
      .prepare(`UPDATE page_elements SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...updateValues)
      .run();

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function deletePageElement(env, elementId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM page_elements WHERE id = ?').bind(elementId).run();
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Group functions ----------

async function getGroups(env, corsHeaders) {
  try {
    const db = env.DB;
    const groups = await db.prepare(`SELECT * FROM groups ORDER BY created_at DESC`).all();
    return json(groups.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function createGroup(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { name, notebook_id, description } = body;

    if (!name) {
      return error('Group name required', 400, corsHeaders);
    }

    const db = env.DB;
    const groupId = generateUUID();

    await db
      .prepare(
        `INSERT INTO groups (id, name, notebook_id, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(groupId, name, notebook_id, description, new Date().toISOString(), new Date().toISOString())
      .run();

    return json({ id: groupId, name, notebook_id }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function getGroupUsers(env, groupId, corsHeaders) {
  try {
    const db = env.DB;
    const users = await db
      .prepare(`SELECT * FROM users WHERE group_id = ? ORDER BY first_name ASC`)
      .bind(groupId)
      .all();
    return json(users.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function updateGroup(request, env, groupId, corsHeaders) {
  try {
    const body = await request.json();
    const { name, description, notebook_id } = body;

    if (!name) {
      return error('Group name required', 400, corsHeaders);
    }

    const db = env.DB;
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (notebook_id !== undefined) {
      updateFields.push('notebook_id = ?');
      updateValues.push(notebook_id);
    }

    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(groupId);

    await db
      .prepare(`UPDATE groups SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...updateValues)
      .run();

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function deleteGroup(env, groupId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- User functions ----------

async function getUsers(env, corsHeaders) {
  try {
    const db = env.DB;
    const users = await db.prepare(`SELECT * FROM users ORDER BY first_name ASC`).all();
    return json(users.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function createUser(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { first_name, full_name, email, group_id, notebook_id } = body;

    if (!first_name || !group_id || !notebook_id) {
      return error('Missing required fields', 400, corsHeaders);
    }

    // Validate first name
    if (first_name.length > 100) {
      return error('First name too long (max 100 characters)', 400, corsHeaders);
    }

    // Validate email if provided
    if (email && !validateEmail(email)) {
      return error('Invalid email format', 400, corsHeaders);
    }

    const db = env.DB;
    const userId = generateUUID();

    await db
      .prepare(
        `INSERT INTO users
         (id, first_name, full_name, email, group_id, notebook_id,
          status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        userId,
        first_name,
        full_name,
        email,
        group_id,
        notebook_id,
        'active',
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    await db
      .prepare(`UPDATE groups SET user_count = user_count + 1, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), group_id)
      .run();

    return json({ id: userId, first_name, full_name }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function assignPagesToUser(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { user_id, page_ids } = body;

    if (!user_id || !Array.isArray(page_ids)) {
      return error('Invalid request', 400, corsHeaders);
    }

    const db = env.DB;

    for (const page_id of page_ids) {
      const assignmentId = generateUUID();
      await db
        .prepare(
          `INSERT INTO page_assignments
           (id, user_id, page_id, assigned_date, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          assignmentId,
          user_id,
          page_id,
          new Date().toISOString(),
          'assigned',
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();
    }

    return json({ success: true, assigned_count: page_ids.length }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function updateUser(request, env, userId, corsHeaders) {
  try {
    const body = await request.json();
    const { first_name, full_name, email, group_id, notebook_id } = body;

    if (!first_name) {
      return error('First name required', 400, corsHeaders);
    }

    const db = env.DB;
    const updateFields = [];
    const updateValues = [];

    if (first_name !== undefined) {
      updateFields.push('first_name = ?');
      updateValues.push(first_name);
    }
    if (full_name !== undefined) {
      updateFields.push('full_name = ?');
      updateValues.push(full_name);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (group_id !== undefined) {
      updateFields.push('group_id = ?');
      updateValues.push(group_id);
    }
    if (notebook_id !== undefined) {
      updateFields.push('notebook_id = ?');
      updateValues.push(notebook_id);
    }

    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString());
    updateValues.push(userId);

    await db
      .prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...updateValues)
      .run();

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function deleteUser(env, userId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function getAuditLog(env, corsHeaders) {
  try {
    const db = env.DB;
    const auditLogs = await db
      .prepare(`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100`)
      .all();
    return json(auditLogs.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Schedule functions ----------

async function getScheduleAssignments(env, corsHeaders) {
  try {
    const db = env.DB;
    const schedules = await db
      .prepare(
        `SELECT sa.*, u.first_name, u.full_name, p.title as page_title, p.page_number
         FROM schedule_assignments sa
         JOIN users u ON sa.user_id = u.id
         JOIN pages p ON sa.page_id = p.id
         ORDER BY sa.scheduled_date ASC`
      )
      .all();
    return json(schedules.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function createScheduleAssignment(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { user_id, page_id, scheduled_date } = body;

    if (!user_id || !page_id || !scheduled_date) {
      return error('Missing required fields', 400, corsHeaders);
    }

    const db = env.DB;
    const scheduleId = generateUUID();

    await db
      .prepare(
        `INSERT INTO schedule_assignments
         (id, user_id, page_id, scheduled_date, notification_sent, reminder_count, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        scheduleId,
        user_id,
        page_id,
        scheduled_date,
        0,
        0,
        'pending',
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    return json({ id: scheduleId, user_id, page_id, scheduled_date }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
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

    await db
      .prepare(`UPDATE schedule_assignments SET ${updateFields.join(', ')} WHERE id = ?`)
      .bind(...updateValues)
      .run();

    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function deleteScheduleAssignment(env, scheduleId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM schedule_assignments WHERE id = ?').bind(scheduleId).run();
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Entry functions ----------

async function getNotebookEntries(env, notebookId, corsHeaders) {
  try {
    const db = env.DB;
    const entries = await db
      .prepare(
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
      )
      .bind(notebookId)
      .all();
    return json(entries.results, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function getEntryDetails(env, entryId, corsHeaders) {
  try {
    const db = env.DB;

    const entry = await db.prepare(`SELECT * FROM entries WHERE id = ?`).bind(entryId).first();

    if (!entry) {
      return error('Entry not found', 404, corsHeaders);
    }

    const responses = await db
      .prepare(`SELECT * FROM entry_responses WHERE entry_id = ? ORDER BY created_at ASC`)
      .bind(entryId)
      .all();

    return json({ ...entry, responses: responses.results }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function unlockEntry(request, env, entryId, corsHeaders) {
  try {
    const body = await request.json();
    const { admin_user_id } = body;

    const db = env.DB;

    await db
      .prepare(
        `UPDATE entries
         SET is_locked = 0, unlocked_by = ?, unlocked_at = ?,
             submission_status = 'unlocked', updated_at = ?
         WHERE id = ?`
      )
      .bind(admin_user_id, new Date().toISOString(), new Date().toISOString(), entryId)
      .run();

    return json({ success: true, entry_id: entryId }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function deleteEntry(env, entryId, corsHeaders) {
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM entries WHERE id = ?').bind(entryId).run();
    return json({ success: true }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Statistics ----------

async function getStatistics(env, corsHeaders) {
  try {
    const db = env.DB;

    const totalEntries = await db.prepare(`SELECT COUNT(*) as count FROM entries`).first();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const entriesThisWeek = await db
      .prepare(`SELECT COUNT(*) as count FROM entries WHERE submission_date >= ?`)
      .bind(weekAgo.toISOString())
      .first();

    const pendingEntries = await db
      .prepare(`SELECT COUNT(*) as count FROM schedule_assignments WHERE status = 'pending'`)
      .first();

    return json(
      {
        total_entries: totalEntries.count,
        entries_this_week: entriesThisWeek.count,
        pending_entries: pendingEntries.count,
      },
      200,
      corsHeaders
    );
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Initialize admin account ----------

async function initializeAdminAccount(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { username, password, email } = body;

    if (!username || !password) {
      return error('Username and password required', 400, corsHeaders);
    }

    const db = env.DB;

    const existingAdmin = await db.prepare(`SELECT COUNT(*) as count FROM admin_users`).first();

    if (existingAdmin.count > 0) {
      return error('Admin account already exists', 400, corsHeaders);
    }

    const adminId = generateUUID();
    const passwordHash = await hashPassword(password);

    await db
      .prepare(
        `INSERT INTO admin_users (id, username, password_hash, email, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(adminId, username, passwordHash, email, new Date().toISOString(), 'active')
      .run();

    return json({ id: adminId, username, email }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- User routes ----------

async function handleUserRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // /api/user/pages/:pageId?user_id=...
  if (pathParts[2] === 'pages' && request.method === 'GET' && pathParts.length === 4) {
    return getUserPage(request, env, pathParts[3], corsHeaders);
  }

  // /api/user/entries
  if (pathParts[2] === 'entries' && request.method === 'POST') {
    return submitEntry(request, env, corsHeaders);
  }

  return error('Not Found', 404, corsHeaders);
}

async function getUserPage(request, env, pageId, corsHeaders) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');

    if (!userId) {
      return error('User ID required', 400, corsHeaders);
    }

    const db = env.DB;

    const assignment = await db
      .prepare(
        `SELECT * FROM page_assignments
         WHERE user_id = ? AND page_id = ? AND status = 'assigned'`
      )
      .bind(userId, pageId)
      .first();

    if (!assignment) {
      return error('Page not assigned to user', 403, corsHeaders);
    }

    const page = await db.prepare(`SELECT * FROM pages WHERE id = ?`).bind(pageId).first();

    if (!page) {
      return error('Page not found', 404, corsHeaders);
    }

    let elements = [];
    if (page.page_type === 'template') {
      const result = await db
        .prepare(`SELECT * FROM page_elements WHERE page_id = ? ORDER BY order_position ASC`)
        .bind(pageId)
        .all();
      elements = result.results;
    }

    return json({ ...page, elements }, 200, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function submitEntry(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { user_id, notebook_id, page_id, responses, signature_data } = body;

    if (!user_id || !notebook_id || !page_id || !Array.isArray(responses)) {
      return error('Invalid request data', 400, corsHeaders);
    }

    const db = env.DB;
    const entryId = generateUUID();

    await db
      .prepare(
        `INSERT INTO entries
         (id, user_id, notebook_id, page_id, submission_date,
          submission_status, is_locked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entryId,
        user_id,
        notebook_id,
        page_id,
        new Date().toISOString(),
        'submitted',
        1,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    for (const response of responses) {
      const responseId = generateUUID();
      await db
        .prepare(
          `INSERT INTO entry_responses
           (id, entry_id, page_element_id, response_type,
            response_value, response_numeric, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          responseId,
          entryId,
          response.element_id,
          response.type,
          response.value,
          response.numeric,
          new Date().toISOString()
        )
        .run();
    }

    if (signature_data) {
      const signatureId = generateUUID();
      await db
        .prepare(
          `INSERT INTO entry_responses
           (id, entry_id, response_type, response_value, uploaded_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(signatureId, entryId, 'signature', signature_data, new Date().toISOString())
        .run();
    }

    await db
      .prepare(
        `UPDATE page_assignments SET status = 'completed', updated_at = ?
         WHERE user_id = ? AND page_id = ?`
      )
      .bind(new Date().toISOString(), user_id, page_id)
      .run();

    await db
      .prepare(
        `UPDATE schedule_assignments SET status = 'completed', updated_at = ?
         WHERE user_id = ? AND page_id = ? AND scheduled_date <= ?`
      )
      .bind(new Date().toISOString(), user_id, page_id, new Date().toISOString().split('T')[0])
      .run();

    await db
      .prepare(`UPDATE users SET entry_count = entry_count + 1, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), user_id)
      .run();

    await db
      .prepare(`UPDATE notebooks SET entry_count = entry_count + 1, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), notebook_id)
      .run();

    return json({ id: entryId, status: 'submitted' }, 201, corsHeaders);
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- File routes ----------

async function handleFileRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // /api/files/upload
  if (pathParts[2] === 'upload' && request.method === 'POST') {
    return uploadFile(request, env, corsHeaders);
  }

  // /api/files/:fileId
  if (pathParts.length === 3 && request.method === 'GET') {
    return downloadFile(env, pathParts[2], corsHeaders);
  }

  return error('Not Found', 404, corsHeaders);
}

async function uploadFile(request, env, corsHeaders) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder');

    if (!file) {
      return error('No file provided', 400, corsHeaders);
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return error('File size exceeds maximum limit of 10MB', 400, corsHeaders);
    }

    // Validate file type for images
    if (folder && (folder.includes('image') || folder.includes('entry') || folder.includes('signature'))) {
      if (!file.type.startsWith('image/')) {
        return error('Only image files are allowed', 400, corsHeaders);
      }
    }

    const filename = `${folder || 'images'}/${generateUUID()}_${file.name}`;
    const buffer = await file.arrayBuffer();

    const bucket = getBucket(env, folder);
    await bucket.put(filename, buffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    const origin = new URL(request.url).origin;
    return json(
      { file_id: filename, url: `${origin}/api/files/${encodeURIComponent(filename)}` },
      200,
      corsHeaders
    );
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

async function downloadFile(env, fileId, corsHeaders) {
  try {
    const folder = fileId.split('/')[0];
    const bucket = getBucket(env, folder);
    const object = await bucket.get(fileId);

    if (!object) {
      return error('Not Found', 404, corsHeaders);
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileId.split('/').pop()}"`,
        ...corsHeaders,
      },
    });
  } catch (err) {
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- PDF routes ----------

async function handlePdfRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // /api/pdf/export
  if (pathParts[2] === 'export' && request.method === 'POST') {
    return generatePdf(request, env, corsHeaders);
  }

  return error('Not Found', 404, corsHeaders);
}

async function generatePdf(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { entry_id, notebook_id, user_id } = body;

    if (!entry_id || !notebook_id || !user_id) {
      return error('Missing required parameters', 400, corsHeaders);
    }

    const db = env.DB;

    const entry = await db.prepare(`SELECT * FROM entries WHERE id = ?`).bind(entry_id).first();
    if (!entry) {
      return error('Entry not found', 404, corsHeaders);
    }

    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(entry.user_id).first();
    const notebook = await db.prepare(`SELECT * FROM notebooks WHERE id = ?`).bind(notebook_id).first();

    if (!user || !notebook) {
      return error('User or notebook not found', 404, corsHeaders);
    }

    const pages = await db
      .prepare(
        `SELECT p.* FROM pages p
         JOIN page_assignments pa ON p.id = pa.page_id
         WHERE pa.user_id = ? AND pa.status = 'completed'
         ORDER BY p.page_number ASC`
      )
      .bind(user_id)
      .all();

    const responses = await db
      .prepare(`SELECT * FROM entry_responses WHERE entry_id = ?`)
      .bind(entry_id)
      .all();

    // Generate PDF using pdf-lib
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const letterPageSize = [612, 792];

    const coverPage = pdfDoc.addPage(letterPageSize);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let coverLogo;
    if (notebook?.cover_logo_id) {
      try {
        const coversBucket = env.COVERS || env.ENTRY_IMAGES;
        const logoObject = await coversBucket.get(notebook.cover_logo_id);
        if (logoObject) {
          const logoBytes = await logoObject.arrayBuffer();
          const contentType = logoObject.httpMetadata?.contentType || '';
          coverLogo = contentType.includes('png')
            ? await pdfDoc.embedPng(logoBytes)
            : await pdfDoc.embedJpg(logoBytes);
        }
      } catch (logoError) {
        console.error('Cover logo embedding failed:', logoError);
      }
    }

    let titleY = 700;
    if (coverLogo) {
      const logoDimensions = coverLogo.scaleToFit(220, 140);
      coverPage.drawImage(coverLogo, {
        x: (612 - logoDimensions.width) / 2,
        y: 500,
        width: logoDimensions.width,
        height: logoDimensions.height,
      });
      titleY = 450;
    }

    coverPage.drawText(notebook?.cover_title || notebook?.title || 'Notebook', {
      x: 50,
      y: titleY,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    if (notebook?.cover_subtitle) {
      coverPage.drawText(notebook.cover_subtitle, {
        x: 50,
        y: titleY - 40,
        size: 16,
        font: font,
        color: rgb(0, 0, 0),
      });
    }

    coverPage.drawText(`Submitted by: ${user?.full_name || user?.first_name || ''}`, {
      x: 50,
      y: titleY - 100,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    });

    coverPage.drawText(`Date: ${new Date(entry.submission_date).toLocaleDateString()}`, {
      x: 50,
      y: titleY - 120,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    });

    for (const page of pages.results) {
      const contentPage = pdfDoc.addPage(letterPageSize);

      contentPage.drawText(`Page ${page.page_number}: ${page.title}`, {
        x: 50,
        y: 760,
        size: 18,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      contentPage.drawLine({
        start: { x: 50, y: 735 },
        end: { x: 562, y: 735 },
        thickness: 1,
        color: rgb(0.45, 0.45, 0.45),
      });

      if (page.page_type === 'content') {
        const text = (page.content || '').replace(/<[^>]*>/g, '');
        const lines = text.match(/.{1,80}/g) || [];

        lines.forEach((line, index) => {
          contentPage.drawText(line, {
            x: 50,
            y: 700 - index * 20,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
          });
        });
      } else if (page.page_type === 'template') {
        const elements = await db
          .prepare(`SELECT * FROM page_elements WHERE page_id = ? ORDER BY order_position ASC`)
          .bind(page.id)
          .all();

        let yPosition = 700;

        for (const element of elements.results) {
          if (element.element_type === 'question') {
            contentPage.drawText(element.question_text || '', {
              x: 50,
              y: yPosition,
              size: 12,
              font: boldFont,
              color: rgb(0, 0, 0),
            });

            const response = responses.results.find((r) => r.page_element_id === element.id);

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
            contentPage.drawText(element.text_content || '', {
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

      if (page.requires_signature) {
        const signature = responses.results.find((r) => r.response_type === 'signature');

        contentPage.drawText(signature ? 'Signed:' : 'Signature:', {
          x: 50,
          y: 100,
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });

        contentPage.drawLine({
          start: { x: 50, y: 88 },
          end: { x: 250, y: 88 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
      }

      contentPage.drawText(`Page ${page.page_number} | ${new Date().toLocaleDateString()}`, {
        x: 430,
        y: 40,
        size: 9,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });
    }

    const pdfBytes = await pdfDoc.save();

    const filename = `exports/${entry_id}_${Date.now()}.pdf`;
    const exportsBucket = env.EXPORTS || env.ENTRY_IMAGES;
    await exportsBucket.put(filename, pdfBytes);

    const origin = new URL(request.url).origin;
    return json(
      { filename, url: `${origin}/api/files/${encodeURIComponent(filename)}`, size: pdfBytes.length },
      200,
      corsHeaders
    );
  } catch (err) {
    console.error('PDF generation error:', err);
    return error(err.message || 'PDF generation failed', 500, corsHeaders);
  }
}

// ---------- Email routes (Resend) ----------

async function handleEmailRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // /api/email/send
  if (pathParts[2] === 'send' && request.method === 'POST') {
    return sendEmailNotification(request, env, corsHeaders);
  }

  // /api/email/reminders
  if (pathParts[2] === 'reminders' && request.method === 'POST') {
    return processReminders(env, corsHeaders);
  }

  return error('Not Found', 404, corsHeaders);
}

async function sendEmailNotification(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { user_id, email_type, subject, body: emailBody } = body;

    if (!user_id || !email_type || !subject || !emailBody) {
      return error('Missing required fields', 400, corsHeaders);
    }

    const db = env.DB;

    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(user_id).first();

    if (!user) {
      return error('User not found', 404, corsHeaders);
    }

    if (!user.email) {
      // Log notification attempt but don't fail
      const notificationId = generateUUID();
      await db
        .prepare(
          `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(notificationId, user_id, email_type, subject, emailBody, new Date().toISOString(), 'failed', 'User has no email address')
        .run();
      return json({ success: false, notification_id: notificationId, warning: 'User has no email address' }, 200, corsHeaders);
    }

    if (!env.RESEND_API_KEY) {
      // Log notification attempt but don't fail
      const notificationId = generateUUID();
      await db
        .prepare(
          `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(notificationId, user_id, email_type, subject, emailBody, new Date().toISOString(), 'failed', 'RESEND_API_KEY not configured')
        .run();
      return json({ success: false, notification_id: notificationId, warning: 'Email service not configured' }, 200, corsHeaders);
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'Notebook Writer <noreply@yourdomain.com>',
        to: user.email,
        subject,
        html: emailBody,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.json();
      const errorMessage = resendError.message || 'Email send failed';
      
      // Log failed attempt
      const notificationId = generateUUID();
      await db
        .prepare(
          `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(notificationId, user_id, email_type, subject, emailBody, new Date().toISOString(), 'failed', errorMessage)
        .run();
      
      throw new Error(errorMessage);
    }

    const notificationId = generateUUID();
    await db
      .prepare(
        `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(notificationId, user_id, email_type, subject, emailBody, new Date().toISOString(), 'sent')
      .run();

    return json({ success: true, notification_id: notificationId }, 200, corsHeaders);
  } catch (err) {
    console.error('Email notification error:', err);
    return error(err.message, 500, corsHeaders);
  }
}

async function processReminders(env, corsHeaders) {
  try {
    const db = env.DB;
    const today = new Date().toISOString().split('T')[0];

    const pendingAssignments = await db
      .prepare(
        `SELECT sa.*, u.email, u.first_name, p.title as page_title
         FROM schedule_assignments sa
         JOIN users u ON sa.user_id = u.id
         JOIN pages p ON sa.page_id = p.id
         WHERE sa.scheduled_date <= ?
         AND sa.status = 'pending'
         AND (sa.notification_sent = 0 OR sa.last_reminder_sent < ?)`
      )
      .bind(today, today)
      .all();

    if (!env.RESEND_API_KEY) {
      return json({ success: false, processed: 0, warning: 'Email service not configured' }, 200, corsHeaders);
    }

    let processed = 0;

    for (const assignment of pendingAssignments.results) {
      if (!assignment.email) {
        // Skip users without email
        continue;
      }

      const subject = `Reminder: Complete ${assignment.page_title}`;
      const htmlBody = `
        <h2>Hello ${assignment.first_name},</h2>
        <p>This is a reminder to complete your assigned page: <strong>${assignment.page_title}</strong></p>
        <p>Please log in to complete this task as soon as possible.</p>
        <p>Thank you!</p>
      `;

      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM || 'Notebook Writer <noreply@yourdomain.com>',
            to: assignment.email,
            subject,
            html: htmlBody,
          }),
        });

        if (resendResponse.ok) {
          await db
            .prepare(
              `UPDATE schedule_assignments
               SET notification_sent = 1,
                   reminder_count = reminder_count + 1,
                   last_reminder_sent = ?,
                   updated_at = ?
               WHERE id = ?`
            )
            .bind(new Date().toISOString(), new Date().toISOString(), assignment.id)
            .run();

          await db
            .prepare(
              `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              generateUUID(),
              assignment.user_id,
              'reminder',
              subject,
              htmlBody,
              new Date().toISOString(),
              'sent'
            )
            .run();

          processed++;
        } else {
          // Log failed reminder
          const resendError = await resendResponse.json();
          await db
            .prepare(
              `INSERT INTO email_notifications (id, user_id, email_type, subject, body, sent_at, status, error_message)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              generateUUID(),
              assignment.user_id,
              'reminder',
              subject,
              htmlBody,
              new Date().toISOString(),
              'failed',
              resendError.message || 'Email send failed'
            )
            .run();
        }
      } catch (e) {
        console.error('Reminder processing error:', e);
      }
    }

    return json({ success: true, processed }, 200, corsHeaders);
  } catch (err) {
    console.error('Process reminders error:', err);
    return error(err.message, 500, corsHeaders);
  }
}

// ---------- Main entry point ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = getCorsHeaders();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (path === '/' || path === '') {
        return json(
          {
            message: 'Notebook Writer API',
            version: '1.0.0',
            endpoints: {
              auth: '/api/auth/login',
              admin: '/api/admin/*',
              user: '/api/user/*',
              files: '/api/files/*',
              pdf: '/api/pdf/*',
              email: '/api/email/*',
            },
          },
          200,
          corsHeaders
        );
      } else if (path.startsWith('/api/auth')) {
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
      } else if (path.endsWith('.html')) {
        return json(
          {
            error: 'Static files should be served through Cloudflare Pages',
            message: 'Please deploy the frontend to Cloudflare Pages and access the HTML files there',
          },
          404,
          corsHeaders
        );
      } else {
        return error('Not Found', 404, corsHeaders);
      }
    } catch (err) {
      return error(err.message, 500, corsHeaders);
    }
  },
};