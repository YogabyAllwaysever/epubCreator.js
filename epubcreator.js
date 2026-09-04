#!/usr/bin/env node
/**
 * epubcreator.js — Node CLI untuk kompilasi direktori ke EPUB
 *
 * Versi: 3.0.0 (refaktor besar)
 *
 *  Copyright (C) 2026 YogabyAllwaysever.
 *
 * Cara pakai:
 *   node epubcreator.js createdir           → buat struktur direktori + download .epubcreator
 *   node epubcreator.js convertch           → ubah file .md menjadi .xhtml (default)
 *   node epubcreator.js convertch xhtml2md  → ubah file .xhtml menjadi .md
 *   node epubcreator.js convertch docx2md   → ubah file .docx menjadi .md (pecah berdasarkan ##)
 *   node epubcreator.js conv ...            → alias untuk convertch
 *   node epubcreator.js split <path>        → pecah file .md berdasarkan heading ##
 *   node epubcreator.js merge <path>        → gabungkan file .md menjadi satu (kebalikan split)
 *   node epubcreator.js build               → build EPUB dari direktori saat ini
 *   node epubcreator.js debug               → pantau perubahan di Markdowns/, auto convertch + build
 *   node epubcreator.js import              → impor file .epub dari direktori saat ini
 *   node epubcreator.js updatemodule        → download/update node_modules dari repo
 *   node epubcreator.js updatemodule --force→ update tanpa konfirmasi
 *   node epubcreator.js updateconfig        → download/update .epubcreator dari repo (branch config)
 *   node epubcreator.js settings            → ubah pengaturan tool (interaktif)
 *   node epubcreator.js validate            → validasi EPUB terakhir dengan epubcheck
 *   node epubcreator.js --version           → tampilkan versi
 *
 * Fitur ord.txt (opsional):
 *   - File di root buku, daftar urutan bab (satu baris satu nama file .xhtml)
 *   - Jika ada, urutan mengikuti daftar tersebut (file harus di root EPUB/)
 *   - Jika tidak ada, urutkan otomatis berdasarkan nama file (natural sort)
 */

const VERSION = '3.0.0';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');

// ─── Konfigurasi tool ──────────────────────────────────────────────────
const TOOL_DIR = '.epubcreator';
const SETTINGS_FILE = path.join(TOOL_DIR, 'settings.txt');
const LANG_DIR = path.join(TOOL_DIR, 'lang');

// ─── Pesan fallback hardcoded (hanya EN, sebagai last resort) ────────
const FALLBACK_MESSAGES = {
  // Pesan umum
  lang_changed: 'Language changed to {lang}.',
  lang_saved: 'Language saved to {file}.',
  missing_dep: '❌ Module "{mod}" (v{version}) not found. Install with:\n  npm install {mod}@{version}\n',
  marked_old: '❌ "marked" version is too old. Reinstall with:\n  npm install marked@4.0.0\n',
  cancelled: 'Cancelled.',
  file_exists: '{file} already exists. Overwrite? (y/n) ',
  overwritten: '{file} overwritten.',
  not_modified: '{file} unchanged.',
  created: '{file} created.',
  dir_created: 'Directory structure created at {dirs}',
  ready: '✅ Directory and template files ready.',

  // convertch (MD→XHTML)
  markdowns_not_found: 'Markdowns/ directory not found. Create with "node epubcreator.js createdir"',
  path_not_found: 'Path not found: {path}',
  must_be_md: 'File must have .md extension',
  no_md_found: 'No .md files found in that directory.',
  md_count: 'Found {count} .md files.',
  xhtml_exists: '{count} .xhtml files already exist. (Y) Overwrite all, (N) Copy all to Markdowns, (C) Cancel: ',
  convert_cancelled: 'Conversion cancelled.',
  copy_md: '📋 Copy {file} to {dest}',
  md_already_exists: 'ℹ️  {file} already exists in Markdowns, skipping copy.',
  copy_done: 'Done: {count} .md files copied to Markdowns/.',
  skip_file: 'Skipping {file}',
  convert_success: '✅ Successfully converted: {file}',
  convert_fail: 'Failed to parse Markdown {file}: {error}',
  convert_summary: 'Done: {success} out of {total} files converted successfully.',
  invalid_path: 'Path is not a valid file or directory.',
  xhtml_already_exists: '{file} already exists. (Y) Overwrite, (N) Copy to Markdowns, (C) Cancel: ',

  // convertch xhtml2md
  epub_not_found: 'EPUB/ directory not found.',
  must_be_xhtml: 'File must have .xhtml extension',
  skip_cover: 'Skipping {file} (excluded)',
  no_xhtml_found: 'No valid .xhtml files found in that directory.',
  xhtml_count: 'Found {count} .xhtml files.',
  convertx_success: '✅ Successfully converted: {file}',
  convertx_fail: 'Failed to convert {file}: {error}',
  convertx_summary: 'Done: {success} out of {total} files converted successfully.',

  // convertch docx2md
  docx_no_files: 'No .docx files found.',
  docx_processing: '📄 Processing: {file}',
  docx_no_images: 'ℹ️ Image extraction from DOCX not yet supported; images will be ignored.',
  docx_heading_mode_warn: '⚠️ Font size based heading mode is used (with configured thresholds).',
  docx_nosplit_mode: 'ℹ️ No-split mode (--nosplit) is active, all content will be merged into one file.',

  // split
  split_usage: 'node epubcreator.js split <path> [--output dir] [--force]',
  split_processing: 'Processing {file} ...',
  split_no_heading: 'No heading level 2 (##) found in {file}, entire content saved as one file.',
  split_parts: 'Split into {count} parts.',
  split_created: 'File created: {file}',
  split_summary: 'Done: {success} out of {total} files processed successfully.',
  split_output_dir: 'Output directory: {dir}',

  // merge
  merge_usage: 'node epubcreator.js merge <path> [--output file] [--force]',
  merge_no_files: 'No .md files found in {path}.',
  merge_processing: 'Merging {count} files ...',
  merge_created: 'Merged file created: {file}',
  merge_summary: '✅ {count} files successfully merged into {output}.',
  merge_output_file: 'Output: {file}',

  // build
  config_not_found: 'config.txt not found! Run: node epubcreator.js createdir',
  epub_dir_not_found: 'EPUB/ directory not found!',
  title_missing: 'config.txt must have "title"',
  author_missing: 'config.txt must have "author"',
  no_chapters: 'No chapters (.xhtml files) found in EPUB/ (excluding cover/toc/nav)',
  chapters_found: 'Found {count} chapters.',
  cover_missing: '⚠️  No cover.png found in EPUB/images/ — cover will be without image.',
  cover_found: 'Cover: {file}',
  media_summary: 'Images: {images} | Audio/Video: {audio}',
  epub_built: '✅ EPUB built successfully: {path} ({size} KB)',
  zip_error: 'Failed to create ZIP: {error}',
  warning_ord_not_found: 'Warning: file "{file}" in ord.txt not found in EPUB/',

  // import
  import_no_epub: 'No .epub file found in this directory.',
  import_select: 'Select EPUB file to import:',
  import_select_prompt: 'Enter number (1-{count}): ',
  import_invalid_choice: 'Invalid choice.',
  import_extracting: '📦 Extracting {file} ...',
  import_done: '✅ Import completed.',
  import_summary: '   Chapters: {chapters}, Images: {images}, Audio/Video: {audio}',
  import_hint: '💡 Run "node epubcreator.js convertch xhtml2md" to convert .xhtml to .md if needed.',
  import_skip_non_spine: 'Skipping non-chapter file: {file}',
  import_cover_found: 'Cover found: {file}',
  import_force_overwrite: 'Overwriting existing files (--force).',

  // updatemodule & updateconfig
  node_modules_missing: 'node_modules not found.',
  download_confirm: 'Download pre-built dependencies from repository? (y/n) ',
  extract_no_assets: '❌ Folder assets/node_modules not found in archive.',
  download_start: '📥 Downloading bundle ...',
  download_complete: '✅ Download complete. Extracting ...',
  download_failed: '❌ Failed to download bundle: {error}',
  extract_failed: '❌ Failed to extract node_modules: {error}',
  extract_success: '✅ node_modules extracted successfully.',
  tar_not_found: '❌ "tar" command not found. Please ensure tar is installed (Linux/macOS/Termux) or use Git Bash on Windows.',
  update_confirm: 'This will replace your existing node_modules folder. Continue? (y/n) ',
  update_force: 'Overwriting node_modules (--force).',

  // validate
  validate_no_epub: 'No .epub file found in builds/',
  validate_start: '🔍 Validating {file} ...',
  validate_ok: '✅ Validation passed for {file}',
  validate_fail: '❌ Validation failed:\n{output}',

  // debug
  debug_usage: 'node epubcreator.js debug  → Watch changes in Markdowns/, auto convertch + build',
  debug_start: 'Watching Markdowns/ for changes... Press Ctrl+C to stop.',
  debug_change: 'Changes detected, rebuilding...',
  debug_error: 'Error during rebuild: {error}',
  debug_watch_fallback: 'Warning: recursive watch not supported, watching root directory only (subdirectory changes may not trigger).',
  debug_watching_again: 'Watching again...',

  // settings command
  settings_title: '=== .epubcreator/settings.txt ===',
  settings_prompt: 'Press Enter to keep current value, or type new value. Type "save" to save, "cancel" to abort.',
  settings_saved: '✅ Settings saved to {file}.',
  settings_cancelled: 'Settings cancelled.',
  settings_invalid_value: 'Invalid value. Keeping previous.',

  // updateconfig
  updateconfig_confirm: 'This will replace your existing .epubcreator folder. Continue? (y/n) ',
  updateconfig_force: 'Overwriting .epubcreator (--force).',
  updateconfig_fetching: '📥 Downloading configuration bundle from config branch...',
  updateconfig_extracting: 'Extracting configuration...',
  updateconfig_success: '✅ .epubcreator updated successfully.',
  updateconfig_no_assets: '❌ Folder .epubcreator not found in archive.',
  updateconfig_failed: '❌ Failed to update config: {error}',

  // createdir
  createdir_update_config: 'Updating .epubcreator from config branch...',
  createdir_skip_update: 'Skipping .epubcreator update.',

  // command unknown
  unknown_command: 'Unknown command: {cmd}',
  usage_hint: 'Use: createdir | convertch | conv | split | merge | build | debug | import | updatemodule | updateconfig | settings | validate | --version',

  // Help
  help_title: '📚 epubcreator — CLI for compiling directory to EPUB  (v{version})',
  help_commands: `
  node epubcreator.js createdir           Create directory structure and download tool config
  node epubcreator.js convertch           Convert .md → .xhtml (default, looks in Markdowns/)
  node epubcreator.js convertch xhtml2md  Convert .xhtml → .md
  node epubcreator.js convertch docx2md   Convert .docx → .md (split by ##)
  node epubcreator.js conv ...            Alias for convertch
  node epubcreator.js split <path>        Split .md file by heading ##
  node epubcreator.js merge <path>        Merge .md files into one (reverse of split)
  node epubcreator.js build               Build EPUB from current directory
  node epubcreator.js debug               Watch changes in Markdowns/, auto convertch + build
  node epubcreator.js import              Import .epub file from current directory
  node epubcreator.js updatemodule        Download/update node_modules from repo
  node epubcreator.js updatemodule --force Update without confirmation
  node epubcreator.js updateconfig        Download/update .epubcreator from repo (config branch)
  node epubcreator.js settings            Interactive tool settings
  node epubcreator.js validate            Validate latest EPUB with epubcheck
  node epubcreator.js --version           Show version`,
  help_structure: `
Directory structure:
  ./
  ├── config.txt          ← book metadata (required)
  ├── ord.txt             ← chapter order list (optional)
  ├── Docs/               ← source .docx files (for docx2md)
  ├── Markdowns/          ← source .md files (for convertch)
  ├── node_modules/       ← dependencies (auto-downloaded via updatemodule)
  ├── .epubcreator/       ← tool settings and language files (auto-downloaded via createdir/updateconfig)
  │   ├── settings.txt
  │   └── lang/
  │       ├── en.txt
  │       └── id.txt
  ├── EPUB/
  │   ├── images/
  │   │   └── cover.png   ← REQUIRED
  │   ├── audiovideo/     ← optional
  │   ├── bab1.xhtml      ← chapters (any name, in EPUB/ root)
  │   └── ...
  └── builds/
      └── [folder-name].epub   ← build result`,
  help_deps: `
Note: make sure main dependencies are installed:
  npm install archiver@5.3.0 marked@4.0.0 turndown@7.2.4
For DOCX feature:  npm install mammoth@1.6.0 (optional)
For import feature: npm install adm-zip@0.5.10 xml2js@0.5.0 (optional)
For validation: install epubcheck (https://github.com/w3c/epubcheck)
  Or run "node epubcreator.js updatemodule" to download automatically.`,
};

