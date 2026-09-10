-- Notebooks table
CREATE TABLE notebooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT,
  group_id TEXT,
  cover_logo_id TEXT,
  cover_title TEXT,
  cover_subtitle TEXT,
  cover_background_color TEXT DEFAULT '#FFFFFF',
  cover_text_color TEXT DEFAULT '#000000',
  global_font_family TEXT DEFAULT 'Arial',
  global_text_color TEXT DEFAULT '#000000',
  global_background_color TEXT DEFAULT '#FFFFFF',
  global_font_size INTEGER DEFAULT 16,
  toc_title TEXT DEFAULT 'Table of Contents',
  toc_style TEXT DEFAULT 'list',
  include_toc_page_numbers BOOLEAN DEFAULT 1,
  pdf_paper_size TEXT DEFAULT 'letter',
  pdf_orientation TEXT DEFAULT 'portrait',
  pdf_margins_top INTEGER DEFAULT 20,
  pdf_margins_bottom INTEGER DEFAULT 20,
  pdf_margins_left INTEGER DEFAULT 20,
  pdf_margins_right INTEGER DEFAULT 20,
  status TEXT DEFAULT 'draft',
  created_by TEXT,
  page_count INTEGER DEFAULT 0,
  entry_count INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- Groups table
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  notebook_id TEXT,
  description TEXT,
  user_count INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id)
);

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  group_id TEXT NOT NULL,
  notebook_id TEXT NOT NULL,
  last_login TEXT,
  entry_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id),
  UNIQUE(first_name, group_id)
);

-- Admin users table (single admin account)
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at TEXT,
  last_login TEXT,
  status TEXT DEFAULT 'active'
);

-- Pages table
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  page_type TEXT NOT NULL, -- 'template', 'content', 'toc'
  order_position INTEGER NOT NULL,
  background_color TEXT DEFAULT '#FFFFFF',
  background_image_id TEXT,
  font_family TEXT,
  font_size INTEGER,
  font_color TEXT,
  page_padding INTEGER DEFAULT 16,
  requires_signature BOOLEAN DEFAULT 1,
  content TEXT, -- for content pages (rich HTML)
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id),
  UNIQUE(notebook_id, page_number)
);

-- Page elements table (for template pages)
CREATE TABLE page_elements (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  element_type TEXT NOT NULL, -- 'question', 'image_upload', 'text', 'divider', 'spacing'
  order_position INTEGER NOT NULL,
  
  -- Question fields
  question_text TEXT,
  required BOOLEAN DEFAULT 1,
  field_type TEXT, -- 'text', 'textarea', 'numeric'
  field_height INTEGER,
  max_characters INTEGER,
  min_value REAL,
  max_value REAL,
  placeholder_text TEXT,
  validation_message TEXT,
  help_text TEXT,
  field_background_color TEXT,
  field_text_color TEXT,
  field_font_size INTEGER,
  
  -- Image fields
  image_label TEXT,
  image_description TEXT,
  image_required BOOLEAN DEFAULT 0,
  max_file_size_mb INTEGER,
  allowed_formats TEXT, -- JSON array
  image_box_height INTEGER,
  image_box_width INTEGER,
  image_border_color TEXT,
  image_background_color TEXT,
  
  -- Text fields
  text_content TEXT,
  text_style TEXT, -- 'paragraph', 'header_h1', 'header_h2', 'header_h3', 'instruction'
  text_color TEXT,
  text_background_color TEXT,
  text_font_size INTEGER,
  text_font_weight TEXT, -- 'normal', 'bold'
  text_alignment TEXT, -- 'left', 'center', 'right'
  
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

-- Page assignments table
CREATE TABLE page_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  assigned_date TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'assigned', -- 'assigned', 'completed', 'unlocked'
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE(user_id, page_id)
);

-- Schedule assignments table (for scheduling system)
CREATE TABLE schedule_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL, -- YYYY-MM-DD format
  notification_sent BOOLEAN DEFAULT 0,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_sent TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'skipped'
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE(user_id, page_id, scheduled_date)
);

-- Email notifications log
CREATE TABLE email_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email_type TEXT NOT NULL, -- 'assignment', 'reminder', 'completion'
  subject TEXT,
  body TEXT,
  sent_at TEXT,
  status TEXT DEFAULT 'sent', -- 'sent', 'failed'
  error_message TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Entries table
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notebook_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  group_id TEXT,
  submission_date TEXT NOT NULL,
  submission_day DATE,
  is_locked BOOLEAN DEFAULT 1,
  unlocked_by TEXT,
  unlocked_at TEXT,
  submission_status TEXT DEFAULT 'submitted', -- 'submitted', 'locked', 'unlocked'
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES pages(id),
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (unlocked_by) REFERENCES users(id)
);

-- Entry responses table
CREATE TABLE entry_responses (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  page_element_id TEXT,
  response_type TEXT NOT NULL, -- 'text', 'numeric', 'image', 'signature'
  response_value TEXT,
  response_numeric REAL,
  image_file_id TEXT,
  image_count INTEGER DEFAULT 0,
  image_file_ids TEXT, -- JSON array of file IDs
  signature_file_id TEXT,
  uploaded_at TEXT,
  edited_at TEXT,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (page_element_id) REFERENCES page_elements(id)
);

-- Audit log table
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  performed_by TEXT,
  resource_type TEXT,
  resource_id TEXT,
  resource_name TEXT,
  timestamp TEXT,
  details TEXT, -- JSON
  ip_address TEXT
);

-- Create indexes for performance
CREATE INDEX idx_notebooks_group_id ON notebooks(group_id);
CREATE INDEX idx_notebooks_status ON notebooks(status);
CREATE INDEX idx_users_group_id ON users(group_id);
CREATE INDEX idx_users_notebook_id ON users(notebook_id);
CREATE INDEX idx_users_first_name ON users(first_name);
CREATE INDEX idx_pages_notebook_id ON pages(notebook_id);
CREATE INDEX idx_page_elements_page_id ON page_elements(page_id);
CREATE INDEX idx_page_assignments_user_id ON page_assignments(user_id);
CREATE INDEX idx_page_assignments_page_id ON page_assignments(page_id);
CREATE INDEX idx_schedule_assignments_user_id ON schedule_assignments(user_id);
CREATE INDEX idx_schedule_assignments_scheduled_date ON schedule_assignments(scheduled_date);
CREATE INDEX idx_schedule_assignments_status ON schedule_assignments(status);
CREATE INDEX idx_entries_user_id ON entries(user_id);
CREATE INDEX idx_entries_notebook_id ON entries(notebook_id);
CREATE INDEX idx_entries_submission_date ON entries(submission_date);
CREATE INDEX idx_entry_responses_entry_id ON entry_responses(entry_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_email_notifications_user_id ON email_notifications(user_id);
CREATE INDEX idx_email_notifications_sent_at ON email_notifications(sent_at);