/**
 * build.js - Compiles the Notebook Writer frontend into single-file HTML.
 * 
 * Reads public/admin.html and public/user.html, inlines every local
 * <link rel="stylesheet"> and <script src> reference, and writes
 * self-contained files to dist/.
 * 
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');

const PAGES = ['admin.html', 'user.html'];

function isExternal(src) {
  return /^(https?:)?\/\//.test(src) || src.startsWith('data:');
}

function inlineFile(htmlPath, filePath) {
  const resolved = path.resolve(path.dirname(htmlPath), filePath.split('?')[0]);
  return fs.readFileSync(resolved, 'utf8');
}

function inlineHtml(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Inline stylesheets
  html = html.replace(
    /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      if (isExternal(href)) return match;
      try {
        const css = inlineFile(htmlPath, href);
        return `<style>\n${css}\n</style>`;
      } catch (e) {
        console.warn(`  ! Could not inline CSS ${href}: ${e.message}`);
        return match;
      }
    }
  );

  // Inline scripts
  html = html.replace(
    /<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src) => {
      if (isExternal(src)) return match;
      try {
        const js = inlineFile(htmlPath, src);
        // Preserve type="module" if present
        const typeAttr = /type=["']module["']/i.test(match) ? ' type="module"' : '';
        return `<script${typeAttr}>\n${js}\n</script>`;
      } catch (e) {
        console.warn(`  ! Could not inline JS ${src}: ${e.message}`);
        return match;
      }
    }
  );

  return html;
}

// Main
if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`ERROR: ${PUBLIC_DIR} does not exist. Run this from the repo root (notebook-writer/).`);
  process.exit(1);
}

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

for (const page of PAGES) {
  const htmlPath = path.join(PUBLIC_DIR, page);
  if (!fs.existsSync(htmlPath)) {
    console.warn(`  ! ${page} not found, skipping.`);
    continue;
  }
  console.log(`Building ${page}...`);
  const output = inlineHtml(htmlPath);
  const outPath = path.join(DIST_DIR, page);
  fs.writeFileSync(outPath, output);
  console.log(`  ✓ ${outPath} (${(output.length / 1024).toFixed(1)} KB)`);
}

console.log('\nDone! Files are in dist/:');
console.log('  dist/admin.html');
console.log('  dist/user.html');