// ─── Variabel global ──────────────────────────────────────────────────
let currentLang = 'en';
let messages = { ...FALLBACK_MESSAGES }; // akan ditimpa oleh file bahasa jika ada

// ─── Fungsi untuk memuat bahasa dari file ─────────────────────────────
function loadLanguageFile(lang) {
  const langFile = path.join(LANG_DIR, `${lang}.txt`);
  if (fs.existsSync(langFile)) {
    try {
      const content = fs.readFileSync(langFile, 'utf8');
      const lines = content.split('\n');
      const loaded = {};
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (key && value) {
          loaded[key] = value;
        }
      }
      // Timpa fallback dengan yang dimuat
      messages = { ...FALLBACK_MESSAGES, ...loaded };
    } catch (_) {
      // fallback tetap
    }
  } else {
    // Jika file tidak ada, gunakan fallback (sudah di-set)
  }
}

// ─── Fungsi untuk memuat settings ─────────────────────────────────────
function loadSettings() {
  const settingsPath = path.join(process.cwd(), SETTINGS_FILE);
  const defaults = {
    lang: 'en',
    watch_delay: '500',
    auto_build: 'false',
    overwrite_policy: 'ask',
  };
  if (!fs.existsSync(settingsPath)) {
    // Buat default settings
    ensureDir(TOOL_DIR);
    const content = Object.entries(defaults).map(([k, v]) => `${k} = ${v}`).join('\n');
    fs.writeFileSync(settingsPath, content, 'utf8');
    return defaults;
  }

  const content = fs.readFileSync(settingsPath, 'utf8');
  const lines = content.split('\n');
  const settings = { ...defaults };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && value) {
      settings[key] = value;
    }
  }
  return settings;
}

// ─── Fungsi terjemahan ─────────────────────────────────────────────────
function t(key, params = {}) {
  let str = messages[key] || FALLBACK_MESSAGES[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`{${k}}`, 'g'), v);
  }
  return str;
}

// ─── Log dengan terjemahan ────────────────────────────────────────────
function logI18n(key, params = {}, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  const msg = t(key, params);
  console.log(`${icons[type] || ''} ${msg}`);
}

// ─── Cek dependensi ──────────────────────────────────────────────────
function checkDependencies() {
  try {
    require.resolve('archiver');
  } catch (_) {
    console.error(t('missing_dep', { mod: 'archiver', version: '5.3.0' }));
    process.exit(1);
  }

  let marked;
  try {
    marked = require('marked');
    if (typeof marked.parse !== 'function') {
      console.error(t('marked_old'));
      process.exit(1);
    }
  } catch (_) {
    console.error(t('missing_dep', { mod: 'marked', version: '4.0.0' }));
    process.exit(1);
  }

  try {
    require('turndown');
  } catch (_) {
    console.error(t('missing_dep', { mod: 'turndown', version: '7.2.4' }));
    process.exit(1);
  }

  return {
    archiver: require('archiver'),
    marked: require('marked'),
    TurndownService: require('turndown'),
  };
}

// ─── Utilitas ──────────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function log(msg, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  console.log(`${icons[type] || ''} ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[m]));
}

function getEpubTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function extractTitleFromMd(content) {
  const match = content.match(/^##\s+(.+)$/m);
  if (match) return match[1].trim();
  return null;
}

function walkMdFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walkMdFiles(fullPath));
    } else if (stat.isFile() && fullPath.toLowerCase().endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function walkXhtmlFiles(dir) {
  const exclude = ['cover.xhtml', 'toc.xhtml', 'nav.xhtml'];
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walkXhtmlFiles(fullPath));
    } else if (stat.isFile() && fullPath.toLowerCase().endsWith('.xhtml')) {
      const base = path.basename(fullPath).toLowerCase();
      if (!exclude.includes(base)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function createXhtmlRenderer(marked) {
  const renderer = new marked.Renderer();
  renderer.image = function(href, title, text) {
    let out = `<img src="${href}" alt="${text}"`;
    if (title) out += ` title="${title}"`;
    out += ' />';
    return out;
  };
  renderer.br = function() { return '<br />'; };
  renderer.hr = function() { return '<hr />'; };
  return renderer;
}

function readDocxMapping() {
  const configPath = path.join(process.cwd(), 'config.txt');
  if (!fs.existsSync(configPath)) return null;

  const content = fs.readFileSync(configPath, 'utf8');
  const lines = content.split('\n');
  let inSection = false;
  const mapping = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inSection = (trimmed === '[docx-mapping]');
      continue;
    }
    if (inSection && trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key === 'heading1' || key === 'heading2' || key === 'heading3') {
          mapping[key] = parseFloat(val);
        }
      }
    }
  }

  return Object.keys(mapping).length > 0 ? mapping : null;
}

function adjustHeadings(html, mapping) {
  if (!mapping) {
    let modified = html;
    modified = modified.replace(/<p\s+class="heading1"[^>]*>([\s\S]*?)<\/p>/gi, '<h1>$1</h1>');
    modified = modified.replace(/<p\s+class="heading2"[^>]*>([\s\S]*?)<\/p>/gi, '<h2>$1</h2>');
    modified = modified.replace(/<p\s+class="heading3"[^>]*>([\s\S]*?)<\/p>/gi, '<h3>$1</h3>');
    return modified;
  }

  const thresholds = [
    { level: 1, size: mapping.heading1 || 24 },
    { level: 2, size: mapping.heading2 || 18 },
    { level: 3, size: mapping.heading3 || 14 }
  ].sort((a, b) => b.size - a.size);

  let useCheerio = false;
  try {
    require.resolve('cheerio');
    useCheerio = true;
  } catch (_) {}

  if (useCheerio) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html, { xmlMode: false });
    $('p').each((i, el) => {
      const style = $(el).attr('style');
      if (style) {
        const match = style.match(/font-size:\s*(\d+)pt/i);
        if (match) {
          const size = parseInt(match[1]);
          let level = 0;
          for (const th of thresholds) {
            if (size >= th.size) { level = th.level; break; }
          }
          if (level > 0) {
            const $el = $(el);
            const content = $el.html();
            const newTag = `<h${level}>${content}</h${level}>`;
            $el.replaceWith(newTag);
          }
        }
      }
    });
    return $.html();
  } else {
    const pRegex = /<p\s+([^>]*style="[^"]*font-size:(\d+)pt[^"]*"[^>]*)>([\s\S]*?)<\/p>/gi;
    let modified = html;
    modified = modified.replace(pRegex, (match, attrs, sizeStr, content) => {
      const size = parseInt(sizeStr);
      let level = 0;
      for (const th of thresholds) {
        if (size >= th.size) { level = th.level; break; }
      }
      if (level > 0) {
        return `<h${level}>${content}</h${level}>`;
      }
      return match;
    });
    if (!adjustHeadings._warned) {
      logI18n('docx_heading_mode_warn', {}, 'warn');
      adjustHeadings._warned = true;
    }
    return modified;
  }
}

