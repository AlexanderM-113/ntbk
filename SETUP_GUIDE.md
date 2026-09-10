# Notebook Writer - Complete Setup Guide

This guide will help you set up the entire Notebook Writer system using the Cloudflare web interface (no terminal/command line required).

## Table of Contents
1. [Cloudflare Account Setup](#cloudflare-account-setup)
2. [Cloudflare Workers Setup](#cloudflare-workers-setup)
3. [Cloudflare D1 Database Setup](#cloudflare-d1-database-setup)
4. [Cloudflare R2 Storage Setup](#cloudflare-r2-storage-setup)
5. [Cloudflare Pages Setup](#cloudflare-pages-setup)
6. [Resend Email Setup](#resend-email-setup)
7. [Final Configuration](#final-configuration)
8. [Testing Your System](#testing-your-system)

---

## Cloudflare Account Setup

### Step 1: Create a Cloudflare Account
1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Enter your email address and create a password
3. Verify your email address
4. Choose the free plan (it's sufficient for this project)

### Step 2: Verify Your Account
1. Check your email for the verification link
2. Click the link to verify your account
3. Log in to your Cloudflare dashboard

---

## Cloudflare Workers Setup

### Step 1: Navigate to Workers
1. In your Cloudflare dashboard, click on **Workers & Pages** in the left sidebar
2. Click on **Create Application**

### Step 2: Create a Worker
1. Click on **Create Worker**
2. Name your worker: `notebook-writer`
3. Click **Deploy**
4. Wait for the deployment to complete (this may take a minute)

### Step 3: Upload Your Worker Code
1. After deployment, click on **Edit Code**
2. Delete all the existing code in the editor
3. Copy the entire contents of `src/index.js` from your project
4. Paste it into the editor
5. Click **Deploy** to save your changes
6. Test the worker by visiting its URL - you should see a JSON response with API information

### Step 4: Get Your Worker URL
1. After deployment, you'll see your worker's URL
2. It will look like: `https://notebook-writer.YOUR-USERNAME.workers.dev`
3. Copy this URL - you'll need it later

---

## Cloudflare D1 Database Setup

### Step 1: Navigate to D1
1. In your Cloudflare dashboard, click on **Workers & Pages**
2. Click on the **D1** tab (usually in the sub-navigation)

### Step 2: Create a Database
1. Click on **Create database**
2. Name your database: `notebook-writer`
3. Click **Create**
4. Wait for the database to be created

### Step 3: Run Database Migrations
1. Click on your new database to open it
2. Click on the **Console** tab
3. Copy the entire contents of `migrations/001_create_initial_schema.sql`
4. Paste it into the console
5. Click **Execute** to run the migration
6. Wait for the migration to complete

### Step 4: Get Your Database ID
1. Click on the **Settings** tab of your database
2. Copy the **Database ID** - you'll need this for your worker configuration

---

## Cloudflare R2 Storage Setup

### Step 1: Navigate to R2
1. In your Cloudflare dashboard, click on **R2** in the left sidebar
2. If you don't see R2, you may need to enable it first (it's free)

### Step 2: Create a Bucket
1. Click on **Create bucket**
2. Name your bucket: `notebook-writer-storage`
3. Choose a location (select the one closest to your users)
4. Click **Create bucket**

### Step 3: Configure Bucket Settings
1. Click on your bucket to open it
2. Go to **Settings** tab
3. Ensure the bucket is set to public read access (if you want users to download files directly)
4. Or keep it private for more security

---

## Cloudflare Pages Setup

### Step 1: Navigate to Pages
1. In your Cloudflare dashboard, click on **Workers & Pages**
2. Click on the **Pages** tab

### Step 2: Create a Pages Project
1. Click on **Create a project**
2. Choose **Upload assets** (since we have static files)
3. Name your project: `notebook-writer-frontend`
4. Click **Create project**

### Step 3: Upload Your Frontend Files
1. You'll see an upload area
2. Upload all files from the `public` folder in your project:
   - `admin.html`
   - `user.html`
   - The entire `src` folder (including all CSS and JS files)
3. Click **Deploy Site**
4. Wait for the deployment to complete

### Step 4: Get Your Pages URL
1. After deployment, you'll see your site's URL
2. It will look like: `https://notebook-writer-frontend.pages.dev`
3. Copy this URL - this is where your admin and user interfaces will live

---

## Resend Email Setup

### Step 1: Create a Resend Account
1. Go to [https://resend.com/signup](https://resend.com/signup)
2. Sign up for a free account (includes 3,000 emails/month)
3. Verify your email address

### Step 2: Get Your API Key
1. Log in to your Resend dashboard
2. Click on **API Keys** in the left sidebar
3. Click on **Create API Key**
4. Name it: `Notebook Writer`
5. Copy the API key - you'll need this for your worker

### Step 3: Verify Your Domain (Optional but Recommended)
1. In Resend dashboard, click on **Domains**
2. Click on **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Follow the DNS verification steps
5. This allows you to send emails from your own domain

---

## Final Configuration

### Step 1: Configure Your Worker with D1 and R2
1. Go back to your Cloudflare Workers dashboard
2. Click on your `notebook-writer` worker
3. Click on **Settings** tab
4. Click on **Variables**
5. Click on **Edit bindings**

### Step 2: Add D1 Binding
1. Under **D1 Database Bindings**, click **Add binding**
2. Variable name: `DB`
3. Select your `notebook-writer` database
4. Click **Save**

### Step 3: Add R2 Binding
1. Under **R2 Bucket Bindings**, click **Add binding**
2. Variable name: `BUCKET`
3. Select your `notebook-writer-storage` bucket
4. Click **Save**

### Step 4: Add Resend API Key
1. Under **Environment Variables**, click **Add variable**
2. Variable name: `RESEND_API_KEY`
3. Value: Paste your Resend API key
4. Click **Save**

### Step 5: Update Your Frontend Configuration
1. Open `public/src/js/config.js` in your project
2. Replace the placeholder URL with your actual Worker URL:
   ```javascript
   const API_BASE_URL = 'https://notebook-writer.YOUR-USERNAME.workers.dev';
   ```
3. Save the file
4. Re-upload the updated file to Cloudflare Pages

### Step 6: Initialize Your Admin Account
1. Open your admin interface: `https://notebook-writer-frontend.pages.dev/admin.html`
2. You should see a login screen
3. Since this is the first time, you need to initialize the admin account
4. Open your browser's developer console (F12)
5. Run this JavaScript command:
   ```javascript
   fetch('https://notebook-writer.YOUR-USERNAME.workers.dev/api/admin/initialize', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       username: 'admin',
       password: 'your-secure-password',
       email: 'your-email@example.com'
     })
   })
   ```
6. Replace the username, password, and email with your preferred values
7. You can now log in with these credentials

---

## Testing Your System

### Step 1: Test Admin Login
1. Go to your admin interface
2. Log in with the credentials you just created
3. You should see the dashboard

### Step 2: Create Your First Notebook
1. Click on **Notebooks** in the navigation
2. Click **Create New Notebook**
3. Fill in the notebook details
4. Click **Save**

### Step 3: Create a Group
1. Click on **Groups & Users** in the navigation
2. Click **Create Group**
3. Name it (e.g., "Team A")
4. Click **Save**

### Step 4: Add a User
1. In the Groups & Users section
2. Click **Add User**
3. Fill in the user details:
   - First name: "John"
   - Full name: "John Smith"
   - Email: "john@example.com"
   - Select the group you created
   - Select the notebook you created
4. Click **Save**

### Step 5: Test User Login
1. Open a new browser tab
2. Go to your user interface: `https://notebook-writer-frontend.pages.dev/user.html`
3. Enter the first name of the user you created ("John")
4. You should see the user dashboard

### Step 6: Create a Page and Assign It
1. Go back to your admin interface
2. Click on **Notebooks**
3. Click **Edit** on your notebook
4. Click **Add Page**
5. Create a template page with some questions
6. Save the page
7. Go to the user's profile in Groups & Users
8. Assign the page to the user

### Step 7: Test User Page Completion
1. Go back to the user interface
2. The user should now see the assigned page
3. Click on the page to open it
4. Fill out the form
5. Sign the signature pad
6. Submit the page
7. You should see a success message

### Step 8: Test Email Notifications
1. In your admin interface, go to **Schedule**
2. Create a schedule assignment for a user
3. Click **Process Reminders**
4. Check if the user receives an email

---

## Troubleshooting

### Common Issues

**Issue: Worker returns 404 errors**
- Solution: Make sure your worker code is deployed and the URL is correct

**Issue: Database connection errors**
- Solution: Verify your D1 binding is configured correctly in worker settings

**Issue: File upload failures**
- Solution: Check that your R2 bucket binding is configured correctly

**Issue: Emails not sending**
- Solution: Verify your Resend API key is correct and you have credits available

**Issue: CORS errors**
- Solution: The worker code includes CORS headers, but make sure your frontend URL is correct

---

## Next Steps

Once everything is working:

1. **Customize your notebooks**: Create different pages and templates
2. **Set up scheduling**: Create schedule assignments for users
3. **Configure email reminders**: Set up automated reminder processing
4. **Customize the design**: Modify the CSS files to match your branding
5. **Add more users**: Import your team members into the system

---

## Security Recommendations

1. **Change default passwords**: Never use the default admin password
2. **Use HTTPS**: Cloudflare provides free SSL certificates
3. **Limit API access**: Only give necessary permissions
4. **Regular backups**: Export your D1 database regularly
5. **Monitor usage**: Keep an eye on your Cloudflare usage limits

---

## Support

If you encounter issues:
- Check the Cloudflare dashboard for error logs
- Review the browser console for JavaScript errors
- Verify all your bindings and API keys are correct
- Make sure your database migrations ran successfully

---

**Congratulations! Your Notebook Writer system is now set up and ready to use!**