# Notebook Writer

A complete dual-interface system for managing customizable digital notebooks where admins create pages with two types: (1) Template pages with fillable fields that users complete and sign, and (2) Content pages with fixed admin-created content that users sign to acknowledge.

## Features

### Admin Features
- **Notebook Management**: Create and manage multiple independent notebooks
- **Page Editor**: Build template pages with questions, image uploads, text, dividers, and spacing
- **Content Pages**: Create fixed content pages for user acknowledgment
- **User Management**: Add users to groups and assign them to specific notebooks
- **Scheduling System**: Schedule page assignments for specific dates
- **Email Notifications**: Automatic email reminders via Resend integration
- **Entry Management**: View, unlock, and export user submissions as PDFs
- **Audit Logging**: Track all system activities

### User Features
- **Simple Login**: Login with first name only (no password required)
- **Dashboard**: View assigned pages and completion status
- **Form Completion**: Fill out template pages with various field types
- **Signature Capture**: Sign pages using a digital signature pad
- **Progress Tracking**: See completion status of all assigned pages

## Architecture

### Backend (Cloudflare Workers)
- **API Server**: RESTful API for all operations
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Email**: Resend integration for notifications
- **PDF Generation**: Server-side PDF creation with pdf-lib

### Frontend (Cloudflare Pages)
- **Admin Interface**: Full-featured admin dashboard
- **User Interface**: Simple, mobile-friendly user experience
- **Technologies**: HTML5, CSS3, Vanilla JavaScript
- **No Frameworks**: Lightweight and fast

## Project Structure

```
notebook-writer/
├── src/
│   └── index.js              # Cloudflare Worker (backend API)
├── public/
│   ├── admin.html            # Admin interface
│   ├── user.html             # User interface
│   └── src/
│       ├── css/
│       │   ├── common.css    # Shared styles
│       │   ├── admin.css     # Admin-specific styles
│       │   ├── user.css      # User-specific styles
│       │   └── responsive.css # Mobile responsive styles
│       └── js/
│           ├── config.js     # API configuration
│           ├── api-client.js # HTTP client
│           ├── admin/        # Admin functionality
│           │   ├── auth.js
│           │   ├── dashboard.js
│           │   ├── notebook-editor.js
│           │   ├── schedule-manager.js
│           │   ├── entries-manager.js
│           │   ├── group-manager.js
│           │   ├── audit-log.js
│           │   └── index.js
│           ├── user/         # User functionality
│           │   ├── login.js
│           │   ├── dashboard.js
│           │   ├── page-entry.js
│           │   ├── signature-pad.js
│           │   └── index.js
│           └── utils/        # Utility functions
│               ├── validation.js
│               ├── dom.js
│               └── storage.js
├── migrations/
│   └── 001_create_initial_schema.sql # Database schema
├── wrangler.toml            # Cloudflare configuration
├── package.json             # Node.js dependencies
├── SETUP_GUIDE.md           # Step-by-step setup instructions
└── README.md                # This file
```

## Key Concepts

### Two Independent Notebooks
- Each notebook is assigned to a different group
- Users in Notebook A work independently from users in Notebook B
- User data does NOT sync between notebooks
- Each user's submissions are isolated to their assigned notebook

### Page Types
1. **Template Pages**: Fillable form pages with questions, image uploads, text sections
2. **Content Pages**: Fixed admin-created content that users sign to acknowledge

### User Authentication
- No sign-up process
- Users type their **first name only** to "log in"
- Session stored in browser (localStorage)
- Backend validates user exists in group

### Scheduling System
- Admin can schedule page assignments for specific dates
- Automatic email notifications when assignments are created
- Daily reminder emails until task is completed
- Track assignment status (pending, completed, skipped)

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login by first name
- `POST /api/auth/admin/login` - Admin login