// ─── Download & ekstrak (generik) ─────────────────────────────────────
function isTarAvailable() {
  try {
    execSync('tar --version', { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    request.end();
  });
}

function extractTarGz(tarballPath, destDir = '.', stripComponents = 0, srcPath = '') {
  return new Promise((resolve, reject) => {
    if (!isTarAvailable()) {
      reject(new Error(t('tar_not_found')));
      return;
    }

    let topFolder;
    try {
      const listOutput = execSync(`tar -tf "${tarballPath}" | head -1`, { encoding: 'utf8' });
      const firstLine = listOutput.trim();
      if (!firstLine) throw new Error('Archive is empty or invalid');
      topFolder = firstLine.split('/')[0];
      if (!topFolder) throw new Error('Cannot determine top-level folder');
    } catch (err) {
      reject(new Error(`Failed to list archive: ${err.message}`));
      return;
    }

    // Jika srcPath diberikan, cek keberadaannya
    if (srcPath) {
      const checkCmd = `tar -tf "${tarballPath}" | grep -q "^${topFolder}/${srcPath}"`;
      try {
        execSync(checkCmd, { stdio: 'ignore' });
      } catch (_) {
        reject(new Error(t('extract_no_assets')));
        return;
      }
      const fullSrc = `${topFolder}/${srcPath}`;
      const cmd = `tar -xzf "${tarballPath}" --strip-components=${stripComponents} -C "${destDir}" "${fullSrc}"`;
      try {
        execSync(cmd, { stdio: 'inherit' });
        resolve();
      } catch (err) {
        reject(err);
      }
    } else {
      // Ekstrak semua
      const cmd = `tar -xzf "${tarballPath}" --strip-components=${stripComponents} -C "${destDir}"`;
      try {
        execSync(cmd, { stdio: 'inherit' });
        resolve();
      } catch (err) {
        reject(err);
      }
    }
  });
}

async function downloadAndExtract(url, destDir, srcPath, stripComponents = 0) {
  const tarballPath = path.join(process.cwd(), 'bundle.tar.gz');
  try {
    logI18n('download_start', {}, 'info');
    await downloadFile(url, tarballPath);
    logI18n('download_complete', {}, 'success');
    await extractTarGz(tarballPath, destDir, stripComponents, srcPath);
  } catch (err) {
    throw err;
  } finally {
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  }
}

// ─── Command: createdir ────────────────────────────────────────────────
async function cmdCreateDir() {
  const cwd = process.cwd();

  // Buat struktur proyek
  const epubDir = path.join(cwd, 'EPUB');
  const imagesDir = path.join(epubDir, 'images');
  const audioDir = path.join(epubDir, 'audiovideo');
  const markdownsDir = path.join(cwd, 'Markdowns');
  const docsDir = path.join(cwd, 'Docs');
  const configPath = path.join(cwd, 'config.txt');
  const ordPath = path.join(cwd, 'ord.txt');

  ensureDir(epubDir);
  ensureDir(imagesDir);
  ensureDir(audioDir);
  ensureDir(markdownsDir);
  ensureDir(docsDir);

  const dirs = [epubDir, markdownsDir, docsDir].join(', ');
  logI18n('dir_created', { dirs }, 'info');

  // Buat config.txt template (jika belum ada)
  const configTemplate = `# ============================================================
#  METADATA BUKU  —  edit nilai di bawah ini sesuai kebutuhan
# ============================================================

# Judul utama (wajib)
title: Judul Buku

# Subjudul (opsional)
subtitle: Subjudul

# Volume / jilid (opsional)
volume: Vol. 1

# Penulis / creator (wajib)
author: Nama Penulis

# Bahasa (default: en)
language: en

# Identifier unik (URN atau ISBN), kosongkan untuk otomatis
identifier: 

# Tanggal terbit (YYYY-MM-DD), kosongkan pakai hari ini
date: 

# Penerbit (opsional)
publisher: 

# Deskripsi / sinopsis (opsional)
description: Deskripsi singkat buku ini.

# Subjek / kategori, pisahkan dengan koma
subjects: Fiksi, Petualangan

# Nama seri (opsional)
series_name: 

# Nomor seri (opsional)
series_number: 

# Kontributor tambahan: nama|peran, nama|peran, ...
# Peran: aut (penulis), edt (editor), ill (ilustrator), dll.
contributors: 

# Judul tambahan (opsional), pisahkan dengan koma
extra_titles: 

# ============================================================
#  KONVERSI DOCX → MARKDOWN (opsional)
# ============================================================
# [docx-mapping]
# Jika bagian ini ada, konversi akan menggunakan ukuran font (dalam pt)
# Jika tidak ada, akan menggunakan style Word (Heading 1, Heading 2, dll.)
# heading1 = 24
# heading2 = 18
# heading3 = 14

# ============================================================
#  STRUKTUR DIREKTORI YANG DIPERLUKAN SAAT BUILD:
#
#   ./
#   ├── config.txt
#   ├── ord.txt          ← opsional, daftar urutan bab (satu baris satu .xhtml)
#   ├── Docs/            ← tempat file .docx sumber (untuk docx2md)
#   ├── Markdowns/       ← tempat file .md sumber (untuk convertch)
#   └── EPUB/
#       ├── images/
#       │   └── cover.png   ← WAJIB ada
#       ├── audiovideo/     ← opsional
#       ├── bab1.xhtml      ← bab-bab (bisa nama apa saja, asal di root EPUB/)
#       ├── bab2.xhtml
#       └── ...
#
#  Jalankan:  node epubcreator.js build
# ============================================================
`;
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, configTemplate, 'utf8');
    logI18n('created', { file: 'config.txt' }, 'success');
  } else {
    // tanya timpa?
    const ans = await question(t('file_exists', { file: 'config.txt' }));
    if (ans.toLowerCase() === 'y') {
      fs.writeFileSync(configPath, configTemplate, 'utf8');
      logI18n('overwritten', { file: 'config.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'config.txt' }, 'warn');
    }
  }

  // Buat ord.txt template
  const ordTemplate = '# Daftar urutan bab (satu baris satu .xhtml)\n';
  if (!fs.existsSync(ordPath)) {
    fs.writeFileSync(ordPath, ordTemplate, 'utf8');
    logI18n('created', { file: 'ord.txt' }, 'success');
  } else {
    const ans = await question(t('file_exists', { file: 'ord.txt' }));
    if (ans.toLowerCase() === 'y') {
      fs.writeFileSync(ordPath, ordTemplate, 'utf8');
      logI18n('overwritten', { file: 'ord.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'ord.txt' }, 'warn');
    }
  }

  // ─── Download .epubcreator dari branch config ──────────────────────
  const epubCreatorDir = path.join(cwd, TOOL_DIR);
  if (fs.existsSync(epubCreatorDir)) {
    const ans = await question(`.epubcreator already exists. Update from config branch? (y/n) `);
    if (ans.toLowerCase() === 'y') {
      logI18n('createdir_update_config', {}, 'info');
      try {
        const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/config.tar.gz';
        await downloadAndExtract(url, cwd, '.epubcreator', 1); // strip 1 komponen
        logI18n('updateconfig_success', {}, 'success');
      } catch (err) {
        logI18n('updateconfig_failed', { error: err.message }, 'error');
      }
    } else {
      logI18n('createdir_skip_update', {}, 'warn');
    }
  } else {
    logI18n('createdir_update_config', {}, 'info');
    try {
      const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/config.tar.gz';
      await downloadAndExtract(url, cwd, '.epubcreator', 1);
      logI18n('updateconfig_success', {}, 'success');
    } catch (err) {
      logI18n('updateconfig_failed', { error: err.message }, 'error');
    }
  }

  // ─── Auto-fetch node_modules ──────────────────────────────────────
  const nodeModulesDir = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    logI18n('node_modules_missing', {}, 'warn');
    const ans = await question(t('download_confirm'));
    if (ans.toLowerCase() === 'y') {
      try {
        const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/main.tar.gz';
        await downloadAndExtract(url, cwd, 'assets/node_modules', 2);
        logI18n('extract_success', {}, 'success');
      } catch (err) {
        logI18n('extract_failed', { error: err.message }, 'error');
      }
    } else {
      logI18n('cancelled', {}, 'warn');
    }
  } else {
    log('ℹ️ node_modules already exists, skipping download.', 'info');
  }

  logI18n('ready', {}, 'success');
  rl.close();
}

// ─── Konversi MD→XHTML (satu file) ──────────────────────────────────
async function convertOneMdFile(mdFile, outputDir, force = false, marked) {
  const relPath = path.relative(process.cwd(), mdFile);
  const markdownsBase = path.join(process.cwd(), 'Markdowns');
  let relToMarkdowns = '';
  if (mdFile.startsWith(markdownsBase)) {
    relToMarkdowns = path.relative(markdownsBase, mdFile);
  } else {
    relToMarkdowns = path.relative(process.cwd(), mdFile);
  }
  const xhtmlFile = path.join(outputDir, relToMarkdowns.replace(/\.md$/i, '.xhtml'));
  const xhtmlDir = path.dirname(xhtmlFile);
  ensureDir(xhtmlDir);

  const xhtmlExists = fs.existsSync(xhtmlFile);
  if (!force && xhtmlExists) {
    const answer = await question(t('xhtml_already_exists', { file: path.basename(xhtmlFile) }));
    const choice = answer.toLowerCase();
    if (choice === 'c') {
      logI18n('skip_file', { file: path.basename(mdFile) }, 'warn');
      return false;
    } else if (choice === 'n') {
      const markdownsDest = path.join(process.cwd(), 'Markdowns', relToMarkdowns);
      ensureDir(path.dirname(markdownsDest));
      if (!fs.existsSync(markdownsDest)) {
        fs.copyFileSync(mdFile, markdownsDest);
        logI18n('copy_md', { file: path.basename(mdFile), dest: markdownsDest }, 'info');
      } else {
        logI18n('md_already_exists', { file: path.basename(mdFile) }, 'info');
      }
      return false;
    }
    // else: Y → lanjut timpa
  }

  const mdContent = fs.readFileSync(mdFile, 'utf8');
  let title = extractTitleFromMd(mdContent);
  if (!title) {
    title = path.basename(mdFile, '.md');
  }

  const renderer = createXhtmlRenderer(marked);
  let htmlContent;
  try {
    htmlContent = marked.parse(mdContent, { renderer });
  } catch (err) {
    logI18n('convert_fail', { file: path.basename(mdFile), error: err.message }, 'error');
    return false;
  }

  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(title)}</title>
</head>
<body>
  ${htmlContent}
</body>
</html>
`;

  fs.writeFileSync(xhtmlFile, xhtml, 'utf8');
  logI18n('convert_success', { file: xhtmlFile }, 'success');
  return true;
}

async function convertAllMd(markdownsDir, epubDir, force, marked) {
  const mdFiles = walkMdFiles(markdownsDir);
  if (mdFiles.length === 0) {
    logI18n('no_md_found', {}, 'warn');
    return 0;
  }
  let successCount = 0;
  for (const md of mdFiles) {
    const ok = await convertOneMdFile(md, epubDir, force, marked);
    if (ok) successCount++;
  }
  logI18n('convert_summary', { success: successCount, total: mdFiles.length }, 'info');
  return successCount;
}

async function cmdConvertCh(filePath, force = false, marked) {
  let target;
  if (!filePath) {
    target = path.join(process.cwd(), 'Markdowns');
    if (!fs.existsSync(target)) {
      logI18n('markdowns_not_found', {}, 'error');
      rl.close();
      return;
    }
  } else {
    target = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(target)) {
      logI18n('path_not_found', { path: target }, 'error');
      rl.close();
      return;
    }
  }

  const stat = fs.statSync(target);
  const outputDir = path.join(process.cwd(), 'EPUB');
  ensureDir(outputDir);

  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.md')) {
      logI18n('must_be_md', {}, 'error');
      rl.close();
      return;
    }
    await convertOneMdFile(target, outputDir, force, marked);
    rl.close();
    return;
  }

  if (stat.isDirectory()) {
    const mdFiles = walkMdFiles(target);
    if (mdFiles.length === 0) {
      logI18n('no_md_found', {}, 'warn');
      rl.close();
      return;
    }
    logI18n('md_count', { count: mdFiles.length }, 'info');

    let overwriteAll = force;
    const existing = mdFiles.filter(f => {
      const rel = path.relative(target, f);
      const xhtmlPath = path.join(outputDir, rel.replace(/\.md$/i, '.xhtml'));
      return fs.existsSync(xhtmlPath);
    });
    if (!force && existing.length > 0) {
      const answer = await question(t('xhtml_exists', { count: existing.length }));
      const choice = answer.toLowerCase();
      if (choice === 'c') {
        logI18n('convert_cancelled', {}, 'warn');
        rl.close();
        return;
      } else if (choice === 'n') {
        for (const md of mdFiles) {
          const rel = path.relative(target, md);
          const markdownsDest = path.join(process.cwd(), 'Markdowns', rel);
          ensureDir(path.dirname(markdownsDest));
          if (!fs.existsSync(markdownsDest)) {
            fs.copyFileSync(md, markdownsDest);
            logI18n('copy_md', { file: path.basename(md), dest: markdownsDest }, 'info');
          } else {
            logI18n('md_already_exists', { file: path.basename(md) }, 'info');
          }
        }
        logI18n('copy_done', { count: mdFiles.length }, 'info');
        rl.close();
        return;
      } else {
        overwriteAll = true;
      }
    }

    let successCount = 0;
    for (const md of mdFiles) {
      const ok = await convertOneMdFile(md, outputDir, overwriteAll, marked);
      if (ok) successCount++;
    }
    logI18n('convert_summary', { success: successCount, total: mdFiles.length }, 'info');

    // Auto-build jika settings mengizinkan
    const settings = loadSettings();
    if (settings.auto_build === 'true' && successCount > 0) {
      log('Auto-build enabled, building...', 'info');
      await buildEpub(require('archiver'));
    }

    rl.close();
    return;
  }

  logI18n('invalid_path', {}, 'error');
  rl.close();
}

// ─── XHTML→MD ─────────────────────────────────────────────────────────
function convertOneXhtmlFile(xhtmlFile, outputDir, TurndownService) {
  const epubBase = path.join(process.cwd(), 'EPUB');
  let relPath;
  if (xhtmlFile.startsWith(epubBase)) {
    relPath = path.relative(epubBase, xhtmlFile);
  } else {
    relPath = path.relative(process.cwd(), xhtmlFile);
  }
  const mdFile = path.join(outputDir, relPath.replace(/\.xhtml$/i, '.md'));
  ensureDir(path.dirname(mdFile));

  const xhtmlContent = fs.readFileSync(xhtmlFile, 'utf8');
  let title = '';
  const titleMatch = xhtmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  let bodyContent = '';
  const bodyMatch = xhtmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) bodyContent = bodyMatch[1].trim();

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  let markdown = turndownService.turndown(bodyContent);
  if (title) {
    markdown = `## ${title}\n\n${markdown}`;
  }

  fs.writeFileSync(mdFile, markdown, 'utf8');
  logI18n('convertx_success', { file: mdFile }, 'success');
  return true;
}

async function cmdConvertX(filePath, TurndownService) {
  let target;
  if (!filePath) {
    target = path.join(process.cwd(), 'EPUB');
    if (!fs.existsSync(target)) {
      logI18n('epub_not_found', {}, 'error');
      rl.close();
      return;
    }
  } else {
    target = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(target)) {
      logI18n('path_not_found', { path: target }, 'error');
      rl.close();
      return;
    }
  }

  const stat = fs.statSync(target);
  const outputDir = path.join(process.cwd(), 'Markdowns');
  ensureDir(outputDir);

  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.xhtml')) {
      logI18n('must_be_xhtml', {}, 'error');
      rl.close();
      return;
    }
    const base = path.basename(target).toLowerCase();
    if (['cover.xhtml', 'toc.xhtml', 'nav.xhtml'].includes(base)) {
      logI18n('skip_cover', { file: base }, 'warn');
      rl.close();
      return;
    }
    convertOneXhtmlFile(target, outputDir, TurndownService);
    rl.close();
    return;
  }

  if (stat.isDirectory()) {
    const xhtmlFiles = walkXhtmlFiles(target);
    if (xhtmlFiles.length === 0) {
      logI18n('no_xhtml_found', {}, 'warn');
      rl.close();
      return;
    }
    logI18n('xhtml_count', { count: xhtmlFiles.length }, 'info');

    let successCount = 0;
    for (const xf of xhtmlFiles) {
      try {
        convertOneXhtmlFile(xf, outputDir, TurndownService);
        successCount++;
      } catch (err) {
        logI18n('convertx_fail', { file: path.basename(xf), error: err.message }, 'error');
      }
    }
    logI18n('convertx_summary', { success: successCount, total: xhtmlFiles.length }, 'info');
    rl.close();
    return;
  }

  logI18n('invalid_path', {}, 'error');
  rl.close();
}

// ─── DOCX→MD ───────────────────────────────────────────────────────────
async function cmdDocxToMd(argv) {
  let input = './Docs';
  let output = './Markdowns/fromdocx';
  let force = false;
  let noImages = false;
  let nosplit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--no-images') noImages = true;
    else if (arg === '--nosplit' || arg === '-n') nosplit = true;
    else if (arg === '--output' && i + 1 < argv.length) {
      output = argv[i + 1];
      i++;
    } else if (!arg.startsWith('--')) {
      input = arg;
    }
  }

  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch (_) {
    logI18n('missing_dep', { mod: 'mammoth', version: '1.6.0' }, 'error');
    log('Install dengan: npm install mammoth@1.6.0', 'info');
    rl.close();
    return;
  }

  const mapping = readDocxMapping();

  const inputPath = path.resolve(process.cwd(), input);
  let docxFiles = [];
  if (fs.existsSync(inputPath)) {
    const stat = fs.statSync(inputPath);
    if (stat.isFile() && inputPath.toLowerCase().endsWith('.docx')) {
      docxFiles.push(inputPath);
    } else if (stat.isDirectory()) {
      const files = fs.readdirSync(inputPath);
      for (const f of files) {
        const full = path.join(inputPath, f);
        if (fs.statSync(full).isFile() && f.toLowerCase().endsWith('.docx')) {
          docxFiles.push(full);
        }
      }
    } else {
      logI18n('invalid_path', { path: inputPath }, 'error');
      rl.close();
      return;
    }
  } else {
    logI18n('path_not_found', { path: inputPath }, 'error');
    rl.close();
    return;
  }

  if (docxFiles.length === 0) {
    log(t('docx_no_files'), 'warn');
    rl.close();
    return;
  }

  if (nosplit) {
    logI18n('docx_nosplit_mode', {}, 'info');
  }

  const isMultiple = docxFiles.length > 1;
  for (const docxFile of docxFiles) {
    const baseName = path.basename(docxFile, '.docx');
    let outDir;
    if (isMultiple) {
      outDir = path.join(output, baseName);
    } else {
      outDir = output;
    }
    ensureDir(outDir);

    logI18n('docx_processing', { file: path.basename(docxFile) }, 'info');

    try {
      const result = await mammoth.convertToHtml({ path: docxFile });
      let html = result.value;

      const modifiedHtml = adjustHeadings(html, mapping);

      const TurndownService = require('turndown');
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
        strongDelimiter: '**',
      });
      let markdown = turndownService.turndown(modifiedHtml);

      const parts = markdown.split(/(?=^##\s+)/m).filter(p => p.trim() !== '');
      if (parts.length === 0) {
        parts.push(markdown);
      }

      if (nosplit) {
        const combined = parts.join('\n\n');
        const mdPath = path.join(outDir, `${baseName}.md`);
        if (fs.existsSync(mdPath) && !force) {
          const ans = await question(t('file_exists', { file: path.basename(mdPath) }));
          if (ans.toLowerCase() !== 'y') {
            logI18n('skip_file', { file: path.basename(mdPath) }, 'warn');
            continue;
          }
        }
        fs.writeFileSync(mdPath, combined, 'utf8');
        logI18n('created', { file: mdPath }, 'success');
      } else {
        for (let i = 0; i < parts.length; i++) {
          const content = parts[i];
          const num = i + 1;
          const mdPath = path.join(outDir, `p-${num}.md`);
          if (fs.existsSync(mdPath) && !force) {
            const ans = await question(t('file_exists', { file: path.basename(mdPath) }));
            if (ans.toLowerCase() !== 'y') {
              logI18n('skip_file', { file: path.basename(mdPath) }, 'warn');
              continue;
            }
          }
          fs.writeFileSync(mdPath, content, 'utf8');
          logI18n('created', { file: mdPath }, 'success');
        }
      }

      if (!noImages) {
        logI18n('docx_no_images', {}, 'warn');
      }
    } catch (err) {
      logI18n('convert_fail', { file: path.basename(docxFile), error: err.message }, 'error');
    }
  }

  log('✅ Selesai.', 'success');
  rl.close();
}