### Admin
- `GET /api/admin/notebooks` - Get all notebooks
- `POST /api/admin/notebooks` - Create notebook
- `PUT /api/admin/notebooks/:id` - Update notebook
- `DELETE /api/admin/notebooks/:id` - Delete notebook
- `GET /api/admin/pages` - Get all pages
- `GET /api/admin/pages?notebook_id=:id` - Get pages by notebook
- `POST /api/admin/pages` - Create page
- `PUT /api/admin/pages/:id` - Update page
- `DELETE /api/admin/pages/:id` - Delete page
- `POST /api/admin/pages/reorder` - Reorder pages
- `GET /api/admin/page-elements` - Get all page elements
- `POST /api/admin/page-elements` - Add page element
- `PUT /api/admin/page-elements/:id` - Update page element
- `DELETE /api/admin/page-elements/:id` - Delete page element
- `GET /api/admin/groups` - Get all groups
- `POST /api/admin/groups` - Create group
- `GET /api/admin/users` - Get all users
- `POST /api/admin/users` - Create user
- `POST /api/admin/users/assign-pages` - Assign pages to user
- `GET /api/admin/schedule` - Get schedule assignments
- `POST /api/admin/schedule` - Create schedule assignment
- `PUT /api/admin/schedule/:id` - Update schedule assignment
- `DELETE /api/admin/schedule/:id` - Delete schedule assignment
- `GET /api/admin/notebooks/:id/entries` - Get notebook entries
- `GET /api/admin/entries/:id` - Get entry details
- `POST /api/admin/entries/:id/unlock` - Unlock entry
- `DELETE /api/admin/entries/:id` - Delete entry
- `GET /api/admin/statistics` - Get system statistics

### User
- `GET /api/user/pages/:id?user_id=:id` - Get page details
- `POST /api/user/entries` - Submit page entry

### Files
- `POST /api/files/upload` - Upload file to R2
- `GET /api/files/:id` - Download file from R2

### PDF
- `POST /api/pdf/export` - Generate PDF export

### Email
- `POST /api/email/send` - Send email notification
- `POST /api/email/reminders` - Process pending reminders

## Database Schema

### Tables
- `notebooks` - Notebook definitions
- `groups` - User groups
- `users` - User accounts
- `admin_users` - Admin accounts (single admin)
- `pages` - Notebook pages
- `page_elements` - Form elements on template pages
- `page_assignments` - Pages assigned to users
- `schedule_assignments` - Scheduled page assignments
- `email_notifications` - Email notification log
- `entries` - User submissions
- `entry_responses` - Submitted field values
- `audit_log` - System activity tracking

## Setup Instructions

For detailed setup instructions using the Cloudflare web interface (no terminal required), see [SETUP_GUIDE.md](SETUP_GUIDE.md).

### Quick Setup Overview
1. Create Cloudflare account
2. Set up Cloudflare Worker with the backend code
3. Create D1 database and run migrations
4. Create R2 storage bucket
5. Deploy frontend to Cloudflare Pages
6. Set up Resend account for emails
7. Configure bindings and environment variables
8. Initialize admin account

## Security Features

- **Input Validation**: Server-side validation for all inputs
- **SQL Injection Prevention**: Parameterized queries via D1
- **XSS Prevention**: HTML sanitization for user content
- **CORS Configuration**: Proper CORS headers
- **Single Admin**: Only one admin account can exist
- **Session Management**: Browser-based session storage

## Performance Optimizations

- **Database Indexes**: Optimized queries with proper indexes
- **Lazy Loading**: Load data only when needed
- **Caching**: Browser caching for static assets
- **Pagination**: Large result sets are paginated
- **Async Operations**: Non-blocking API calls

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

This project is provided as-is for educational and commercial use.

## Support

For setup issues, refer to the [SETUP_GUIDE.md](SETUP_GUIDE.md) troubleshooting section.

## Contributing

This is a complete system ready for deployment. Future enhancements could include:
- Multi-language support
- Advanced reporting
- Integration with other services
- Enhanced security features
- Mobile app versions