// ─── split ─────────────────────────────────────────────────────────────
async function cmdSplit(argv) {
  let inputPath = null;
  let outputDir = './Markdowns/split';
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--output' && i + 1 < argv.length) {
      outputDir = argv[i + 1];
      i++;
    } else if (!arg.startsWith('--')) {
      inputPath = arg;
    }
  }

  if (!inputPath) {
    log(t('split_usage'), 'error');
    rl.close();
    return;
  }

  const target = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(target)) {
    logI18n('path_not_found', { path: target }, 'error');
    rl.close();
    return;
  }

  const outDir = path.resolve(process.cwd(), outputDir);
  ensureDir(outDir);
  logI18n('split_output_dir', { dir: outDir }, 'info');

  const stat = fs.statSync(target);
  let mdFiles = [];
  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.md')) {
      logI18n('must_be_md', {}, 'error');
      rl.close();
      return;
    }
    mdFiles = [target];
  } else if (stat.isDirectory()) {
    mdFiles = walkMdFiles(target);
  } else {
    logI18n('invalid_path', {}, 'error');
    rl.close();
    return;
  }

  if (mdFiles.length === 0) {
    logI18n('no_md_found', {}, 'warn');
    rl.close();
    return;
  }

  let successCount = 0;
  for (const mdFile of mdFiles) {
    logI18n('split_processing', { file: path.basename(mdFile) }, 'info');

    try {
      const content = fs.readFileSync(mdFile, 'utf8');
      const parts = content.split(/(?=^##\s+)/m).filter(p => p.trim() !== '');
      let outFiles = [];

      if (parts.length === 0) {
        logI18n('split_no_heading', { file: path.basename(mdFile) }, 'warn');
        const baseName = path.basename(mdFile, '.md');
        const dest = path.join(outDir, `${baseName}.md`);
        if (fs.existsSync(dest) && !force) {
          const ans = await question(t('file_exists', { file: path.basename(dest) }));
          if (ans.toLowerCase() !== 'y') {
            logI18n('skip_file', { file: path.basename(dest) }, 'warn');
            continue;
          }
        }
        fs.writeFileSync(dest, content, 'utf8');
        logI18n('split_created', { file: dest }, 'success');
        outFiles.push(dest);
        successCount++;
      } else {
        const baseName = path.basename(mdFile, '.md');
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const num = i + 1;
          const dest = path.join(outDir, `${baseName}-p${num}.md`);
          if (fs.existsSync(dest) && !force) {
            const ans = await question(t('file_exists', { file: path.basename(dest) }));
            if (ans.toLowerCase() !== 'y') {
              logI18n('skip_file', { file: path.basename(dest) }, 'warn');
              continue;
            }
          }
          fs.writeFileSync(dest, part, 'utf8');
          logI18n('split_created', { file: dest }, 'success');
          outFiles.push(dest);
        }
        logI18n('split_parts', { count: parts.length }, 'info');
        successCount++;
      }
    } catch (err) {
      logI18n('convert_fail', { file: path.basename(mdFile), error: err.message }, 'error');
    }
  }

  logI18n('split_summary', { success: successCount, total: mdFiles.length }, 'info');
  rl.close();
}

// ─── merge ─────────────────────────────────────────────────────────────
async function cmdMerge(argv) {
  let inputPath = null;
  let outputFile = './merged.md';
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--output' && i + 1 < argv.length) {
      outputFile = argv[i + 1];
      i++;
    } else if (!arg.startsWith('--')) {
      inputPath = arg;
    }
  }

  if (!inputPath) {
    logI18n('merge_usage', {}, 'error');
    rl.close();
    return;
  }

  const target = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(target)) {
    logI18n('path_not_found', { path: target }, 'error');
    rl.close();
    return;
  }

  let mdFiles = [];
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.md')) {
      logI18n('must_be_md', {}, 'error');
      rl.close();
      return;
    }
    mdFiles = [target];
  } else if (stat.isDirectory()) {
    mdFiles = walkMdFiles(target);
  } else {
    logI18n('invalid_path', {}, 'error');
    rl.close();
    return;
  }

  if (mdFiles.length === 0) {
    logI18n('merge_no_files', { path: target }, 'warn');
    rl.close();
    return;
  }

  mdFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  logI18n('merge_processing', { count: mdFiles.length }, 'info');

  const outPath = path.resolve(process.cwd(), outputFile);
  if (fs.existsSync(outPath) && !force) {
    const ans = await question(t('file_exists', { file: path.basename(outPath) }));
    if (ans.toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      rl.close();
      return;
    }
  }

  let mergedContent = '';
  for (const file of mdFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (mergedContent) mergedContent += '\n\n';
    mergedContent += content;
  }

  fs.writeFileSync(outPath, mergedContent, 'utf8');
  logI18n('merge_created', { file: outPath }, 'success');
  logI18n('merge_summary', { count: mdFiles.length, output: path.basename(outPath) }, 'info');

  rl.close();
}

// ─── Build core ────────────────────────────────────────────────────────
async function buildEpub(archiver) {
  const cwd = process.cwd();
  const rootName = path.basename(cwd);

  const configPath = path.join(cwd, 'config.txt');
  if (!fs.existsSync(configPath)) {
    logI18n('config_not_found', {}, 'error');
    return;
  }

  const epubDir = path.join(cwd, 'EPUB');
  if (!fs.existsSync(epubDir)) {
    logI18n('epub_dir_not_found', {}, 'error');
    return;
  }

  const config = parseConfig(configPath);
  if (!config.title) {
    logI18n('title_missing', {}, 'error');
    return;
  }
  if (!config.author) {
    logI18n('author_missing', {}, 'error');
    return;
  }

  const ordPath = path.join(cwd, 'ord.txt');
  const chapters = collectChapters(epubDir, ordPath);
  if (chapters.length === 0) {
    logI18n('no_chapters', {}, 'error');
    return;
  }
  logI18n('chapters_found', { count: chapters.length }, 'info');

  const media = collectMedia(epubDir);
  if (!media.cover) {
    logI18n('cover_missing', {}, 'warn');
  } else {
    logI18n('cover_found', { file: media.cover }, 'info');
  }
  logI18n('media_summary', { images: media.images.length, audio: media.audio.length }, 'info');

  const buildsDir = path.join(cwd, 'builds');
  ensureDir(buildsDir);

  const epubFilename = `${rootName}.epub`;
  const epubPath = path.join(buildsDir, epubFilename);

  const opfContent = generateOpf(
    {
      mainTitle: config.title,
      subTitle: config.subtitle,
      volume: config.volume,
      creator: config.author,
      language: config.language,
      identifier: config.identifier,
      date: config.date,
      publisher: config.publisher,
      description: config.description,
      subjects: config.subjects,
      seriesName: config.series_name,
      seriesNumber: config.series_number,
      contributors: config.contributors,
      extraTitles: config.extra_titles,
    },
    chapters,
    media
  );

  const tocContent = generateToc(chapters);
  const coverContent = generateCoverXhtml(media.cover);
  const containerContent = generateContainer();

  const output = fs.createWriteStream(epubPath);
  const archive = archiver('zip', {
    zlib: { level: 6 },
  });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const size = (archive.pointer() / 1024).toFixed(1);
      logI18n('epub_built', { path: epubPath, size }, 'success');
      resolve();
    });

    archive.on('error', (err) => {
      logI18n('zip_error', { error: err.message }, 'error');
      reject(err);
    });

    archive.pipe(output);
    archive.append('application/epub+zip', { name: 'mimetype', store: true });
    archive.append(containerContent, { name: 'META-INF/container.xml' });
    archive.append(opfContent, { name: 'EPUB/volume.opf' });
    archive.append(tocContent, { name: 'EPUB/toc.xhtml' });
    archive.append(coverContent, { name: 'EPUB/cover.xhtml' });

    const excludeGenerated = ['cover.xhtml', 'toc.xhtml', 'volume.opf'];
    const allEpubFiles = fs.readdirSync(epubDir);
    for (const item of allEpubFiles) {
      const srcPath = path.join(epubDir, item);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) continue;
      if (excludeGenerated.includes(item)) continue;
      archive.file(srcPath, { name: `EPUB/${item}` });
    }

    const subdirs = ['images', 'audiovideo'];
    for (const sub of subdirs) {
      const subDir = path.join(epubDir, sub);
      if (fs.existsSync(subDir)) {
        const files = fs.readdirSync(subDir);
        for (const f of files) {
          const src = path.join(subDir, f);
          if (fs.statSync(src).isFile()) {
            archive.file(src, { name: `EPUB/${sub}/${f}` });
          }
        }
      }
    }

    for (const ch of chapters) {
      const src = path.join(epubDir, ch.path);
      if (fs.existsSync(src) && !allEpubFiles.includes(ch.path)) {
        archive.file(src, { name: `EPUB/${ch.path}` });
      }
    }

    archive.finalize();
  });
}

async function cmdBuild(archiver) {
  await buildEpub(archiver);
  rl.close();
}

// ─── Debug ─────────────────────────────────────────────────────────────
async function cmdDebug(archiver, marked) {
  const markdownsDir = path.join(process.cwd(), 'Markdowns');
  const epubDir = path.join(process.cwd(), 'EPUB');

  if (!fs.existsSync(markdownsDir)) {
    logI18n('markdowns_not_found', {}, 'error');
    rl.close();
    return;
  }
  if (!fs.existsSync(epubDir)) {
    logI18n('epub_dir_not_found', {}, 'error');
    rl.close();
    return;
  }

  logI18n('debug_start', {}, 'info');

  let debounceTimer = null;
  const settings = loadSettings();
  const debounceDelay = parseInt(settings.watch_delay) || 500;

  const onChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      logI18n('debug_change', {}, 'info');
      try {
        const count = await convertAllMd(markdownsDir, epubDir, true, marked);
        await buildEpub(archiver);
        logI18n('debug_watching_again', {}, 'info');
      } catch (err) {
        logI18n('debug_error', { error: err.message }, 'error');
      }
    }, debounceDelay);
  };

  let watcher;
  try {
    watcher = fs.watch(markdownsDir, { recursive: true }, (eventType, filename) => {
      if (filename && !filename.endsWith('.md')) return;
      onChange();
    });
  } catch (err) {
    logI18n('debug_watch_fallback', {}, 'warn');
    watcher = fs.watch(markdownsDir, (eventType, filename) => {
      if (filename && !filename.endsWith('.md')) return;
      onChange();
    });
  }

  const onExit = () => {
    if (watcher) watcher.close();
    rl.close();
    process.exit(0);
  };
  process.on('SIGINT', onExit);
}

// ─── Parsing config ────────────────────────────────────────────────────
function parseConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const lines = content.split('\n');
  const config = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    const commentIdx = value.indexOf('#');
    if (commentIdx > 0 && !value.includes('"') && !value.includes("'")) {
      value = value.slice(0, commentIdx).trim();
    }
    if (key && value) {
      config[key] = value;
    }
  }

  if (config.contributors) {
    const parts = config.contributors.split(',').map(s => s.trim()).filter(Boolean);
    config.contributors = parts.map(p => {
      const [name, role] = p.split('|').map(s => s.trim());
      return { name: name || '', role: role || 'ctb' };
    });
  } else {
    config.contributors = [];
  }

  if (config.extra_titles) {
    config.extra_titles = config.extra_titles.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    config.extra_titles = [];
  }

  if (config.subjects) {
    config.subjects = config.subjects.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    config.subjects = [];
  }

  return config;
}

function collectChapters(epubDir, ordPath) {
  const allFiles = fs.readdirSync(epubDir);
  const xhtmlFiles = allFiles.filter(f =>
    f.endsWith('.xhtml') &&
    !['cover.xhtml', 'toc.xhtml', 'nav.xhtml'].includes(f.toLowerCase())
  );

  let order = [];

  if (fs.existsSync(ordPath)) {
    const content = fs.readFileSync(ordPath, 'utf8');
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    for (const line of lines) {
      const found = xhtmlFiles.find(f => f === line);
      if (found) {
        order.push(found);
      } else {
        logI18n('warning_ord_not_found', { file: line }, 'warn');
      }
    }
  }

  if (order.length === 0) {
    order = xhtmlFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  const chapters = [];
  for (const filename of order) {
    const filepath = path.join(epubDir, filename);
    if (!fs.existsSync(filepath)) continue;
    let title = path.basename(filename, path.extname(filename));
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const match = content.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (match) title = match[1].trim();
    } catch (_) { /* ignore */ }
    chapters.push({ path: filename, title });
  }
  return chapters;
}

function collectMedia(epubDir) {
  const imagesDir = path.join(epubDir, 'images');
  const audioDir = path.join(epubDir, 'audiovideo');
  const result = { images: [], audio: [], cover: null };

  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f)) {
        const isCover = f.match(/^cover\./i) || f.toLowerCase().includes('cover');
        if (isCover) result.cover = f;
        result.images.push(f);
      }
    }
  }

  if (fs.existsSync(audioDir)) {
    const files = fs.readdirSync(audioDir);
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (/\.(mp3|m4a|ogg|wav|mp4|webm)$/i.test(f)) {
        result.audio.push(f);
      }
    }
  }
  return result;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.xhtml': 'application/xhtml+xml',
    '.html': 'application/xhtml+xml',
    '.xml': 'application/xml',
  };
  return map[ext] || 'application/octet-stream';
}

function generateOpf(config, chapters, media) {
  const { mainTitle, subTitle, volume, creator, language, identifier, date,
    publisher, description, subjects, seriesName, seriesNumber,
    contributors, extraTitles } = config;

  const metadata = [];
  const titles = [mainTitle || 'Untitled'];
  if (subTitle) titles.push(subTitle);
  if (volume) titles.push(volume);
  for (const t of extraTitles) {
    if (t.trim()) titles.push(t.trim());
  }
  for (const t of titles) {
    metadata.push(`<dc:title>${escapeXml(t)}</dc:title>`);
  }

  if (creator) {
    metadata.push(`<dc:creator id="creator">${escapeXml(creator)}</dc:creator>`);
  }

  for (const c of contributors) {
    const role = c.role || 'ctb';
    if (role === 'aut' && !creator) {
      metadata.push(`<dc:creator id="creator">${escapeXml(c.name)}</dc:creator>`);
    } else {
      const roleLabel = role === 'aut' ? 'author' : (role === 'edt' ? 'editor' : role);
      metadata.push(`<dc:contributor>${escapeXml(c.name)} (${roleLabel})</dc:contributor>`);
    }
  }

  for (const s of subjects) {
    if (s.trim()) metadata.push(`<dc:subject>${escapeXml(s)}</dc:subject>`);
  }

  if (description) metadata.push(`<dc:description>${escapeXml(description)}</dc:description>`);
  if (publisher) metadata.push(`<dc:publisher>${escapeXml(publisher)}</dc:publisher>`);

  metadata.push(`<dc:language>${escapeXml(language || 'en')}</dc:language>`);

  let idVal = identifier;
  if (!idVal) idVal = `urn:uuid:${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + '-' + Math.random().toString(16).slice(2)}`;
  metadata.push(`<dc:identifier id="pub-id">${escapeXml(idVal)}</dc:identifier>`);

  const dateVal = date || new Date().toISOString().slice(0, 10);
  metadata.push(`<dc:date>${escapeXml(dateVal)}</dc:date>`);

  if (seriesName) {
    metadata.push(`<meta property="belongs-to-collection" id="collection">${escapeXml(seriesName)}</meta>`);
    if (seriesNumber) {
      metadata.push(`<meta property="group-position" refines="#collection">${escapeXml(seriesNumber)}</meta>`);
    }
  }

  metadata.push(`<meta property="dcterms:modified">${getEpubTimestamp()}</meta>`);
  metadata.push(`<meta property="rendition:layout">reflowable</meta>`);
  metadata.push(`<meta property="schema:accessMode">textual</meta>`);
  metadata.push(`<meta property="schema:accessibilityFeature">tableOfContents</meta>`);
  metadata.push(`<meta property="schema:accessibilityHazard">none</meta>`);
  metadata.push(`<meta property="schema:accessModeSufficient">textual</meta>`);
  metadata.push(`<meta property="schema:accessibilitySummary">Buku teks dengan daftar isi.</meta>`);

  const manifest = [];
  const spine = [];

  let coverImgRel = null;
  if (media.cover) {
    coverImgRel = `images/${media.cover}`;
    const mime = getMimeType(media.cover);
    manifest.push(`<item id="cover-image" href="${escapeXml(coverImgRel)}" media-type="${mime}" properties="cover-image"/>`);
  } else {
    logI18n('cover_missing', {}, 'warn');
  }

  const coverXhtmlPath = 'cover.xhtml';
  manifest.push(`<item id="cover-xhtml" href="${coverXhtmlPath}" media-type="application/xhtml+xml"/>`);
  spine.push(`<itemref idref="cover-xhtml" linear="yes"/>`);

  manifest.push(`<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  spine.push(`<itemref idref="toc" linear="no"/>`);

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const id = `chap_${i}`;
    const href = ch.path;
    manifest.push(`<item id="${id}" href="${escapeXml(href)}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}" linear="yes"/>`);
  }

  for (const img of media.images) {
    if (img === media.cover) continue;
    const id = `img_${img.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const href = `images/${img}`;
    manifest.push(`<item id="${id}" href="${escapeXml(href)}" media-type="${getMimeType(img)}"/>`);
  }

  for (const av of media.audio) {
    const id = `av_${av.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const href = `audiovideo/${av}`;
    manifest.push(`<item id="${id}" href="${escapeXml(href)}" media-type="${getMimeType(av)}"/>`);
  }

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"
         unique-identifier="pub-id"
         xml:lang="${escapeXml(language || 'en')}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${metadata.join('\n    ')}
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine page-progression-direction="ltr">
    ${spine.join('\n    ')}
  </spine>
</package>
`;
  return opf;
}

function generateToc(chapters) {
  const items = chapters.map(ch =>
    `<li><a href="${escapeXml(ch.path)}">${escapeXml(ch.title)}</a></li>`
  ).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc" role="doc-toc">
    <h1>Table of Contents</h1>
    <ol>
    ${items}
    </ol>
  </nav>
</body>
</html>
`;
}

function generateCoverXhtml(coverFilename) {
  if (!coverFilename) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="id" lang="id">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>Cover</title>
</head>
<body>
  <h1>Cover</h1>
</body>
</html>
`;
  }
  const href = `images/${coverFilename}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" xml:lang="id" lang="id">
<head>
  <title>Cover</title>
  <meta name="viewport" content="width=device-width, height=device-height" />
</head>
<body style="margin-top: 0px; margin-left: 0px; margin-right: 0px; margin-bottom: 0px;">
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100%" height="99%" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid meet"><image width="600" height="800" xlink:href="${escapeXml(href)}" alt="Cover" />
  </svg>
</body>
</html>
`;
}

function generateContainer() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/volume.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

// ─── Command: import ───────────────────────────────────────────────────
async function cmdImport(argv) {
  let force = false;
  let outputDir = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--output' && i + 1 < argv.length) {
      outputDir = path.resolve(process.cwd(), argv[i + 1]);
      i++;
    }
  }

  let AdmZip, xml2js;
  try {
    AdmZip = require('adm-zip');
  } catch (_) {
    logI18n('missing_dep', { mod: 'adm-zip', version: '0.5.10' }, 'error');
    rl.close();
    return;
  }
  try {
    xml2js = require('xml2js');
  } catch (_) {
    logI18n('missing_dep', { mod: 'xml2js', version: '0.5.0' }, 'error');
    rl.close();
    return;
  }

  const cwd = process.cwd();
  const files = fs.readdirSync(cwd).filter(f => f.endsWith('.epub'));
  if (files.length === 0) {
    logI18n('import_no_epub', {}, 'error');
    rl.close();
    return;
  }

  let selectedFile = files[0];
  if (files.length > 1) {
    console.log(t('import_select'));
    files.forEach((f, i) => console.log(`  ${i+1}. ${f}`));
    const answer = await question(t('import_select_prompt', { count: files.length }));
    const idx = parseInt(answer.trim());
    if (isNaN(idx) || idx < 1 || idx > files.length) {
      logI18n('import_invalid_choice', {}, 'error');
      rl.close();
      return;
    }
    selectedFile = files[idx - 1];
  }

  const epubPath = path.join(cwd, selectedFile);
  logI18n('import_extracting', { file: selectedFile }, 'info');

  const zip = new AdmZip(epubPath);
  const zipEntries = zip.getEntries();

  const containerEntry = zipEntries.find(e => e.entryName === 'META-INF/container.xml');
  if (!containerEntry) {
    console.error('❌ META-INF/container.xml tidak ditemukan dalam EPUB.');
    rl.close();
    return;
  }
  const containerXml = containerEntry.getData().toString('utf8');
  const parser = new xml2js.Parser();
  let opfPath;
  try {
    const parsed = await parser.parseStringPromise(containerXml);
    const rootfile = parsed.container?.rootfiles?.[0]?.rootfile?.[0]?.$?.['full-path'];
    if (rootfile) opfPath = rootfile;
  } catch (_) {}
  if (!opfPath) {
    console.error('❌ Gagal membaca path OPF dari container.xml.');
    rl.close();
    return;
  }

  const opfEntry = zipEntries.find(e => e.entryName === opfPath);
  if (!opfEntry) {
    console.error(`❌ OPF tidak ditemukan: ${opfPath}`);
    rl.close();
    return;
  }
  const opfXml = opfEntry.getData().toString('utf8');
  let opfParsed;
  try {
    opfParsed = await parser.parseStringPromise(opfXml);
  } catch (_) {
    console.error('❌ Gagal parsing OPF.');
    rl.close();
    return;
  }

  const metadata = opfParsed.package?.metadata?.[0] || {};
  const dc = metadata['dc:title'] || [];
  const titles = dc.map(t => t._ || t).filter(Boolean);
  const mainTitle = titles[0] || '';
  const extraTitles = titles.slice(1);

  const creators = metadata['dc:creator'] || [];
  let author = '';
  let contributors = [];
  for (const c of creators) {
    const name = c._ || c;
    const role = c.$?.id === 'creator' ? 'aut' : 'ctb';
    if (role === 'aut' && !author) author = name;
    else contributors.push({ name, role });
  }

  const lang = metadata['dc:language']?.[0]?._ || metadata['dc:language']?.[0] || 'en';
  const identifier = metadata['dc:identifier']?.[0]?._ || metadata['dc:identifier']?.[0] || '';
  const date = metadata['dc:date']?.[0]?._ || metadata['dc:date']?.[0] || '';
  const publisher = metadata['dc:publisher']?.[0]?._ || metadata['dc:publisher']?.[0] || '';
  const description = metadata['dc:description']?.[0]?._ || metadata['dc:description']?.[0] || '';
  const subjects = (metadata['dc:subject'] || []).map(s => s._ || s).filter(Boolean);

  let seriesName = '';
  let seriesNumber = '';
  const metaTags = metadata['meta'] || [];
  for (const m of metaTags) {
    const prop = m.$?.property;
    if (prop === 'belongs-to-collection') {
      seriesName = m._ || m;
    } else if (prop === 'group-position') {
      seriesNumber = m._ || m;
    }
  }

  const manifestItems = opfParsed.package?.manifest?.[0]?.item || [];
  const manifestMap = {};
  for (const item of manifestItems) {
    const id = item.$?.id;
    const href = item.$?.href;
    const mediaType = item.$?.['media-type'];
    const properties = item.$?.properties || '';
    if (id && href) {
      manifestMap[id] = { href, mediaType, properties };
    }
  }

  const spineItems = opfParsed.package?.spine?.[0]?.itemref || [];
  const spineOrder = spineItems.map(item => item.$?.idref).filter(Boolean);

  const epubTarget = path.join(outputDir, 'EPUB');
  const imagesTarget = path.join(epubTarget, 'images');
  const audioTarget = path.join(epubTarget, 'audiovideo');
  ensureDir(epubTarget);
  ensureDir(imagesTarget);
  ensureDir(audioTarget);

  function copyZipEntry(entryName, destPath, overwrite = false) {
    const entry = zipEntries.find(e => e.entryName === entryName);
    if (!entry) return false;
    if (fs.existsSync(destPath) && !overwrite) return false;
    ensureDir(path.dirname(destPath));
    const data = entry.getData();
    fs.writeFileSync(destPath, data);
    return true;
  }

  let coverFound = false;
  for (const id in manifestMap) {
    const item = manifestMap[id];
    if (item.properties && item.properties.includes('cover-image')) {
      const src = item.href;
      const filename = path.basename(src);
      const dest = path.join(imagesTarget, filename);
      if (copyZipEntry(src, dest, force)) {
        coverFound = true;
        logI18n('import_cover_found', { file: filename }, 'info');
      }
      break;
    }
  }
  if (!coverFound) {
    for (const id in manifestMap) {
      const item = manifestMap[id];
      if (item.mediaType && item.mediaType.startsWith('image/')) {
        const filename = path.basename(item.href);
        if (/cover/i.test(filename)) {
          const dest = path.join(imagesTarget, filename);
          if (copyZipEntry(item.href, dest, force)) {
            coverFound = true;
            logI18n('import_cover_found', { file: filename }, 'info');
          }
          break;
        }
      }
    }
  }

  const chapterFiles = [];
  const imageFiles = [];
  const audioFiles = [];

  for (const id of spineOrder) {
    const item = manifestMap[id];
    if (!item) continue;
    if (item.mediaType === 'application/xhtml+xml' || item.mediaType === 'application/xhtml+xml;charset=utf-8') {
      const src = item.href;
      const dest = path.join(epubTarget, src);
      if (copyZipEntry(src, dest, force)) {
        chapterFiles.push(src);
        logI18n('created', { file: dest }, 'success');
      } else if (fs.existsSync(dest)) {
        logI18n('not_modified', { file: dest }, 'warn');
      }
    } else {
      logI18n('import_skip_non_spine', { file: item.href }, 'warn');
    }
  }

  for (const id in manifestMap) {
    const item = manifestMap[id];
    if (!item.mediaType) continue;
    if (item.mediaType.startsWith('image/')) {
      const filename = path.basename(item.href);
      if (coverFound && /cover/i.test(filename)) continue;
      const dest = path.join(imagesTarget, filename);
      if (copyZipEntry(item.href, dest, force)) {
        imageFiles.push(filename);
        logI18n('created', { file: dest }, 'success');
      }
    } else if (item.mediaType.startsWith('audio/') || item.mediaType.startsWith('video/')) {
      const filename = path.basename(item.href);
      const dest = path.join(audioTarget, filename);
      if (copyZipEntry(item.href, dest, force)) {
        audioFiles.push(filename);
        logI18n('created', { file: dest }, 'success');
      }
    }
  }

  const configPath = path.join(outputDir, 'config.txt');
  let configContent = `# ============================================================
#  METADATA BUKU  —  diedit dari hasil impor
# ============================================================

title: ${mainTitle}
subtitle: 
volume: 
author: ${author}
language: ${lang}
identifier: ${identifier}
date: ${date}
publisher: ${publisher}
description: ${description}
subjects: ${subjects.join(', ')}
series_name: ${seriesName}
series_number: ${seriesNumber}
contributors: ${contributors.map(c => `${c.name}|${c.role}`).join(', ')}
extra_titles: ${extraTitles.join(', ')}

# ============================================================
#  KONVERSI DOCX → MARKDOWN (opsional)
# ============================================================
# [docx-mapping]
# heading1 = 24
# heading2 = 18
# heading3 = 14

# ============================================================
#  STRUKTUR DIREKTORI YANG DIPERLUKAN SAAT BUILD:
#
#   ./
#   ├── config.txt
#   ├── ord.txt          ← opsional, daftar urutan bab (satu baris satu .xhtml)
#   ├── Docs/            ← tempat file .docx sumber (untuk docx2md)
#   ├── Markdowns/       ← tempat file .md sumber (untuk convertch)
#   └── EPUB/
#       ├── images/
#       │   └── cover.png   ← WAJIB ada
#       ├── audiovideo/     ← opsional
#       ├── bab1.xhtml      ← bab-bab (bisa nama apa saja, asal di root EPUB/)
#       ├── bab2.xhtml
#       └── ...
#
#  Jalankan:  node epubcreator.js build
# ============================================================
`;
  if (fs.existsSync(configPath) && !force) {
    const ans = await question(t('file_exists', { file: 'config.txt' }));
    if (ans.toLowerCase() === 'y') {
      fs.writeFileSync(configPath, configContent, 'utf8');
      logI18n('overwritten', { file: 'config.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'config.txt' }, 'warn');
    }
  } else {
    fs.writeFileSync(configPath, configContent, 'utf8');
    logI18n('created', { file: configPath }, 'success');
  }

  const ordPath = path.join(outputDir, 'ord.txt');
  let ordContent = '# Daftar urutan bab (satu baris satu .xhtml)\n';
  ordContent += chapterFiles.join('\n');
  if (fs.existsSync(ordPath) && !force) {
    const ans = await question(t('file_exists', { file: 'ord.txt' }));
    if (ans.toLowerCase() === 'y') {
      fs.writeFileSync(ordPath, ordContent, 'utf8');
      logI18n('overwritten', { file: 'ord.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'ord.txt' }, 'warn');
    }
  } else {
    fs.writeFileSync(ordPath, ordContent, 'utf8');
    logI18n('created', { file: ordPath }, 'success');
  }

  logI18n('import_done', {}, 'success');
  logI18n('import_summary', {
    chapters: chapterFiles.length,
    images: imageFiles.length + (coverFound ? 1 : 0),
    audio: audioFiles.length
  }, 'info');
  logI18n('import_hint', {}, 'info');

  rl.close();
}

// ─── Command: updatemodule ────────────────────────────────────────────
async function cmdUpdateModule(force = false) {
  const nodeModulesDir = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nodeModulesDir) && !force) {
    const ans = await question(t('update_confirm'));
    if (ans.toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      rl.close();
      return;
    }
  } else if (fs.existsSync(nodeModulesDir) && force) {
    logI18n('update_force', {}, 'info');
  }

  try {
    const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/main.tar.gz';
    await downloadAndExtract(url, process.cwd(), 'assets/node_modules', 2);
    logI18n('extract_success', {}, 'success');
  } catch (err) {
    logI18n('extract_failed', { error: err.message }, 'error');
  }
  rl.close();
}

// ─── Command: updateconfig ─────────────────────────────────────────────
async function cmdUpdateConfig(force = false) {
  const configDir = path.join(process.cwd(), TOOL_DIR);
  if (fs.existsSync(configDir) && !force) {
    const ans = await question(t('updateconfig_confirm'));
    if (ans.toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      rl.close();
      return;
    }
  } else if (fs.existsSync(configDir) && force) {
    logI18n('updateconfig_force', {}, 'info');
  }

  try {
    const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/config.tar.gz';
    await downloadAndExtract(url, process.cwd(), '.epubcreator', 1);
    logI18n('updateconfig_success', {}, 'success');
  } catch (err) {
    logI18n('updateconfig_failed', { error: err.message }, 'error');
  }
  rl.close();
}

// ─── Command: settings ─────────────────────────────────────────────────
async function cmdSettings() {
  const settingsPath = path.join(process.cwd(), SETTINGS_FILE);
  const settings = loadSettings();

  // Tampilkan setting saat ini
  console.log(t('settings_title'));
  const keys = ['lang', 'watch_delay', 'auto_build', 'overwrite_policy'];
  const current = {};
  for (const k of keys) {
    current[k] = settings[k] || '';
    console.log(`${k.padEnd(15)} : ${current[k]}`);
  }
  console.log('\n' + t('settings_prompt'));

  // Kumpulkan input
  const newSettings = {};
  for (const k of keys) {
    const prompt = `[${k}] (${current[k]}): `;
    const answer = await question(prompt);
    if (answer.trim().toLowerCase() === 'save') {
      // Simpan yang sudah diinput sebelumnya
      for (const kk of keys) {
        if (newSettings[kk] === undefined) {
          newSettings[kk] = current[kk];
        }
      }
      break;
    }
    if (answer.trim().toLowerCase() === 'cancel') {
      logI18n('settings_cancelled', {}, 'warn');
      rl.close();
      return;
    }
    if (answer.trim() !== '') {
      // Validasi sederhana
      if (k === 'lang' && !['id', 'en'].includes(answer.trim())) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else if (k === 'watch_delay' && isNaN(parseInt(answer.trim()))) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else if (k === 'auto_build' && !['true', 'false'].includes(answer.trim().toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else if (k === 'overwrite_policy' && !['ask', 'force', 'skip'].includes(answer.trim().toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else {
        newSettings[k] = answer.trim();
      }
    } else {
      newSettings[k] = current[k];
    }
  }

  // Tulis ke file
  const content = Object.entries(newSettings).map(([k, v]) => `${k} = ${v}`).join('\n');
  ensureDir(TOOL_DIR);
  fs.writeFileSync(settingsPath, content, 'utf8');
  logI18n('settings_saved', { file: settingsPath }, 'success');

  // Reload bahasa
  currentLang = newSettings.lang || 'en';
  loadLanguageFile(currentLang);

  rl.close();
}

// ─── Command: validate ─────────────────────────────────────────────────
async function cmdValidate() {
  const buildsDir = path.join(process.cwd(), 'builds');
  if (!fs.existsSync(buildsDir)) {
    logI18n('validate_no_epub', {}, 'error');
    rl.close();
    return;
  }
  const files = fs.readdirSync(buildsDir).filter(f => f.endsWith('.epub'));
  if (files.length === 0) {
    logI18n('validate_no_epub', {}, 'error');
    rl.close();
    return;
  }
  const latest = files.sort().pop();
  const epubPath = path.join(buildsDir, latest);
  logI18n('validate_start', { file: latest }, 'info');

  let output;
  try {
    output = execSync(`epubcheck "${epubPath}"`, { encoding: 'utf8' });
    logI18n('validate_ok', { file: latest }, 'success');
    console.log(output);
  } catch (err) {
    logI18n('validate_fail', { output: err.stdout || err.message }, 'error');
  }
  rl.close();
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  // Load settings dan bahasa
  const settings = loadSettings();
  currentLang = settings.lang || 'en';
  loadLanguageFile(currentLang);

  const args = process.argv.slice(2);
  const command = args[0];

  // Versi / Help
  if (command === '--version' || command === '-v') {
    console.log(`epubcreator v${VERSION}`);
    rl.close();
    return;
  }
  if (!command || command === 'help' || command === '--help') {
    console.log(t('help_title', { version: VERSION }));
    console.log(t('help_commands'));
    console.log(t('help_structure'));
    console.log(t('help_deps'));
    rl.close();
    return;
  }

  // Perintah tanpa dependensi
  if (command === 'createdir') {
    await cmdCreateDir();
    return;
  }
  if (command === 'updatemodule') {
    const force = args.includes('--force') || args.includes('-f');
    await cmdUpdateModule(force);
    return;
  }
  if (command === 'updateconfig') {
    const force = args.includes('--force') || args.includes('-f');
    await cmdUpdateConfig(force);
    return;
  }
  if (command === 'import') {
    await cmdImport(args.slice(1));
    return;
  }
  if (command === 'settings') {
    await cmdSettings();
    return;
  }
  if (command === 'validate') {
    await cmdValidate();
    return;
  }

  // Perintah dengan dependensi
  let deps;
  try {
    deps = checkDependencies();
  } catch (_) {
    process.exit(1);
  }
  const { archiver, marked, TurndownService } = deps;

  // convertch / conv
  if (command === 'convertch' || command === 'conv') {
    const sub = args[1] || 'md2xhtml';
    const rest = args.slice(2);
    if (sub === 'md2xhtml' || (sub !== 'xhtml2md' && sub !== 'docx2md')) {
      const argPath = (sub === 'md2xhtml') ? rest[0] : args[1];
      const force = rest.includes('--force') || rest.includes('-f');
      await cmdConvertCh(argPath, force, marked);
    } else if (sub === 'xhtml2md') {
      await cmdConvertX(rest[0], TurndownService);
    } else if (sub === 'docx2md') {
      await cmdDocxToMd(rest);
    } else {
      logI18n('unknown_command', { cmd: sub }, 'error');
      logI18n('usage_hint', {}, 'info');
      rl.close();
    }
    return;
  }

  if (command === 'convertchx') {
    await cmdConvertX(args[1], TurndownService);
    return;
  }

  if (command === 'split') {
    await cmdSplit(args.slice(1));
    return;
  }

  if (command === 'merge') {
    await cmdMerge(args.slice(1));
    return;
  }

  if (command === 'build') {
    await cmdBuild(archiver);
    return;
  }

  if (command === 'debug') {
    await cmdDebug(archiver, marked);
    return;
  }

  logI18n('unknown_command', { cmd: command }, 'error');
  logI18n('usage_hint', {}, 'info');
  rl.close();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  rl.close();
});