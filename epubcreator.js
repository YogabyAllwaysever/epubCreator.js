#!/usr/bin/env node
/**
 * epubcreator.js — Node CLI untuk kompilasi direktori ke EPUB
 *
 * Versi: 4.0.2 (interactive menu + ANSI UI + comic/manga/textbook)
 *
 *  Copyright (C) 2026 YogabyAllwaysever.
 *
 * Cara pakai:
 *   node epubcreator.js                    → menu interaktif
 *   node epubcreator.js createdir          → buat struktur direktori
 *   node epubcreator.js createdir comic    → paksa mode comic (LTR)
 *   node epubcreator.js createdir manga    → paksa mode manga (RTL)
 *   node epubcreator.js convertch          → ubah file .md menjadi .xhtml
 *   node epubcreator.js convertch img2xhtml → generate .xhtml dari gambar
 *   node epubcreator.js convertch xhtml2md → ubah file .xhtml menjadi .md
 *   node epubcreator.js convertch docx2md  → ubah file .docx menjadi .md
 *   node epubcreator.js conv ...           → alias untuk convertch
 *   node epubcreator.js split <path>       → pecah file .md berdasarkan ##
 *   node epubcreator.js merge <path>       → gabungkan file .md
 *   node epubcreator.js build              → build EPUB
 *   node epubcreator.js debug              → pantau perubahan, auto build
 *   node epubcreator.js import             → impor file .epub
 *   node epubcreator.js updatemodule       → update node_modules dari repo
 *   node epubcreator.js updateconfig       → update .epubcreator dari repo
 *   node epubcreator.js settings           → ubah pengaturan tool
 *   node epubcreator.js validate           → validasi EPUB dengan epubcheck
 *   node epubcreator.js --version          → tampilkan versi
 *   node epubcreator.js help               → tampilkan bantuan
 */

const VERSION = '4.0.2';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');

// ─── Terminal colors (ANSI, ASCII-safe) ────────────────────────────────
const _useColor = !!(process.stdout.isTTY && !process.env.NO_COLOR);
const c = {
  reset:  _useColor ? '\x1b[0m'  : '',
  bold:   _useColor ? '\x1b[1m'  : '',
  dim:    _useColor ? '\x1b[2m'  : '',
  red:    _useColor ? '\x1b[31m' : '',
  green:  _useColor ? '\x1b[32m' : '',
  yellow: _useColor ? '\x1b[33m' : '',
  cyan:   _useColor ? '\x1b[36m' : '',
  gray:   _useColor ? '\x1b[90m' : '',
};

// ─── Konfigurasi tool ──────────────────────────────────────────────────
const TOOL_DIR = '.epubcreator';
const SETTINGS_FILE = path.join(TOOL_DIR, 'settings.txt');

const VALID_TYPES = ['textbook', 'comic', 'manga'];

// ─── Pesan (EN) ───────────────────────────────────────────────────────
const MESSAGES = {
  // Pesan umum
  missing_dep: 'Module "{mod}" (v{version}) not found. Install with:\n  npm install {mod}@{version}\n',
  marked_old: '"marked" version is too old. Reinstall with:\n  npm install marked@4.0.0\n',
  cancelled: 'Cancelled.',
  file_exists: '{file} already exists. Overwrite? (y/n) ',
  overwritten: '{file} overwritten.',
  not_modified: '{file} unchanged.',
  created: '{file} created.',
  dir_created: 'Directory structure created at {dirs}',
  ready: 'Directory and template files ready.',

  // convertch (MD→XHTML)
  markdowns_not_found: 'Markdowns/ directory not found. Create with "node epubcreator.js createdir"',
  path_not_found: 'Path not found: {path}',
  must_be_md: 'File must have .md extension',
  no_md_found: 'No .md files found in that directory.',
  md_count: 'Found {count} .md files.',
  xhtml_exists: '{count} .xhtml files already exist. (Y) Overwrite all, (N) Copy all to Markdowns, (C) Cancel: ',
  convert_cancelled: 'Conversion cancelled.',
  copy_md: 'Copy {file} to {dest}',
  md_already_exists: '{file} already exists in Markdowns, skipping copy.',
  copy_done: 'Done: {count} .md files copied to Markdowns/.',
  skip_file: 'Skipping {file}',
  convert_success: 'Successfully converted: {file}',
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
  convertx_success: 'Successfully converted: {file}',
  convertx_fail: 'Failed to convert {file}: {error}',
  convertx_summary: 'Done: {success} out of {total} files converted successfully.',

  // convertch docx2md
  docx_no_files: 'No .docx files found.',
  docx_processing: 'Processing: {file}',
  docx_no_images: 'Image extraction from DOCX not yet supported; images will be ignored.',
  docx_heading_mode_warn: 'Font size based heading mode is used (with configured thresholds).',
  docx_nosplit_mode: 'No-split mode (--nosplit) is active, all content will be merged into one file.',

  // convertch img2xhtml (comic/manga)
  img2x_epub_not_found: 'EPUB/ directory not found. Run "createdir comic" or "createdir manga" first.',
  img2x_pages_not_found: 'EPUB/images/pages/ not found. Put page images there first.',
  img2x_no_images: 'No images found in EPUB/images/pages/.',
  img2x_images_found: 'Found {count} page image(s).',
  img2x_generating: 'Generating {file} ...',
  img2x_generated: 'XHTML generated: {file}',
  img2x_skipped: 'Skipped (up-to-date): {file}',
  img2x_regen: 'Regenerating (image newer): {file}',
  img2x_ord_created: 'ord.txt created: {file}',
  img2x_ord_exists: 'ord.txt already exists. New entries will be appended. Continue? (y/n) ',
  img2x_ord_skip: 'ord.txt not modified.',
  img2x_ord_appended: '{count} new entries appended to ord.txt.',
  img2x_ord_regen_confirm: 'ord.txt will be regenerated (existing edits will be lost). Continue? (y/n) ',
  img2x_ord_regen: 'ord.txt regenerated: {file}',
  img2x_ord_cancelled: 'ord.txt regeneration cancelled.',
  img2x_summary: 'Done: {success} XHTML generated, {skipped} skipped, {total} total.',

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
  merge_summary: '{count} files successfully merged into {output}.',
  merge_output_file: 'Output: {file}',

  // build
  config_not_found: 'config.txt not found! Run: node epubcreator.js createdir',
  epub_dir_not_found: 'EPUB/ directory not found!',
  title_missing: 'config.txt must have "title"',
  author_missing: 'config.txt must have "author"',
  no_chapters: 'No chapters (.xhtml files) found in EPUB/ (excluding cover/toc/nav)',
  chapters_found: 'Found {count} chapters.',
  cover_missing: 'No cover image found in EPUB/images/ - cover will be without image.',
  cover_found: 'Cover: {file}',
  media_summary: 'Images: {images} | Audio/Video: {audio}',
  epub_built: 'EPUB built successfully: {path} ({size} KB)',
  zip_error: 'Failed to create ZIP: {error}',
  warning_ord_not_found: 'Warning: file "{file}" in ord.txt not found in EPUB/',

  // build comic/manga
  comic_mode: 'Comic mode: {type} ({direction}, spread: {spread})',
  comic_pages_found: 'Found {count} page(s).',
  comic_double_detected: 'Page {page} detected as double-spread (ratio {ratio}).',
  comic_pages_dir_missing: 'EPUB/images/pages/ not found. Put page images there first.',
  comic_xhtmls_missing: 'EPUB/xhtmls/ not found. Run "convertch img2xhtml" first.',
  comic_syncing: 'Syncing XHTML from images...',
  comic_css_found: 'Custom CSS: {list}',

  // import
  import_no_epub: 'No .epub file found in this directory.',
  import_select: 'Select EPUB file to import:',
  import_select_prompt: 'Enter number (1-{count}): ',
  import_invalid_choice: 'Invalid choice.',
  import_extracting: 'Extracting {file} ...',
  import_done: 'Import completed.',
  import_summary: '   Chapters/Pages: {chapters}, Images: {images}, Audio/Video: {audio}',
  import_hint: 'Run "node epubcreator.js convertch xhtml2md" to convert .xhtml to .md if needed.',
  import_skip_non_spine: 'Skipping non-chapter file: {file}',
  import_cover_found: 'Cover found: {file}',
  import_force_overwrite: 'Overwriting existing files (--force).',
  import_comic_detected: 'Detected fixed-layout ({type}, {direction})',
  import_comic_pages: 'Extracted {count} page(s) to EPUB/images/pages/',
  import_ord_written: 'ord.txt written with {count} entries.',

  // updatemodule & updateconfig
  node_modules_missing: 'node_modules not found.',
  download_confirm: 'Download pre-built dependencies from repository? (y/n) ',
  extract_no_assets: 'Folder node_modules not found in archive.',
  download_start: 'Downloading bundle ...',
  download_complete: 'Download complete. Extracting ...',
  download_failed: 'Failed to download bundle: {error}',
  extract_failed: 'Failed to extract node_modules: {error}',
  extract_success: 'node_modules extracted successfully.',
  tar_not_found: '"tar" command not found. Please ensure tar is installed (Linux/macOS/Termux) or use Git Bash on Windows.',
  update_confirm: 'This will replace your existing node_modules folder. Continue? (y/n) ',
  update_force: 'Overwriting node_modules (--force).',

  // validate
  validate_no_epub: 'No .epub file found in builds/',
  validate_start: 'Validating {file} ...',
  validate_ok: 'Validation passed for {file}',
  validate_fail: 'Validation failed:\n{output}',

  // debug
  debug_usage: 'node epubcreator.js debug  -> Watch changes, auto convertch + build',
  debug_start: 'Watching Markdowns/ for changes... Press q to stop, Ctrl+C to exit.',
  debug_start_comic: 'Watching EPUB/images/pages/ for changes... Press q to stop, Ctrl+C to exit.',
  debug_change: 'Changes detected, rebuilding...',
  debug_error: 'Error during rebuild: {error}',
  debug_watch_fallback: 'Warning: recursive watch not supported, watching root directory only (subdirectory changes may not trigger).',
  debug_watching_again: 'Watching again...',
  debug_stopped: 'Debug stopped.',

  // settings command
  settings_title: '=== .epubcreator/settings.txt ===',
  settings_prompt: 'Press Enter to keep current value, or type new value. Type "save" to save, "cancel" to abort.',
  settings_saved: 'Settings saved to {file}.',
  settings_cancelled: 'Settings cancelled.',
  settings_invalid_value: 'Invalid value. Keeping previous.',

  // updateconfig
  updateconfig_confirm: 'This will replace your existing .epubcreator folder. Continue? (y/n) ',
  updateconfig_force: 'Overwriting .epubcreator (--force).',
  updateconfig_fetching: 'Downloading configuration bundle from config branch...',
  updateconfig_extracting: 'Extracting configuration...',
  updateconfig_success: '.epubcreator updated successfully.',
  updateconfig_no_assets: 'Folder .epubcreator not found in archive.',
  updateconfig_failed: 'Failed to update config: {error}',

  // createdir
  createdir_update_config: 'Updating .epubcreator from config branch...',
  createdir_skip_update: 'Skipping .epubcreator update.',
  createdir_type_prompt: 'Type (textbook/comic/manga) [{default}]: ',
  createdir_chapters_prompt: 'Have chapters? (y/n) [n]: ',
  createdir_direction_prompt: 'Reading direction (ltr/rtl) [{default}]: ',
  createdir_invalid_type: 'Invalid type "{type}". Using default.',
  createdir_invalid_direction: 'Invalid direction "{dir}". Using default.',
  createdir_cover_hint: 'Place cover at EPUB/images/cover.jpg',
  createdir_pages_hint: 'Place comic pages at EPUB/images/pages/',
  createdir_styles_hint: '(Optional) Place custom CSS at EPUB/styles/',

  // command unknown
  unknown_command: 'Unknown command: {cmd}',
  usage_hint: 'Use: createdir | convertch | conv | split | merge | build | debug | import | updatemodule | updateconfig | settings | validate | --version',

  // Help
  help_title: 'epubcreator — CLI for compiling directory to EPUB  (v{version})',
  help_commands: `
  node epubcreator.js                    Open interactive menu
  node epubcreator.js createdir           Create directory structure (interactive: textbook/comic/manga)
  node epubcreator.js createdir comic     Create comic directory (LTR)
  node epubcreator.js createdir manga     Create manga directory (RTL)
  node epubcreator.js convertch           Convert .md -> .xhtml (default, looks in Markdowns/)
  node epubcreator.js convertch img2xhtml Generate .xhtml from images (comic/manga mode)
  node epubcreator.js convertch xhtml2md  Convert .xhtml -> .md
  node epubcreator.js convertch docx2md   Convert .docx -> .md (split by ##)
  node epubcreator.js conv ...            Alias for convertch
  node epubcreator.js split <path>        Split .md file by heading ##
  node epubcreator.js merge <path>        Merge .md files into one (reverse of split)
  node epubcreator.js build               Build EPUB from current directory
  node epubcreator.js debug               Watch changes, auto convertch + build
  node epubcreator.js import              Import .epub file from current directory
  node epubcreator.js updatemodule        Download/update node_modules from repo
  node epubcreator.js updatemodule --force Update without confirmation
  node epubcreator.js updateconfig        Download/update .epubcreator from repo (config branch)
  node epubcreator.js settings            Interactive tool settings
  node epubcreator.js validate            Validate latest EPUB with epubcheck
  node epubcreator.js --version           Show version`,
  help_structure: `
Directory structure (textbook):
  ./
  ├── config.txt          <- book metadata (required), type: textbook
  ├── ord.txt             <- chapter order list (optional)
  ├── Docs/               <- source .docx files (for docx2md)
  ├── Markdowns/          <- source .md files (for convertch)
  ├── EPUB/
  │   ├── images/
  │   │   └── cover.png   <- REQUIRED
  │   ├── audiovideo/     <- optional
  │   └── bab1.xhtml      <- chapters (any name, in EPUB/ root)
  └── builds/
      └── [folder-name].epub

Directory structure (comic/manga):
  ./
  ├── config.txt          <- type: comic | manga, reading_direction: ltr | rtl
  ├── ord.txt             <- optional: ordered list with * / ! / | alt
  ├── EPUB/
  │   ├── images/
  │   │   ├── cover.jpg   <- REQUIRED
  │   │   └── pages/
  │   │       ├── ch1/    <- optional chapter grouping
  │   │       │   ├── 0001.jpg
  │   │       │   └── 0002.jpg
  │   │       └── ch2/
  │   │           └── 0001.jpg
  │   ├── xhtmls/         <- auto-generated by "convertch img2xhtml"
  │   ├── styles/         <- optional custom CSS
  │   ├── about.xhtml     <- back-matter (reflowable) optional
  │   └── audiovideo/     <- optional
  └── builds/
      └── [folder-name].epub`,
  help_deps: `
Note: make sure main dependencies are installed:
  npm install archiver@5.3.0 marked@4.0.0 turndown@7.2.4
For DOCX feature:  npm install mammoth@1.6.0 (optional)
For import feature: npm install adm-zip@0.5.10 xml2js@0.5.0 (optional)
For validation: install epubcheck (https://github.com/w3c/epubcheck)
  Or run "node epubcreator.js updatemodule" to download automatically.`,
};

// ─── Variabel global ──────────────────────────────────────────────────
let interactiveMode = false;
// Slot tunggal untuk menghentikan debug yang sedang aktif (TUI atau fallback).
let _activeDebugStop = null;

// ─── Emoji strip (safety net) ─────────────────────────────────────────
const EMOJI_PREFIX_RE = /^[\s\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2139}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}]+/u;

function stripEmojiPrefix(str) {
  return String(str).replace(EMOJI_PREFIX_RE, '');
}

// ─── Fungsi untuk memuat settings ─────────────────────────────────────
function loadSettings() {
  const settingsPath = path.join(process.cwd(), SETTINGS_FILE);
  const defaults = {
    watch_delay: '500',
    auto_build: 'false',
    overwrite_policy: 'ask',
    default_type: 'textbook',
  };
  if (!fs.existsSync(settingsPath)) {
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

// ─── Fungsi terjemahan / substitusi string ────────────────────────────
function t(key, params = {}) {
  let str = MESSAGES[key] || key;
  str = stripEmojiPrefix(str);
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`{${k}}`, 'g'), v);
  }
  return str;
}

// ─── Log styles (ANSI + ASCII prefix) ─────────────────────────────────
const LOG_STYLES = {
  info:    { tag: '[i] ', color: c.cyan },
  success: { tag: '[OK]', color: c.green },
  warn:    { tag: '[!] ', color: c.yellow },
  error:   { tag: '[!!]', color: c.red },
};

function log(msg, type = 'info') {
  const s = LOG_STYLES[type] || LOG_STYLES.info;
  const cleanMsg = stripEmojiPrefix(String(msg));
  console.log(`${s.color}${s.tag}${c.reset} ${cleanMsg}`);
}

function logI18n(key, params = {}, type = 'info') {
  log(t(key, params), type);
}

// ═══════════════════════════════════════════════════════════════════════
//  TUI  (full-screen interactive menu, alternate-screen buffer)
// ═══════════════════════════════════════════════════════════════════════

// Save original console methods so we can bypass the TUI redirect.
const _origConsoleLog = console.log.bind(console);
const _origConsoleError = console.error.bind(console);

// Strip ANSI escape codes to compute "visible length" of a line.
function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

// Menu structure — rendered in 3 columns per section.
const MENU_DEF = [
  {
    section: 'CREATE',
    items: [
      { key: '1', label: 'Textbook' },
      { key: '2', label: 'Comic LTR' },
      { key: '3', label: 'Manga RTL' },
    ],
  },
  {
    section: 'CONVERT',
    items: [
      { key: '4', label: 'MD>XHTML' },
      { key: '5', label: 'XHTML>MD' },
      { key: '6', label: 'DOCX>MD' },
      { key: '7', label: 'IMG>XHTML' },
      { key: '8', label: 'Split MD' },
      { key: '9', label: 'Merge MD' },
    ],
  },
  {
    section: 'BUILD & MANAGE',
    items: [
      { key: 'b', label: 'Build EPUB' },
      { key: 'd', label: 'Debug' },
      { key: 'v', label: 'Validate' },
      { key: 'i', label: 'Import' },
      { key: 's', label: 'Settings' },
      { key: 'u', label: 'Upd modules' },
      { key: 'c', label: 'Upd config' },
    ],
  },
];

const TUI = {
  active: false,
  suspended: false,
  executing: false,
  debugActive: false,
  cols: 80,
  rows: 24,
  logs: [],
  maxLogs: 2000,
  scrollOffset: 0,
  selected: 0,
  menu: [],
  deps: null,
  promptState: null,
  onExit: null,
  _dataHandler: null,
  _resizeHandler: null,

  canUse() {
    if (!process.stdout.isTTY) return false;
    if (!process.stdin.isTTY) return false;
    if (process.env.NO_TUI) return false;
    if ((process.stdout.columns || 80) < 60) return false;
    if ((process.stdout.rows || 24) < 20) return false;
    return true;
  },

  init(deps) {
    this.deps = deps;
    this.cols = process.stdout.columns || 80;
    this.rows = process.stdout.rows || 24;
    this.menu = [];
    for (const sec of MENU_DEF) {
      for (const item of sec.items) this.menu.push(item);
    }
    this.logs = [
      `${c.bold}epubcreator${c.reset} ${c.gray}v${VERSION}${c.reset}`,
      `${c.gray}Arrow keys to navigate, Enter to select, q to quit.${c.reset}`,
      '',
    ];
  },

  enter() {
    if (!this.canUse()) return false;
    this.active = true;

    try { rl.close(); } catch (_) {}

    process.stdout.write('\x1b[?1049h');   // alt screen
    process.stdout.write('\x1b[?25l');     // hide cursor
    process.stdout.write('\x1b[H\x1b[2J');

    try { process.stdin.setRawMode(true); } catch (_) {}
    process.stdin.resume();

    this._dataHandler = (chunk) => this.handleInput(chunk);
    process.stdin.on('data', this._dataHandler);

    this._resizeHandler = () => {
      this.cols = process.stdout.columns || 80;
      this.rows = process.stdout.rows || 24;
      this.render();
    };
    process.stdout.on('resize', this._resizeHandler);

    this.render();
    return true;
  },

  exit() {
    if (!this.active) return;
    this.active = false;

    if (this._dataHandler) {
      process.stdin.removeListener('data', this._dataHandler);
      this._dataHandler = null;
    }
    if (this._resizeHandler) {
      process.stdout.removeListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    try { process.stdin.setRawMode(false); } catch (_) {}
    process.stdout.write('\x1b[?25h');     // show cursor
    process.stdout.write('\x1b[?1049l');   // leave alt screen

    if (this.onExit) this.onExit();
  },

  suspend() {
    if (!this.active || this.suspended) return;
    this.suspended = true;

    try { process.stdin.setRawMode(false); } catch (_) {}
    process.stdout.write('\x1b[?25h');
    process.stdout.write('\x1b[?1049l');

    try { rl.close(); } catch (_) {}
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  },

  resume() {
    if (!this.active || !this.suspended) return;
    this.suspended = false;

    try { rl.close(); } catch (_) {}

    process.stdout.write('\x1b[?1049h');
    process.stdout.write('\x1b[?25l');
    process.stdout.write('\x1b[H\x1b[2J');
    try { process.stdin.setRawMode(true); } catch (_) {}
    this.render();
  },

  pushLog(text) {
    const lines = String(text).split('\n');
    for (const line of lines) this.logs.push(line);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    if (!this.suspended) this.render();
  },

  render() {
    if (!this.active || this.suspended) return;

    const menuLines = this.buildMenuLines();
    const menuHeight = menuLines.length;
    const logHeight = Math.max(1, this.rows - menuHeight - 1);
    const visibleLogs = this.getVisibleLogs(logHeight);

    let out = '\x1b[H';

    for (let i = 0; i < logHeight; i++) {
      out += this.padLine(visibleLogs[i] || '', this.cols) + '\x1b[K\n';
    }
    for (let i = 0; i < menuLines.length; i++) {
      out += this.padLine(menuLines[i], this.cols) + '\x1b[K\n';
    }

    if (this.promptState) {
      out += '\x1b[?25h';
      out += this.promptState.prompt + this.promptState.buffer;
      out += '\x1b[K\x1b[J';
    } else {
      out += '\x1b[?25l';
      out += this.padLine(this.buildHelpLine(), this.cols) + '\x1b[K\x1b[J';
    }

    process.stdout.write(out);
  },

  padLine(line, width) {
    const plainLen = stripAnsi(line).length;
    if (plainLen >= width) return line;
    return line + ' '.repeat(width - plainLen);
  },

  getVisibleLogs(height) {
    const total = this.logs.length;
    const end = Math.max(0, total - this.scrollOffset);
    const start = Math.max(0, end - height);
    const slice = this.logs.slice(start, end);
    const pad = [];
    for (let i = 0; i < height - slice.length; i++) pad.push('');
    return pad.concat(slice);
  },

  buildMenuLines() {
    const lines = [];
    const cols = this.cols;
    const gap = 4;
    const colWidth = Math.floor((cols - 2 * gap) / 3);
    let flatIdx = 0;

    for (const section of MENU_DEF) {
      const headerText = ` ${section.section} `;
      const padLeft = Math.max(0, Math.floor((cols - headerText.length) / 2));
      lines.push(' '.repeat(padLeft) + '\x1b[7m' + headerText + '\x1b[0m');

      for (let i = 0; i < section.items.length; i += 3) {
        const cells = [];
        for (let j = 0; j < 3; j++) {
          const item = section.items[i + j];
          const idx = item ? flatIdx + j : -1;
          const align = j === 0 ? 'left' : (j === 1 ? 'center' : 'right');
          cells.push(this.renderItemCell(item, idx, align, colWidth));
        }
        lines.push(cells.join(' '.repeat(gap)));
        flatIdx += Math.min(3, section.items.length - i);
      }
      lines.push('');
    }

    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  },

  renderItemCell(item, idx, align, width) {
    if (!item) return ' '.repeat(width);

    const selected = (idx === this.selected);
    const prefix = selected ? '> ' : '  ';
    const plain = `${prefix}[${item.key}] ${item.label}`;

    let padded;
    if (align === 'left') {
      padded = plain.padEnd(width, ' ').slice(0, width);
    } else if (align === 'right') {
      padded = plain.padStart(width, ' ').slice(-width);
    } else {
      const totalPad = width - plain.length;
      if (totalPad <= 0) {
        padded = plain.slice(0, width);
      } else {
        const leftPad = Math.floor(totalPad / 2);
        padded = ' '.repeat(leftPad) + plain + ' '.repeat(totalPad - leftPad);
      }
    }

    if (selected) return c.bold + c.cyan + padded + c.reset;
    return padded;
  },

  buildHelpLine() {
    if (this.debugActive) {
      return ` ${c.yellow}Debug active — q stop   PgUp/PgDn scroll   Ctrl+C exit${c.reset}`;
    }
    return ` ${c.gray}Up/Down navigate   Enter select   PgUp/PgDn scroll   h help   q quit   (${this.selected + 1}/${this.menu.length})${c.reset}`;
  },

  handleInput(chunk) {
    if (this.suspended) return;

    const str = chunk.toString('utf8');

    if (this.promptState) {
      this.handlePromptInput(str);
      return;
    }

    // Debug mode: tangkap q untuk stop, Ctrl+C untuk kill, PgUp/PgDn untuk scroll.
    if (this.debugActive) {
      this.handleDebugInput(str);
      return;
    }

    if (this.executing) {
      if (str.includes('\x03')) this.exit();
      return;
    }

    let i = 0;
    while (i < str.length) {
      const ch = str[i];

      if (ch === '\x1b') {
        if (str[i + 1] === '[') {
          const code = str[i + 2];
          if (code === 'A') { this.moveSelection(-1); i += 3; continue; }
          if (code === 'B') { this.moveSelection(1); i += 3; continue; }
          if (code === 'C') { this.moveSelection(1); i += 3; continue; }
          if (code === 'D') { this.moveSelection(-1); i += 3; continue; }
          if (code === '5' && str[i + 3] === '~') { this.scroll(-1); i += 4; continue; }
          if (code === '6' && str[i + 3] === '~') { this.scroll(1); i += 4; continue; }
          i += 3;
          continue;
        }
        i += 1;
        continue;
      }

      if (ch === '\r' || ch === '\n') { this.runSelected(); return; }
      if (ch === '\x03' || ch === '\x04') { this.exit(); return; }

      const lower = ch.toLowerCase();

      if (lower === 'q') { this.exit(); return; }
      if (lower === 'h') {
        this.pushLog(`${c.cyan}Help:${c.reset} use Up/Down + Enter, or press shortcut keys directly (1-9, b, d, v, i, s, u, c). q quits. PgUp/PgDn scrolls log.`);
        return;
      }

      const idx = this.menu.findIndex(it => it.key === lower);
      if (idx >= 0) {
        this.selected = idx;
        this.render();
        this.runSelected();
        return;
      }

      i += 1;
    }
  },

  handleDebugInput(str) {
    let i = 0;
    while (i < str.length) {
      const ch = str[i];

      if (ch === '\x03') {
        // Ctrl+C: stop debug dulu (biar watcher ditutup), lalu exit TUI.
        if (_activeDebugStop) _activeDebugStop();
        this.exit();
        return;
      }
      if (ch === 'q' || ch === 'Q') {
        if (_activeDebugStop) _activeDebugStop();
        return;
      }
      if (ch === '\x1b' && str[i + 1] === '[') {
        const code = str[i + 2];
        if (code === '5' && str[i + 3] === '~') { this.scroll(-1); i += 4; continue; }
        if (code === '6' && str[i + 3] === '~') { this.scroll(1); i += 4; continue; }
        // Telan escape sequence lain (arrow, dsb) tanpa aksi.
        i += 3;
        continue;
      }
      i += 1;
    }
  },

  handlePromptInput(str) {
    const p = this.promptState;
    let changed = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (ch === '\r' || ch === '\n') {
        const answer = p.buffer;
        this.promptState = null;
        this.render();
        p.resolve(answer);
        return;
      }
      if (ch === '\x03') {
        // Fix bug: resolve dengan string kosong, bukan null,
        // supaya caller tidak crash saat memanggil .toLowerCase()/.trim().
        this.promptState = null;
        this.render();
        p.resolve('');
        return;
      }
      if (ch === '\x7f' || ch === '\b') {
        if (p.buffer.length > 0) { p.buffer = p.buffer.slice(0, -1); changed = true; }
        continue;
      }
      if (ch === '\x1b') { if (str[i + 1] === '[') i += 2; continue; }
      if (ch >= ' ') { p.buffer += ch; changed = true; }
    }
    if (changed) this.render();
  },

  askUser(prompt) {
    return new Promise(resolve => {
      this.promptState = { prompt, buffer: '', resolve };
      this.render();
    });
  },

  moveSelection(delta) {
    if (this.menu.length === 0) return;
    const n = this.menu.length;
    this.selected = (this.selected + delta + n) % n;
    this.scrollOffset = 0;
    this.render();
  },

  scroll(direction) {
    const page = Math.max(1, Math.floor((this.rows - 15) / 2));
    if (direction < 0) {
      this.scrollOffset = Math.min(this.scrollOffset + page, Math.max(0, this.logs.length - 1));
    } else {
      this.scrollOffset = Math.max(0, this.scrollOffset - page);
    }
    this.render();
  },

  async runSelected() {
    if (this.executing) return;
    const item = this.menu[this.selected];
    if (!item) return;

    this.executing = true;
    this.pushLog(`${c.cyan}> ${item.label}${c.reset}`);

    try {
      await this.executeAction(item);
    } catch (err) {
      this.pushLog(`${c.red}Error: ${err.message}${c.reset}`);
    } finally {
      this.executing = false;
      this.render();
    }
  },

  async executeAction(item) {
    const key = item.key;

    if (key === 'd') {
      await this.runDebugInTui();
      return;
    }

    // Actions that spawn subprocesses (tar) or that need a normal
    // terminal for interactive input should suspend the TUI.
    const needsSuspend = ['1', '2', '3', 'u', 'c'];
    if (needsSuspend.includes(key)) {
      this.suspend();
      try {
        await handleMenuChoice(key, this.deps);
      } finally {
        this.resume();
      }
      return;
    }

    await handleMenuChoice(key, this.deps);
  },

  async runDebugInTui() {
    // Opsi B: TUI TIDAK di-suspend. Log debug masuk ke log panel TUI
    // lewat console.log redirect. User tekan q untuk stop.
    this.debugActive = true;
    this.pushLog(`${c.yellow}Debug mode active. Press q to stop, Ctrl+C to exit.${c.reset}`);
    this.render();

    try {
      await cmdDebug(this.deps.archiver, this.deps.marked);
    } catch (err) {
      this.pushLog(`${c.red}Debug error: ${err.message}${c.reset}`);
    } finally {
      this.debugActive = false;
    }

    this.pushLog(`${c.green}Debug stopped. Returned to menu.${c.reset}`);
    this.render();
  },
};

// ─── Redirect console.log / console.error when TUI is active ─────────
console.log = function (...args) {
  if (TUI.active && !TUI.suspended) {
    TUI.pushLog(args.map(a => typeof a === 'string' ? a : String(a)).join(' '));
  } else {
    _origConsoleLog(...args);
  }
};
console.error = function (...args) {
  if (TUI.active && !TUI.suspended) {
    TUI.pushLog(args.map(a => typeof a === 'string' ? a : String(a)).join(' '));
  } else {
    _origConsoleError(...args);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  End of TUI
// ═══════════════════════════════════════════════════════════════════════

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
let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

process.on('exit', () => {
  try { rl.close(); } catch (_) {}
  if (TUI.active) {
    try { process.stdout.write('\x1b[?25h\x1b[?1049l'); } catch (_) {}
  }
});

function closeRL() {
  if (interactiveMode) return;
  try { rl.close(); } catch (_) {}
}

function question(prompt) {
  if (TUI.active && !TUI.suspended) {
    return TUI.askUser(prompt);
  }
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeXml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
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

// ─── Sleep & pause helper ──────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pauseBeforeMenu(seconds = 3) {
  if (TUI.active) return;
  if (!process.stdout.isTTY) {
    await sleep(seconds * 1000);
    return;
  }
  for (let i = seconds; i > 0; i--) {
    const line = `  ${c.gray}Returning to menu in ${i}s...${c.reset}`;
    process.stdout.write(`\r${line}${' '.repeat(8)}`);
    await sleep(1000);
  }
  process.stdout.write(`\r${' '.repeat(50)}\r`);
}

// ─── Generic walkers ───────────────────────────────────────────────────
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

function walkFilesRecursive(dir, filterFn) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...walkFilesRecursive(fullPath, filterFn));
    } else if (item.isFile() && filterFn(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function isImageFile(filePath) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(filePath);
}

function isCssFile(filePath) {
  return /\.css$/i.test(filePath);
}

function naturalSort(arr) {
  return arr.slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

// ─── Image size detector (no external deps) ────────────────────────────
function getImageSize(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xC0 && marker <= 0xCF &&
            marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return {
            height: buf.readUInt16BE(i + 5),
            width:  buf.readUInt16BE(i + 7),
          };
        }
        if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
          i += 2;
          continue;
        }
        if (i + 4 > buf.length) break;
        const len = buf.readUInt16BE(i + 2);
        if (len < 2) break;
        i += 2 + len;
      }
    }
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      const chunk = buf.slice(12, 16).toString();
      if (chunk === 'VP8 ') {
        const w = buf.readUInt16LE(26) & 0x3FFF;
        const h = buf.readUInt16LE(28) & 0x3FFF;
        return { width: w, height: h };
      } else if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return {
          width:  (b & 0x3FFF) + 1,
          height: ((b >> 14) & 0x3FFF) + 1,
        };
      } else if (chunk === 'VP8X') {
        const w = (buf.readUIntLE(24, 3)) + 1;
        const h = (buf.readUIntLE(27, 3)) + 1;
        return { width: w, height: h };
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

function getSvgSize(filePath) {
  try {
    const svg = fs.readFileSync(filePath, 'utf8');
    const vb = svg.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
    const wAttr = svg.match(/\bwidth=["'](\d+(?:\.\d+)?)/i);
    const hAttr = svg.match(/\bheight=["'](\d+(?:\.\d+)?)/i);
    const w = wAttr ? parseFloat(wAttr[1]) : (vb ? parseFloat(vb[1]) : 0);
    const h = hAttr ? parseFloat(hAttr[1]) : (vb ? parseFloat(vb[2]) : 0);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch (_) { /* ignore */ }
  return null;
}

// ─── Comic/manga helpers ───────────────────────────────────────────────
function isComicType(type) {
  return type === 'comic' || type === 'manga';
}

function defaultDirectionFor(type) {
  return type === 'manga' ? 'rtl' : 'ltr';
}

function chapterTitleFromFolder(folderName) {
  const m = folderName.match(/^(ch|chap|chapter|bab|vol|volume|v)[\s_-]*(\d+)$/i);
  if (m) {
    const prefix = m[1].toLowerCase();
    const num = m[2];
    if (prefix === 'bab') return `Bab ${num}`;
    if (prefix === 'vol' || prefix === 'volume' || prefix === 'v') return `Volume ${num}`;
    return `Chapter ${num}`;
  }
  return folderName;
}

function readChapterTitleOverride(folderPath) {
  const titleFile = path.join(folderPath, '_title.txt');
  if (fs.existsSync(titleFile)) {
    const tt = fs.readFileSync(titleFile, 'utf8').trim();
    if (tt) return tt;
  }
  return null;
}

// ─── EPUB-internal path helpers ────────────────────────────────────────
function epubPathToPosix(p) {
  return String(p).split(path.sep).join('/');
}

function epubRelative(fromEpubFile, toEpubFile) {
  const fromDir = path.posix.dirname(epubPathToPosix(fromEpubFile));
  return path.posix.relative(fromDir, epubPathToPosix(toEpubFile));
}

// ─── CSS helpers ───────────────────────────────────────────────────────
function collectCssFiles(epubDir, config) {
  const result = [];
  if (config && config.custom_css) {
    const list = config.custom_css.split(',').map(s => s.trim()).filter(Boolean);
    for (const rel of list) {
      const stripped = rel.replace(/^EPUB[\\/]/, '');
      const full = path.join(epubDir, stripped);
      if (fs.existsSync(full) && full.toLowerCase().endsWith('.css')) {
        result.push(epubPathToPosix(path.relative(epubDir, full)));
      }
    }
  }
  if (result.length === 0) {
    const stylesDir = path.join(epubDir, 'styles');
    if (fs.existsSync(stylesDir)) {
      const files = walkFilesRecursive(stylesDir, isCssFile);
      for (const f of naturalSort(files)) {
        result.push(epubPathToPosix(path.relative(epubDir, f)));
      }
    }
  }
  return result;
}

function buildCssLinks(fromXhtmlEpubPath, cssRelPaths) {
  if (!cssRelPaths || cssRelPaths.length === 0) return '';
  const fromDir = path.posix.dirname(epubPathToPosix(fromXhtmlEpubPath));
  return cssRelPaths.map(css => {
    const rel = path.posix.relative(fromDir, css);
    return `<link rel="stylesheet" type="text/css" href="${escapeXml(rel)}" />`;
  }).join('\n  ');
}

// ─── ord.txt parsing/writing ───────────────────────────────────────────
function parseOrdFile(ordPath, comicMode = false) {
  if (!fs.existsSync(ordPath)) return [];
  const content = fs.readFileSync(ordPath, 'utf8');
  const entries = [];
  for (let line of content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    let spread = null;
    if (comicMode) {
      if (line.startsWith('*')) { spread = 'center'; line = line.slice(1).trim(); }
      else if (line.startsWith('!')) { spread = 'single'; line = line.slice(1).trim(); }
    }

    let alt = null;
    if (comicMode) {
      const idx = line.indexOf('|');
      if (idx !== -1) {
        alt = line.slice(idx + 1).trim();
        line = line.slice(0, idx).trim();
      }
    }

    if (line) {
      entries.push({ path: line, alt, spread });
    }
  }
  return entries;
}

function writeOrdFile(ordPath, entries, comicMode = false) {
  const lines = [];
  if (comicMode) {
    lines.push('# Daftar urutan halaman (satu baris satu .xhtml, path relatif dari EPUB/xhtmls/)');
    lines.push('# Format: [*|!]path [| alt-text]');
    lines.push('#   *  = force page-spread-center (double spread)');
    lines.push('#   !  = force single spread');
    lines.push('#   (tanpa prefix) = auto-detect');
    lines.push('');
  } else {
    lines.push('# Daftar urutan bab (satu baris satu .xhtml)');
    lines.push('');
  }
  for (const e of entries) {
    let prefix = '';
    if (comicMode && e.spread === 'center') prefix = '*';
    else if (comicMode && e.spread === 'single') prefix = '!';
    const normPath = epubPathToPosix(String(e.path || ''));
    let line = `${prefix}${normPath}`;
    if (comicMode && e.alt) line += ` | ${e.alt}`;
    lines.push(line);
  }
  fs.writeFileSync(ordPath, lines.join('\n') + '\n', 'utf8');
}

// ─── Generate XHTML from image ─────────────────────────────────────────
function generatePageXhtml(imgHref, altText, w, h, fitMode = 'contain', cssLinks = '') {
  const viewport = (w && h) ? `width=${w}, height=${h}` : 'width=device-width, initial-scale=1';
  const fitCSS = {
    contain: 'width:100%;height:100%;object-fit:contain;',
    cover:   'width:100%;height:100%;object-fit:cover;',
    width:   'width:100%;height:auto;',
    height:  'height:100%;width:auto;',
    none:    'width:auto;height:auto;',
  }[fitMode] || 'width:100%;height:100%;object-fit:contain;';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8" />
  <title>Page</title>
  <meta name="viewport" content="${viewport}" />
  <meta name="epubcreator:fit_mode" content="${escapeXml(fitMode)}" />
  ${cssLinks}
  <style>
    html, body { margin:0; padding:0; height:100%; background:#000; }
    .epc-page { display:flex; align-items:center; justify-content:center; height:100%; }
    .epc-img { ${fitCSS} }
  </style>
</head>
<body class="epc-body">
  <div class="epc-page"><img class="epc-img" src="${escapeXml(imgHref)}" alt="${escapeXml(altText || '')}" /></div>
</body>
</html>
`;
}

// ─── Sync XHTML dari images ────────────────────────────────────────────
async function syncXhtmlFromImages(epubDir, opts = {}) {
  const silent = opts.silent === true;
  const force = opts.force === true;
  const fitMode = opts.fitMode || 'contain';
  const cssRelPaths = opts.cssRelPaths || [];

  const pagesDir = path.join(epubDir, 'images', 'pages');
  const xhtmlsDir = path.join(epubDir, 'xhtmls');

  if (!fs.existsSync(pagesDir)) {
    if (!silent) logI18n('img2x_pages_not_found', {}, 'error');
    return { generated: 0, skipped: 0, total: 0, generatedPaths: [] };
  }

  ensureDir(xhtmlsDir);

  const images = walkFilesRecursive(pagesDir, isImageFile);
  if (images.length === 0) {
    if (!silent) logI18n('img2x_no_images', {}, 'warn');
    return { generated: 0, skipped: 0, total: 0, generatedPaths: [] };
  }

  if (!silent) logI18n('img2x_images_found', { count: images.length }, 'info');

  let generated = 0;
  let skipped = 0;
  const generatedPaths = [];
  const hasCss = cssRelPaths.length > 0;

  for (const imgPath of images) {
    const relToPages = path.relative(pagesDir, imgPath);
    const relXhtml = relToPages.replace(/\.(png|jpe?g|gif|webp|svg)$/i, '.xhtml');
    const xhtmlPath = path.join(xhtmlsDir, relXhtml);
    ensureDir(path.dirname(xhtmlPath));

    const xhtmlDirPath = path.dirname(xhtmlPath);
    const imgRelToXhtml = path.relative(xhtmlDirPath, imgPath);
    const imgHref = epubPathToPosix(imgRelToXhtml);

    const xhtmlRelEpub = epubPathToPosix(path.relative(epubDir, xhtmlPath));
    const cssLinks = buildCssLinks(xhtmlRelEpub, cssRelPaths);

    let needGen = true;
    if (fs.existsSync(xhtmlPath) && !force) {
      try {
        const imgStat = fs.statSync(imgPath);
        const xhtmlStat = fs.statSync(xhtmlPath);
        if (xhtmlStat.mtimeMs >= imgStat.mtimeMs) {
          const content = fs.readFileSync(xhtmlPath, 'utf8');
          const fitMatch = content.match(/<meta\s+name="epubcreator:fit_mode"\s+content="([^"]*)"/i);
          const existingFit = fitMatch ? fitMatch[1] : null;
          const fitChanged = existingFit !== fitMode;
          const contentHasCss = /\.css["']/.test(content);
          const cssChanged = hasCss && !contentHasCss;
          if (!fitChanged && !cssChanged) {
            needGen = false;
          }
        }
      } catch (_) { needGen = true; }
    }

    if (!needGen) {
      skipped++;
      generatedPaths.push(epubPathToPosix(relXhtml));
      if (!silent) logI18n('img2x_skipped', { file: xhtmlPath }, 'info');
      continue;
    }

    const size = getImageSize(imgPath) || { width: 1200, height: 1600 };
    const xhtml = generatePageXhtml(imgHref, '', size.width, size.height, fitMode, cssLinks);
    fs.writeFileSync(xhtmlPath, xhtml, 'utf8');
    generated++;
    generatedPaths.push(epubPathToPosix(relXhtml));

    if (!silent) logI18n('img2x_generated', { file: xhtmlPath }, 'success');
  }

  return { generated, skipped, total: images.length, generatedPaths };
}

// ─── Chapter info extraction ───────────────────────────────────────────
function getChapterKey(relXhtmlPath) {
  const parts = relXhtmlPath.split(/[\\/]/);
  if (parts.length <= 1) return null;
  return parts[0];
}

function safeParseConfig() {
  const p = path.join(process.cwd(), 'config.txt');
  if (!fs.existsSync(p)) return null;
  try { return parseConfig(p); } catch (_) { return null; }
}

// ─── Command: convertch img2xhtml ──────────────────────────────────────
async function cmdImg2Xhtml(argv) {
  const epubDir = path.join(process.cwd(), 'EPUB');
  if (!fs.existsSync(epubDir)) {
    logI18n('img2x_epub_not_found', {}, 'error');
    closeRL();
    return;
  }

  const force = argv.includes('--force') || argv.includes('-f');
  const regenOrd = argv.includes('--regen-ord');

  let fitMode = null;
  const fitArg = argv.find(a => a.startsWith('--fit='));
  if (fitArg) {
    const v = fitArg.slice(6).toLowerCase();
    if (['contain', 'cover', 'width', 'height', 'none'].includes(v)) fitMode = v;
  }
  if (!fitMode) {
    const cfg = safeParseConfig();
    if (cfg && cfg.fit_mode) fitMode = cfg.fit_mode.toLowerCase();
  }
  if (!fitMode) fitMode = 'contain';

  const cfg = safeParseConfig();
  const cssRelPaths = collectCssFiles(epubDir, cfg);

  const result = await syncXhtmlFromImages(epubDir, { silent: false, force, fitMode, cssRelPaths });

  const ordPath = path.join(process.cwd(), 'ord.txt');
  const ordExists = fs.existsSync(ordPath);

  if (!ordExists) {
    const entries = naturalSort(result.generatedPaths).map(p => ({ path: p, alt: null, spread: null }));
    writeOrdFile(ordPath, entries, true);
    logI18n('img2x_ord_created', { file: ordPath }, 'success');
  } else if (regenOrd || force) {
    const ans = await question(t('img2x_ord_regen_confirm'));
    if (ans.trim().toLowerCase() === 'y') {
      const entries = naturalSort(result.generatedPaths).map(p => ({ path: p, alt: null, spread: null }));
      writeOrdFile(ordPath, entries, true);
      logI18n('img2x_ord_regen', { file: ordPath }, 'success');
    } else {
      logI18n('img2x_ord_cancelled', {}, 'warn');
    }
  } else {
    const existing = parseOrdFile(ordPath, true);
    const existingSet = new Set(existing.map(e => epubPathToPosix(e.path)));
    const newEntries = [];
    for (const p of naturalSort(result.generatedPaths)) {
      const norm = epubPathToPosix(p);
      if (!existingSet.has(norm)) {
        newEntries.push({ path: norm, alt: null, spread: null });
      }
    }
    if (newEntries.length === 0) {
      logI18n('img2x_ord_skip', {}, 'info');
    } else {
      const ans = await question(t('img2x_ord_exists'));
      if (ans.trim().toLowerCase() === 'y') {
        const merged = [...existing, ...newEntries];
        writeOrdFile(ordPath, merged, true);
        logI18n('img2x_ord_appended', { count: newEntries.length }, 'success');
      } else {
        logI18n('img2x_ord_skip', {}, 'info');
      }
    }
  }

  logI18n('img2x_summary', {
    success: result.generated,
    skipped: result.skipped,
    total: result.total,
  }, 'info');

  closeRL();
}

// ─── Chapter title detection ───────────────────────────────────────────
function chapterTitleFromFolderOrOverride(epubDir, folder) {
  const override = readChapterTitleOverride(path.join(epubDir, 'xhtmls', folder));
  if (override) return override;
  return chapterTitleFromFolder(folder);
}

// ─── Collect comic pages ───────────────────────────────────────────────
function collectComicPages(epubDir, ordPath) {
  const xhtmlsDir = path.join(epubDir, 'xhtmls');
  if (!fs.existsSync(xhtmlsDir)) {
    return [];
  }

  const allXhtml = walkFilesRecursive(xhtmlsDir, (p) => p.toLowerCase().endsWith('.xhtml'));
  if (allXhtml.length === 0) return [];

  const xhtmlRelSet = new Set(allXhtml.map(f => epubPathToPosix(path.relative(xhtmlsDir, f))));

  const ordEntries = parseOrdFile(ordPath, true);
  let ordered = [];

  if (ordEntries.length > 0) {
    for (const e of ordEntries) {
      const norm = epubPathToPosix(e.path);
      if (xhtmlRelSet.has(norm)) {
        ordered.push({ relPath: norm, alt: e.alt, spread: e.spread });
      } else {
        logI18n('warning_ord_not_found', { file: e.path }, 'warn');
      }
    }
    const orderedSet = new Set(ordered.map(o => o.relPath));
    const leftovers = naturalSort([...xhtmlRelSet].filter(p => !orderedSet.has(p)));
    for (const p of leftovers) {
      ordered.push({ relPath: p, alt: null, spread: null });
    }
  } else {
    ordered = naturalSort([...xhtmlRelSet]).map(p => ({ relPath: p, alt: null, spread: null }));
  }

  return ordered;
}

// ─── Collect back-matter XHTML ─────────────────────────────────────────
function collectBackMatter(epubDir) {
  const exclude = ['cover.xhtml', 'toc.xhtml', 'nav.xhtml', 'volume.opf'];
  const result = [];
  if (!fs.existsSync(epubDir)) return result;
  const items = fs.readdirSync(epubDir);
  for (const item of items) {
    const fullPath = path.join(epubDir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isFile() && item.toLowerCase().endsWith('.xhtml')) {
      if (exclude.includes(item.toLowerCase())) continue;
      let title = path.basename(item, '.xhtml');
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (/<nav\b[^>]*epub:type=["']toc["']/i.test(content)) continue;
        if (/epub:type=["']toc["']/i.test(content) && !/<img\b/i.test(content)) continue;
        if (/<nav\b/i.test(content) && !/<img\b/i.test(content)) continue;
        const m = content.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (m) title = m[1].trim();
      } catch (_) { /* ignore */ }
      result.push({ path: item, title });
    }
  }
  return naturalSort(result.map(r => r.path)).map(p => result.find(r => r.path === p));
}

// ─── Double-spread detection ───────────────────────────────────────────
function detectDoubleSpread(epubDir, relPagePath) {
  const imgDir = path.join(epubDir, 'images', 'pages');
  const ext = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const baseRel = relPagePath.replace(/\.xhtml$/i, '');
  for (const e of ext) {
    const imgPath = path.join(imgDir, baseRel + e);
    if (fs.existsSync(imgPath)) {
      let size = getImageSize(imgPath);
      if (!size && e === '.svg') size = getSvgSize(imgPath);
      if (size && size.height > 0) {
        const ratio = size.width / size.height;
        if (ratio > 1.4) return { double: true, ratio };
        return { double: false, ratio };
      }
      break;
    }
  }
  return { double: false, ratio: 1 };
}

// ─── XHTML renderer ────────────────────────────────────────────────────
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

// ─── Download & ekstrak ───────────────────────────────────────────────
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
async function cmdCreateDir(argv) {
  const cwd = process.cwd();

  const settings = loadSettings();
  let typeArg = argv.find(a => !a.startsWith('--'));
  let type = typeArg ? typeArg.toLowerCase() : null;

  if (!typeArg) {
    const def = (settings.default_type || 'textbook').toLowerCase();
    const ans = await question(t('createdir_type_prompt', { default: def }));
    type = (ans.trim() || def).toLowerCase();
  }

  if (!VALID_TYPES.includes(type)) {
    logI18n('createdir_invalid_type', { type }, 'warn');
    type = 'textbook';
  }

  if (type === 'textbook') {
    await createTextbookStructure();
  } else {
    await createComicStructure(type);
  }

  const epubCreatorDir = path.join(cwd, TOOL_DIR);
  if (fs.existsSync(epubCreatorDir)) {
    const ans = await question(`.epubcreator already exists. Update from config branch? (y/n) `);
    if (ans.toLowerCase() === 'y') {
      logI18n('createdir_update_config', {}, 'info');
      try {
        const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/config.tar.gz';
        await downloadAndExtract(url, cwd, '.epubcreator', 1);
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

  const nodeModulesDir = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    logI18n('node_modules_missing', {}, 'warn');
    const ans = await question(t('download_confirm'));
    if (ans.toLowerCase() === 'y') {
      try {
        const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/modules.tar.gz';
        await downloadAndExtract(url, cwd, 'node_modules', 1);
        logI18n('extract_success', {}, 'success');
      } catch (err) {
        logI18n('extract_failed', { error: err.message }, 'error');
      }
    } else {
      logI18n('cancelled', {}, 'warn');
    }
  } else {
    log('node_modules already exists, skipping download.', 'info');
  }

  logI18n('ready', {}, 'success');
  closeRL();
}

async function createTextbookStructure() {
  const cwd = process.cwd();
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

  logI18n('dir_created', { dirs: [epubDir, markdownsDir, docsDir].join(', ') }, 'info');

  const configTemplate = buildTextbookConfigTemplate();
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, configTemplate, 'utf8');
    logI18n('created', { file: 'config.txt' }, 'success');
  } else {
    const ans = await question(t('file_exists', { file: 'config.txt' }));
    if (ans.toLowerCase() === 'y') {
      fs.writeFileSync(configPath, configTemplate, 'utf8');
      logI18n('overwritten', { file: 'config.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'config.txt' }, 'warn');
    }
  }

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
}

async function createComicStructure(type) {
  const cwd = process.cwd();
  const epubDir = path.join(cwd, 'EPUB');
  const imagesDir = path.join(epubDir, 'images');
  const pagesDir = path.join(imagesDir, 'pages');
  const xhtmlsDir = path.join(epubDir, 'xhtmls');
  const stylesDir = path.join(epubDir, 'styles');
  const audioDir = path.join(epubDir, 'audiovideo');
  const configPath = path.join(cwd, 'config.txt');
  const ordPath = path.join(cwd, 'ord.txt');

  ensureDir(epubDir);
  ensureDir(imagesDir);
  ensureDir(pagesDir);
  ensureDir(xhtmlsDir);
  ensureDir(stylesDir);
  ensureDir(audioDir);

  const chapAns = await question(t('createdir_chapters_prompt'));
  const hasChapters = chapAns.trim().toLowerCase() === 'y';

  const defDir = defaultDirectionFor(type);
  const dirAns = await question(t('createdir_direction_prompt', { default: defDir }));
  let direction = (dirAns.trim() || defDir).toLowerCase();
  if (!['ltr', 'rtl'].includes(direction)) {
    logI18n('createdir_invalid_direction', { dir: direction }, 'warn');
    direction = defDir;
  }

  if (hasChapters) {
    ensureDir(path.join(pagesDir, 'ch1'));
    ensureDir(path.join(xhtmlsDir, 'ch1'));
    ensureDir(path.join(pagesDir, 'ch2'));
    ensureDir(path.join(xhtmlsDir, 'ch2'));
  }

  logI18n('dir_created', { dirs: [epubDir, pagesDir, xhtmlsDir].join(', ') }, 'info');

  const configTemplate = buildComicConfigTemplate(type, direction);
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, configTemplate, 'utf8');
    logI18n('created', { file: 'config.txt' }, 'success');
  } else {
    const ans = await question(t('file_exists', { file: 'config.txt' }));
    if (ans.toLowerCase() === 'y') {
      fs.writeFileSync(configPath, configTemplate, 'utf8');
      logI18n('overwritten', { file: 'config.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'config.txt' }, 'warn');
    }
  }

  const ordTemplate = [
    '# Daftar urutan halaman (satu baris satu .xhtml, path relatif dari EPUB/xhtmls/)',
    '# Format: [*|!]path [| alt-text]',
    '#   *  = force page-spread-center (double spread)',
    '#   !  = force single spread',
    '#   (tanpa prefix) = auto-detect',
    '#',
    '# Contoh:',
    '#   ch1/0001.xhtml | Haruko masuk ke kafe',
    '#   ch1/0002.xhtml | "Kamu ke mana?"',
    '#   *ch2/0001.xhtml | Double spread opening',
    '#',
    '# Kosongkan file ini untuk auto-sort. Jalankan "convertch img2xhtml" untuk generate otomatis.',
    '',
  ].join('\n');

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

  console.log('');
  log(t('createdir_cover_hint'), 'warn');
  log(t('createdir_pages_hint'), 'warn');
  log(t('createdir_styles_hint'), 'info');
}

function buildTextbookConfigTemplate() {
  return `# ============================================================
#  METADATA BUKU  -  edit nilai di bawah ini sesuai kebutuhan
# ============================================================

# Tipe buku: textbook | comic | manga
type: textbook

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
#  KONVERSI DOCX -> MARKDOWN (opsional)
# ============================================================
# [docx-mapping]
# heading1 = 24
# heading2 = 18
# heading3 = 14

# ============================================================
#  STRUKTUR DIREKTORI (textbook):
#
#   ./
#   |-- config.txt
#   |-- ord.txt          <- opsional
#   |-- Docs/            <- .docx sumber
#   |-- Markdowns/       <- .md sumber
#   |-- EPUB/
#       |-- images/
#       |   |-- cover.png   <- WAJIB ada
#       |-- audiovideo/     <- opsional
#       |-- bab1.xhtml      <- bab (di root EPUB/)
#
#  Jalankan:  node epubcreator.js build
# ============================================================
`;
}

function buildComicConfigTemplate(type, direction) {
  return `# ============================================================
#  METADATA BUKU  -  edit nilai di bawah ini sesuai kebutuhan
# ============================================================

# Tipe buku: textbook | comic | manga
type: ${type}

# Arah baca: ltr | rtl
reading_direction: ${direction}

# Sifat spread: auto | none | landscape | both
spread: auto

# Fit mode gambar halaman: contain | cover | width | height | none
fit_mode: contain

# CSS custom (opsional). Kosongkan untuk auto-detect dari EPUB/styles/
custom_css: 

# Judul utama (wajib)
title: Judul Komik

# Subjudul (opsional)
subtitle: 

# Volume / jilid (opsional)
volume: 

# Penulis / creator (wajib)
author: Nama Penulis

# Bahasa (default: en)
language: en

# Identifier unik, kosongkan untuk otomatis
identifier: 

# Tanggal terbit (YYYY-MM-DD)
date: 

# Penerbit (opsional)
publisher: 

# Deskripsi / sinopsis (opsional)
description: 

# Subjek / kategori, pisahkan dengan koma
subjects: 

# Nama seri (opsional)
series_name: 

# Nomor seri (opsional)
series_number: 

# Kontributor tambahan: nama|peran, nama|peran
contributors: 

# Judul tambahan (opsional)
extra_titles: 

# ============================================================
#  STRUKTUR DIREKTORI (comic/manga):
#
#   ./
#   |-- config.txt
#   |-- ord.txt             <- opsional: [*|!]path [| alt]
#   |-- EPUB/
#       |-- images/
#       |   |-- cover.jpg   <- WAJIB ada
#       |   |-- pages/
#       |       |-- ch1/
#       |       |   |-- 0001.jpg
#       |       |-- ch2/
#       |           |-- 0001.jpg
#       |-- xhtmls/         <- auto-generate via "convertch img2xhtml"
#       |-- styles/         <- opsional custom CSS
#       |-- about.xhtml     <- back-matter (opsional, reflowable)
#
#  Alur:
#    1. Taruh gambar halaman di EPUB/images/pages/
#    2. node epubcreator.js convertch img2xhtml
#    3. node epubcreator.js build
# ============================================================
`;
}

// ─── Konversi MD->XHTML ──────────────────────────────────────────────
async function convertOneMdFile(mdFile, outputDir, force = false, marked) {
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
    const choice = (answer || '').toLowerCase();
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
      closeRL();
      return;
    }
  } else {
    target = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(target)) {
      logI18n('path_not_found', { path: target }, 'error');
      closeRL();
      return;
    }
  }

  const stat = fs.statSync(target);
  const outputDir = path.join(process.cwd(), 'EPUB');
  ensureDir(outputDir);

  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.md')) {
      logI18n('must_be_md', {}, 'error');
      closeRL();
      return;
    }
    await convertOneMdFile(target, outputDir, force, marked);
    closeRL();
    return;
  }

  if (stat.isDirectory()) {
    const mdFiles = walkMdFiles(target);
    if (mdFiles.length === 0) {
      logI18n('no_md_found', {}, 'warn');
      closeRL();
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
      const choice = (answer || '').toLowerCase();
      if (choice === 'c') {
        logI18n('convert_cancelled', {}, 'warn');
        closeRL();
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
        closeRL();
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

    const settings = loadSettings();
    if (settings.auto_build === 'true' && successCount > 0) {
      log('Auto-build enabled, building...', 'info');
      await buildEpub(require('archiver'));
    }

    closeRL();
    return;
  }

  logI18n('invalid_path', {}, 'error');
  closeRL();
}

// ─── XHTML->MD ─────────────────────────────────────────────────────────
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
      closeRL();
      return;
    }
  } else {
    target = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(target)) {
      logI18n('path_not_found', { path: target }, 'error');
      closeRL();
      return;
    }
  }

  const stat = fs.statSync(target);
  const outputDir = path.join(process.cwd(), 'Markdowns');
  ensureDir(outputDir);

  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.xhtml')) {
      logI18n('must_be_xhtml', {}, 'error');
      closeRL();
      return;
    }
    const base = path.basename(target).toLowerCase();
    if (['cover.xhtml', 'toc.xhtml', 'nav.xhtml'].includes(base)) {
      logI18n('skip_cover', { file: base }, 'warn');
      closeRL();
      return;
    }
    convertOneXhtmlFile(target, outputDir, TurndownService);
    closeRL();
    return;
  }

  if (stat.isDirectory()) {
    const xhtmlFiles = walkXhtmlFiles(target);
    if (xhtmlFiles.length === 0) {
      logI18n('no_xhtml_found', {}, 'warn');
      closeRL();
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
    closeRL();
    return;
  }

  logI18n('invalid_path', {}, 'error');
  closeRL();
}

// ─── DOCX->MD ──────────────────────────────────────────────────────────
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
    closeRL();
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
      closeRL();
      return;
    }
  } else {
    logI18n('path_not_found', { path: inputPath }, 'error');
    closeRL();
    return;
  }

  if (docxFiles.length === 0) {
    log(t('docx_no_files'), 'warn');
    closeRL();
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
          if ((ans || '').toLowerCase() !== 'y') {
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
            if ((ans || '').toLowerCase() !== 'y') {
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

  log('Selesai.', 'success');
  closeRL();
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
    closeRL();
    return;
  }

  const target = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(target)) {
    logI18n('path_not_found', { path: target }, 'error');
    closeRL();
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
      closeRL();
      return;
    }
    mdFiles = [target];
  } else if (stat.isDirectory()) {
    mdFiles = walkMdFiles(target);
  } else {
    logI18n('invalid_path', {}, 'error');
    closeRL();
    return;
  }

  if (mdFiles.length === 0) {
    logI18n('no_md_found', {}, 'warn');
    closeRL();
    return;
  }

  let successCount = 0;
  for (const mdFile of mdFiles) {
    logI18n('split_processing', { file: path.basename(mdFile) }, 'info');

    try {
      const content = fs.readFileSync(mdFile, 'utf8');
      const parts = content.split(/(?=^##\s+)/m).filter(p => p.trim() !== '');

      if (parts.length === 0) {
        logI18n('split_no_heading', { file: path.basename(mdFile) }, 'warn');
        const baseName = path.basename(mdFile, '.md');
        const dest = path.join(outDir, `${baseName}.md`);
        if (fs.existsSync(dest) && !force) {
          const ans = await question(t('file_exists', { file: path.basename(dest) }));
          if ((ans || '').toLowerCase() !== 'y') {
            logI18n('skip_file', { file: path.basename(dest) }, 'warn');
            continue;
          }
        }
        fs.writeFileSync(dest, content, 'utf8');
        logI18n('split_created', { file: dest }, 'success');
        successCount++;
      } else {
        const baseName = path.basename(mdFile, '.md');
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const num = i + 1;
          const dest = path.join(outDir, `${baseName}-p${num}.md`);
          if (fs.existsSync(dest) && !force) {
            const ans = await question(t('file_exists', { file: path.basename(dest) }));
            if ((ans || '').toLowerCase() !== 'y') {
              logI18n('skip_file', { file: path.basename(dest) }, 'warn');
              continue;
            }
          }
          fs.writeFileSync(dest, part, 'utf8');
          logI18n('split_created', { file: dest }, 'success');
        }
        logI18n('split_parts', { count: parts.length }, 'info');
        successCount++;
      }
    } catch (err) {
      logI18n('convert_fail', { file: path.basename(mdFile), error: err.message }, 'error');
    }
  }

  logI18n('split_summary', { success: successCount, total: mdFiles.length }, 'info');
  closeRL();
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
    closeRL();
    return;
  }

  const target = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(target)) {
    logI18n('path_not_found', { path: target }, 'error');
    closeRL();
    return;
  }

  let mdFiles = [];
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (!target.toLowerCase().endsWith('.md')) {
      logI18n('must_be_md', {}, 'error');
      closeRL();
      return;
    }
    mdFiles = [target];
  } else if (stat.isDirectory()) {
    mdFiles = walkMdFiles(target);
  } else {
    logI18n('invalid_path', {}, 'error');
    closeRL();
    return;
  }

  if (mdFiles.length === 0) {
    logI18n('merge_no_files', { path: target }, 'warn');
    closeRL();
    return;
  }

  mdFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  logI18n('merge_processing', { count: mdFiles.length }, 'info');

  const outPath = path.resolve(process.cwd(), outputFile);
  if (fs.existsSync(outPath) && !force) {
    const ans = await question(t('file_exists', { file: path.basename(outPath) }));
    if ((ans || '').toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      closeRL();
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

  closeRL();
}

// ─── Build core ────────────────────────────────────────────────────────
async function buildEpub(archiver) {
  const cwd = process.cwd();

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

  const type = (config.type || 'textbook').toLowerCase();
  if (isComicType(type)) {
    return await buildComicEpub(archiver, config, epubDir, type);
  }
  return await buildTextbookEpub(archiver, config, epubDir);
}

// ─── Build: textbook ──────────────────────────────────────────────────
async function buildTextbookEpub(archiver, config, epubDir) {
  const cwd = process.cwd();
  const rootName = path.basename(cwd);
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
    media,
    { type: 'textbook', readingDirection: 'ltr', spread: 'none', backMatter: [] }
  );

  const tocContent = generateToc(chapters, { comic: false });
  const coverContent = generateCoverXhtml(media.cover, null, { comic: false });
  const containerContent = generateContainer();

  const output = fs.createWriteStream(epubPath);
  const archive = archiver('zip', { zlib: { level: 6 } });

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

// ─── Build: comic / manga ─────────────────────────────────────────────
async function buildComicEpub(archiver, config, epubDir, type) {
  const cwd = process.cwd();
  const rootName = path.basename(cwd);
  const ordPath = path.join(cwd, 'ord.txt');

  const direction = (config.reading_direction || defaultDirectionFor(type)).toLowerCase();
  const spread = (config.spread || 'auto').toLowerCase();
  const fitMode = (config.fit_mode || 'contain').toLowerCase();

  logI18n('comic_mode', { type, direction, spread }, 'info');

  const cssRelPaths = collectCssFiles(epubDir, config);
  if (cssRelPaths.length > 0) {
    logI18n('comic_css_found', { list: cssRelPaths.join(', ') }, 'info');
  }

  logI18n('comic_syncing', {}, 'info');
  await syncXhtmlFromImages(epubDir, { silent: true, force: false, fitMode, cssRelPaths });

  const pages = collectComicPages(epubDir, ordPath);
  if (pages.length === 0) {
    logI18n('comic_xhtmls_missing', {}, 'error');
    return;
  }
  logI18n('comic_pages_found', { count: pages.length }, 'info');

  const media = collectMediaComic(epubDir);
  if (!media.cover) {
    logI18n('cover_missing', {}, 'warn');
  } else {
    logI18n('cover_found', { file: media.cover }, 'info');
  }
  logI18n('media_summary', { images: media.pages.length + media.illustrations.length, audio: media.audio.length }, 'info');

  const backMatter = collectBackMatter(epubDir);

  const chapters = [];
  let currentSide = (direction === 'rtl') ? 'right' : 'left';
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    let spreadProp = null;
    let isCenter = false;

    if (p.spread === 'center') {
      spreadProp = 'page-spread-center';
      isCenter = true;
    } else if (p.spread === 'single') {
      spreadProp = currentSide === 'left' ? 'page-spread-left' : 'page-spread-right';
    } else {
      const det = detectDoubleSpread(epubDir, p.relPath);
      if (det.double) {
        logI18n('comic_double_detected', { page: i + 1, ratio: det.ratio.toFixed(2) }, 'info');
        spreadProp = 'page-spread-center';
        isCenter = true;
      } else {
        spreadProp = currentSide === 'left' ? 'page-spread-left' : 'page-spread-right';
      }
    }

    if (isCenter) {
      currentSide = (direction === 'rtl') ? 'right' : 'left';
    } else {
      currentSide = currentSide === 'left' ? 'right' : 'left';
    }

    let title = p.alt;
    if (!title) {
      const xhtmlPath = path.join(epubDir, 'xhtmls', p.relPath);
      try {
        const content = fs.readFileSync(xhtmlPath, 'utf8');
        const m = content.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (m && m[1].trim() && m[1].trim().toLowerCase() !== 'page') {
          title = m[1].trim();
        }
      } catch (_) { /* ignore */ }
    }
    if (!title) title = `Page ${i + 1}`;

    chapters.push({
      path: `xhtmls/${p.relPath}`,
      title,
      spread: spreadProp,
      chapter: getChapterKey(p.relPath),
      imageRelPath: null,
    });
  }

  const buildsDir = path.join(cwd, 'builds');
  ensureDir(buildsDir);
  const epubFilename = `${rootName}.epub`;
  const epubPath = path.join(buildsDir, epubFilename);

  let coverSize = null;
  if (media.cover) {
    coverSize = getImageSize(path.join(epubDir, 'images', media.cover));
  }

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
    media,
    { type, readingDirection: direction, spread, backMatter, cssRelPaths }
  );

  const tocContent = generateToc(chapters, {
    comic: true,
    chapterTitles: buildChapterTitleMap(epubDir, chapters),
  });
  const coverContent = generateCoverXhtml(media.cover, coverSize, { comic: true, cssRelPaths });
  const containerContent = generateContainer();

  const output = fs.createWriteStream(epubPath);
  const archive = archiver('zip', { zlib: { level: 6 } });

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

    const xhtmlsDir = path.join(epubDir, 'xhtmls');
    if (fs.existsSync(xhtmlsDir)) {
      const xhtmls = walkFilesRecursive(xhtmlsDir, (p) => p.toLowerCase().endsWith('.xhtml'));
      for (const xf of xhtmls) {
        const rel = path.relative(epubDir, xf);
        archive.file(xf, { name: `EPUB/${epubPathToPosix(rel)}` });
      }
    }

    const imagesDir = path.join(epubDir, 'images');
    if (fs.existsSync(imagesDir)) {
      const imgs = walkFilesRecursive(imagesDir, isImageFile);
      for (const img of imgs) {
        const rel = path.relative(epubDir, img);
        archive.file(img, { name: `EPUB/${epubPathToPosix(rel)}` });
      }
    }

    const stylesDir = path.join(epubDir, 'styles');
    if (fs.existsSync(stylesDir)) {
      const cssFiles = walkFilesRecursive(stylesDir, isCssFile);
      for (const cf of cssFiles) {
        const rel = path.relative(epubDir, cf);
        archive.file(cf, { name: `EPUB/${epubPathToPosix(rel)}` });
      }
    }

    const audioDir = path.join(epubDir, 'audiovideo');
    if (fs.existsSync(audioDir)) {
      const files = walkFilesRecursive(audioDir, () => true);
      for (const f of files) {
        const rel = path.relative(epubDir, f);
        archive.file(f, { name: `EPUB/${epubPathToPosix(rel)}` });
      }
    }

    const excludeRoot = ['cover.xhtml', 'toc.xhtml', 'nav.xhtml', 'volume.opf'];
    const allEpubFiles = fs.readdirSync(epubDir);
    for (const item of allEpubFiles) {
      if (excludeRoot.includes(item.toLowerCase())) continue;
      const src = path.join(epubDir, item);
      if (fs.statSync(src).isDirectory()) continue;
      if (item.toLowerCase().endsWith('.xhtml')) {
        archive.file(src, { name: `EPUB/${item}` });
      }
    }

    archive.finalize();
  });
}

function buildChapterTitleMap(epubDir, chapters) {
  const map = {};
  for (const ch of chapters) {
    if (ch.chapter && !map[ch.chapter]) {
      map[ch.chapter] = chapterTitleFromFolderOrOverride(epubDir, ch.chapter);
    }
  }
  return map;
}

// ─── Debug ─────────────────────────────────────────────────────────────
// Catatan desain:
//   - cmdDebug dan turunannya TIDAK lagi menerima param onStop.
//   - Mereka mengembalikan Promise yang resolve saat _activeDebugStop() dipanggil.
//   - Handler SIGINT manual dihapus, sehingga Ctrl+C (SIGINT) = kill program
//     secara default saat di CLI / fallback dengan cooked mode.
//   - Selama debug di TUI, raw mode aktif, sehingga Ctrl+C datang sebagai byte
//     \x03; TUI.handleDebugInput yang menerjemahkannya (stop debug + exit TUI).
async function cmdDebug(archiver, marked) {
  const cwd = process.cwd();
  const configPath = path.join(cwd, 'config.txt');
  let type = 'textbook';
  if (fs.existsSync(configPath)) {
    try {
      const cfg = parseConfig(configPath);
      type = (cfg.type || 'textbook').toLowerCase();
    } catch (_) { /* ignore */ }
  }

  if (isComicType(type)) {
    return await cmdDebugComic(archiver, type);
  }
  return await cmdDebugTextbook(archiver, marked);
}

async function cmdDebugTextbook(archiver, marked) {
  const markdownsDir = path.join(process.cwd(), 'Markdowns');
  const epubDir = path.join(process.cwd(), 'EPUB');

  if (!fs.existsSync(markdownsDir)) {
    logI18n('markdowns_not_found', {}, 'error');
    return;
  }
  if (!fs.existsSync(epubDir)) {
    logI18n('epub_dir_not_found', {}, 'error');
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
        await convertAllMd(markdownsDir, epubDir, true, marked);
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

  return new Promise((resolve) => {
    const stop = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      if (watcher) { try { watcher.close(); } catch (_) {} watcher = null; }
      if (_activeDebugStop === stop) _activeDebugStop = null;
      resolve();
    };
    _activeDebugStop = stop;
  });
}

async function cmdDebugComic(archiver, type) {
  const epubDir = path.join(process.cwd(), 'EPUB');
  const pagesDir = path.join(epubDir, 'images', 'pages');

  if (!fs.existsSync(pagesDir)) {
    logI18n('comic_pages_dir_missing', {}, 'error');
    return;
  }

  logI18n('debug_start_comic', {}, 'info');

  let debounceTimer = null;
  const settings = loadSettings();
  const debounceDelay = parseInt(settings.watch_delay) || 500;

  const cfg = safeParseConfig();
  const fitMode = (cfg && cfg.fit_mode) ? cfg.fit_mode.toLowerCase() : 'contain';
  const cssRelPaths = collectCssFiles(epubDir, cfg);

  const onChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      logI18n('debug_change', {}, 'info');
      try {
        await syncXhtmlFromImages(epubDir, { silent: true, force: false, fitMode, cssRelPaths });
        await buildEpub(archiver);
        logI18n('debug_watching_again', {}, 'info');
      } catch (err) {
        logI18n('debug_error', { error: err.message }, 'error');
      }
    }, debounceDelay);
  };

  let watcher;
  try {
    watcher = fs.watch(pagesDir, { recursive: true }, (eventType, filename) => {
      if (filename && !isImageFile(filename)) return;
      onChange();
    });
  } catch (err) {
    logI18n('debug_watch_fallback', {}, 'warn');
    watcher = fs.watch(pagesDir, (eventType, filename) => {
      if (filename && !isImageFile(filename)) return;
      onChange();
    });
  }

  return new Promise((resolve) => {
    const stop = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      if (watcher) { try { watcher.close(); } catch (_) {} watcher = null; }
      if (_activeDebugStop === stop) _activeDebugStop = null;
      resolve();
    };
    _activeDebugStop = stop;
  });
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

  config.type = (config.type || 'textbook').toLowerCase();
  if (!VALID_TYPES.includes(config.type)) config.type = 'textbook';

  return config;
}

// ─── Chapter collection (textbook) ─────────────────────────────────────
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
    order = naturalSort(xhtmlFiles);
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

// ─── Media collection (textbook) ───────────────────────────────────────
function collectMedia(epubDir) {
  const imagesDir = path.join(epubDir, 'images');
  const audioDir = path.join(epubDir, 'audiovideo');
  const result = { images: [], audio: [], cover: null };

  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    for (const f of files) {
      const full = path.join(imagesDir, f);
      if (fs.statSync(full).isDirectory()) continue;
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
      const full = path.join(audioDir, f);
      if (fs.statSync(full).isDirectory()) continue;
      if (/\.(mp3|m4a|ogg|wav|mp4|webm)$/i.test(f)) {
        result.audio.push(f);
      }
    }
  }
  return result;
}

// ─── Media collection (comic) ──────────────────────────────────────────
function collectMediaComic(epubDir) {
  const imagesDir = path.join(epubDir, 'images');
  const pagesDir = path.join(imagesDir, 'pages');
  const audioDir = path.join(epubDir, 'audiovideo');
  const result = { cover: null, illustrations: [], pages: [], audio: [] };

  if (fs.existsSync(imagesDir)) {
    const items = fs.readdirSync(imagesDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) continue;
      const f = item.name;
      if (!isImageFile(f)) continue;
      if (/^cover\./i.test(f)) {
        result.cover = f;
      } else {
        result.illustrations.push(f);
      }
    }
  }

  if (fs.existsSync(pagesDir)) {
    const pages = walkFilesRecursive(pagesDir, isImageFile);
    for (const p of pages) {
      result.pages.push(path.relative(epubDir, p));
    }
  }

  if (fs.existsSync(audioDir)) {
    const files = walkFilesRecursive(audioDir, (f) => /\.(mp3|m4a|ogg|wav|mp4|webm)$/i.test(f));
    for (const f of files) {
      result.audio.push(path.relative(audioDir, f));
    }
  }

  return result;
}

// ─── MIME type ─────────────────────────────────────────────────────────
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
    '.css': 'text/css',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── OPF generation ────────────────────────────────────────────────────
function generateOpf(config, chapters, media, options) {
  const { mainTitle, subTitle, volume, creator, language, identifier, date,
    publisher, description, subjects, seriesName, seriesNumber,
    contributors, extraTitles } = config;

  const isComic = isComicType(options.type);
  const direction = options.readingDirection || (isComic ? defaultDirectionFor(options.type) : 'ltr');
  const spread = options.spread || (isComic ? 'auto' : 'none');
  const backMatter = options.backMatter || [];
  const cssRelPaths = options.cssRelPaths || [];

  const metadata = [];
  const titles = [mainTitle || 'Untitled'];
  if (subTitle) titles.push(subTitle);
  if (volume) titles.push(volume);
  for (const tt of extraTitles) {
    if (tt.trim()) titles.push(tt.trim());
  }
  for (const tt of titles) {
    metadata.push(`<dc:title>${escapeXml(tt)}</dc:title>`);
  }

  if (creator) {
    metadata.push(`<dc:creator id="creator">${escapeXml(creator)}</dc:creator>`);
  }

  for (const cc of contributors) {
    const role = cc.role || 'ctb';
    if (role === 'aut' && !creator) {
      metadata.push(`<dc:creator id="creator">${escapeXml(cc.name)}</dc:creator>`);
    } else {
      const roleLabel = role === 'aut' ? 'author' : (role === 'edt' ? 'editor' : role);
      metadata.push(`<dc:contributor>${escapeXml(cc.name)} (${roleLabel})</dc:contributor>`);
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

  if (isComic) {
    metadata.push(`<meta property="rendition:layout">prepaginated</meta>`);
    metadata.push(`<meta property="rendition:orientation">auto</meta>`);
    metadata.push(`<meta property="rendition:spread">${escapeXml(spread)}</meta>`);
    metadata.push(`<meta property="schema:accessMode">visual</meta>`);
    metadata.push(`<meta property="schema:accessMode">textual</meta>`);
    metadata.push(`<meta property="schema:accessibilityFeature">tableOfContents</meta>`);
    metadata.push(`<meta property="schema:accessibilityHazard">none</meta>`);
    metadata.push(`<meta property="schema:accessModeSufficient">visual</meta>`);
    metadata.push(`<meta property="schema:accessModeSufficient">textual</meta>`);
  } else {
    metadata.push(`<meta property="rendition:layout">reflowable</meta>`);
    metadata.push(`<meta property="schema:accessMode">textual</meta>`);
    metadata.push(`<meta property="schema:accessibilityFeature">tableOfContents</meta>`);
    metadata.push(`<meta property="schema:accessibilityHazard">none</meta>`);
    metadata.push(`<meta property="schema:accessModeSufficient">textual</meta>`);
  }

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

  manifest.push(`<item id="cover-xhtml" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
  if (isComic) {
    spine.push(`<itemref idref="cover-xhtml" linear="yes" properties="page-spread-center"/>`);
  } else {
    spine.push(`<itemref idref="cover-xhtml" linear="yes"/>`);
  }

  manifest.push(`<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  spine.push(`<itemref idref="toc" linear="no"/>`);

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const id = isComic ? `page_${i}` : `chap_${i}`;
    const href = ch.path;
    manifest.push(`<item id="${id}" href="${escapeXml(href)}" media-type="application/xhtml+xml"/>`);
    if (isComic && ch.spread) {
      spine.push(`<itemref idref="${id}" linear="yes" properties="${ch.spread}"/>`);
    } else {
      spine.push(`<itemref idref="${id}" linear="yes"/>`);
    }
  }

  if (isComic) {
    for (let i = 0; i < backMatter.length; i++) {
      const bm = backMatter[i];
      const bmBase = path.basename(bm.path).toLowerCase();
      if (['nav.xhtml', 'toc.xhtml', 'cover.xhtml'].includes(bmBase)) continue;
      const id = `back_${i}`;
      manifest.push(`<item id="${id}" href="${escapeXml(bm.path)}" media-type="application/xhtml+xml" properties="rendition:layout-reflowable"/>`);
      spine.push(`<itemref idref="${id}" linear="yes"/>`);
    }
  }

  for (let i = 0; i < cssRelPaths.length; i++) {
    const cssRel = cssRelPaths[i];
    manifest.push(`<item id="css_${i}" href="${escapeXml(cssRel)}" media-type="text/css"/>`);
  }

  if (isComic) {
    for (let i = 0; i < media.illustrations.length; i++) {
      const img = media.illustrations[i];
      const id = `img_${i}_${String(img).replace(/[^a-zA-Z0-9]/g, '_')}`;
      const href = `images/${img}`;
      manifest.push(`<item id="${id}" href="${escapeXml(href)}" media-type="${getMimeType(img)}"/>`);
    }
    for (let i = 0; i < media.pages.length; i++) {
      const norm = epubPathToPosix(media.pages[i]);
      const id = `pimg_${i}_${norm.replace(/[^a-zA-Z0-9]/g, '_')}`;
      manifest.push(`<item id="${id}" href="${escapeXml(norm)}" media-type="${getMimeType(norm)}"/>`);
    }
  } else {
    for (let i = 0; i < media.images.length; i++) {
      const img = media.images[i];
      if (img === media.cover) continue;
      const id = `img_${i}_${img.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const href = `images/${img}`;
      manifest.push(`<item id="${id}" href="${escapeXml(href)}" media-type="${getMimeType(img)}"/>`);
    }
  }

  for (let i = 0; i < media.audio.length; i++) {
    const av = media.audio[i];
    const id = `av_${i}_${String(av).replace(/[^a-zA-Z0-9]/g, '_')}`;
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
  <spine page-progression-direction="${escapeXml(direction)}">
    ${spine.join('\n    ')}
  </spine>
</package>
`;
  return opf;
}

// ─── TOC generation ────────────────────────────────────────────────────
function generateToc(chapters, options = {}) {
  const comic = options.comic === true;

  if (!comic) {
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

  const chapterMap = options.chapterTitles || {};
  const grouped = new Map();
  let hasChapters = false;

  for (const ch of chapters) {
    const key = ch.chapter || '__flat__';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(ch);
    if (ch.chapter) hasChapters = true;
  }

  let items = '';

  if (hasChapters) {
    const orderedKeys = [];
    const seen = new Set();
    for (const ch of chapters) {
      const k = ch.chapter || '__flat__';
      if (!seen.has(k)) { seen.add(k); orderedKeys.push(k); }
    }

    const outer = [];
    for (const key of orderedKeys) {
      const pages = grouped.get(key);
      if (!pages) continue;
      if (key === '__flat__') {
        for (const p of pages) {
          outer.push(`<li><a href="${escapeXml(p.path)}">${escapeXml(p.title)}</a></li>`);
        }
      } else {
        const chapTitle = chapterMap[key] || chapterTitleFromFolder(key);
        const firstPath = pages[0].path;
        const innerItems = pages.map(p =>
          `<li><a href="${escapeXml(p.path)}">${escapeXml(p.title)}</a></li>`
        ).join('\n          ');
        outer.push(
          `<li><a href="${escapeXml(firstPath)}">${escapeXml(chapTitle)}</a>\n        <ol>\n          ${innerItems}\n        </ol>\n      </li>`
        );
      }
    }
    items = outer.join('\n      ');
  } else {
    items = chapters.map(ch =>
      `<li><a href="${escapeXml(ch.path)}">${escapeXml(ch.title)}</a></li>`
    ).join('\n      ');
  }

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

// ─── Cover XHTML generation ────────────────────────────────────────────
function generateCoverXhtml(coverFilename, coverSize, options = {}) {
  const comic = options.comic === true;
  const cssRelPaths = options.cssRelPaths || [];
  const cssLinks = buildCssLinks('cover.xhtml', cssRelPaths);

  if (!coverFilename) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="id" lang="id">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>Cover</title>
  ${cssLinks}
</head>
<body class="epc-cover-body">
  <h1>Cover</h1>
</body>
</html>
`;
  }

  const href = `images/${coverFilename}`;

  if (comic) {
    const w = (coverSize && coverSize.width) || 1200;
    const h = (coverSize && coverSize.height) || 1600;
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xmlns:xlink="http://www.w3.org/1999/xlink">
<head>
  <meta charset="UTF-8" />
  <title>Cover</title>
  <meta name="viewport" content="width=${w}, height=${h}" />
  ${cssLinks}
  <style>html,body { margin:0; padding:0; height:100%; background:#000; }</style>
</head>
<body class="epc-cover-body">
  <div class="epc-cover-wrap" style="display:flex; align-items:center; justify-content:center; height:100%;">
    <img class="epc-cover-img" src="${escapeXml(href)}" alt="Cover" style="max-width:100%; max-height:100%;" />
  </div>
</body>
</html>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" xml:lang="id" lang="id">
<head>
  <title>Cover</title>
  <meta name="viewport" content="width=device-width, height=device-height" />
  ${cssLinks}
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
    closeRL();
    return;
  }
  try {
    xml2js = require('xml2js');
  } catch (_) {
    logI18n('missing_dep', { mod: 'xml2js', version: '0.5.0' }, 'error');
    closeRL();
    return;
  }

  const cwd = process.cwd();
  const files = fs.readdirSync(cwd).filter(f => f.endsWith('.epub'));
  if (files.length === 0) {
    logI18n('import_no_epub', {}, 'error');
    closeRL();
    return;
  }

  let selectedFile = files[0];
  if (files.length > 1) {
    console.log(t('import_select'));
    files.forEach((f, i) => console.log(`  ${i+1}. ${f}`));
    const answer = await question(t('import_select_prompt', { count: files.length }));
    const idx = parseInt((answer || '').trim());
    if (isNaN(idx) || idx < 1 || idx > files.length) {
      logI18n('import_invalid_choice', {}, 'error');
      closeRL();
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
    console.error('META-INF/container.xml tidak ditemukan dalam EPUB.');
    closeRL();
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
    console.error('Gagal membaca path OPF dari container.xml.');
    closeRL();
    return;
  }

  const opfEntry = zipEntries.find(e => e.entryName === opfPath);
  if (!opfEntry) {
    console.error(`OPF tidak ditemukan: ${opfPath}`);
    closeRL();
    return;
  }
  const opfXml = opfEntry.getData().toString('utf8');
  let opfParsed;
  try {
    opfParsed = await parser.parseStringPromise(opfXml);
  } catch (_) {
    console.error('Gagal parsing OPF.');
    closeRL();
    return;
  }

  const opfDir = path.posix.dirname(opfPath);
  const metadata = opfParsed.package?.metadata?.[0] || {};
  const dc = metadata['dc:title'] || [];
  const titles = dc.map(tt => tt._ || tt).filter(Boolean);
  const mainTitle = titles[0] || '';
  const extraTitles = titles.slice(1);

  const creators = metadata['dc:creator'] || [];
  let author = '';
  let contributors = [];
  for (const cc of creators) {
    const name = cc._ || cc;
    const role = cc.$?.id === 'creator' ? 'aut' : 'ctb';
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
  let renditionLayout = '';
  let renditionSpread = '';
  const metaTags = metadata['meta'] || [];
  for (const m of metaTags) {
    const prop = m.$?.property;
    const val = (m._ || m || '').toString().trim();
    if (prop === 'belongs-to-collection') seriesName = val;
    else if (prop === 'group-position') seriesNumber = val;
    else if (prop === 'rendition:layout') renditionLayout = val;
    else if (prop === 'rendition:spread') renditionSpread = val;
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

  const spineEl = opfParsed.package?.spine?.[0];
  const spineItems = spineEl?.itemref || [];
  const spineOrder = spineItems.map(item => item.$?.idref).filter(Boolean);
  const pageProgression = spineEl?.$?.['page-progression-direction'] || 'ltr';

  const isComicImport = renditionLayout === 'prepaginated';

  const epubTarget = path.join(outputDir, 'EPUB');
  const imagesTarget = path.join(epubTarget, 'images');
  const audioTarget = path.join(epubTarget, 'audiovideo');
  ensureDir(epubTarget);
  ensureDir(imagesTarget);
  ensureDir(audioTarget);

  function resolveHref(href) {
    const joined = path.posix.normalize(path.posix.join(opfDir, href));
    return joined;
  }

  function findZipEntryByHref(href) {
    const epubInternal = resolveHref(href);
    return zipEntries.find(e => e.entryName === epubInternal);
  }

  let coverFound = false;
  let coverExt = null;
  for (const id in manifestMap) {
    const item = manifestMap[id];
    if (item.properties && item.properties.includes('cover-image')) {
      const entry = findZipEntryByHref(item.href);
      if (entry) {
        const ext = path.extname(entry.entryName).toLowerCase() || '.jpg';
        const dest = path.join(imagesTarget, `cover${ext}`);
        if (fs.existsSync(dest) && !force) {
          logI18n('not_modified', { file: dest }, 'warn');
        } else {
          ensureDir(path.dirname(dest));
          fs.writeFileSync(dest, entry.getData());
          logI18n('import_cover_found', { file: `cover${ext}` }, 'info');
        }
        coverFound = true;
        coverExt = ext;
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
          const entry = findZipEntryByHref(item.href);
          if (entry) {
            const ext = path.extname(entry.entryName).toLowerCase() || '.jpg';
            const dest = path.join(imagesTarget, `cover${ext}`);
            if (fs.existsSync(dest) && !force) {
              logI18n('not_modified', { file: dest }, 'warn');
            } else {
              fs.writeFileSync(dest, entry.getData());
              logI18n('import_cover_found', { file: `cover${ext}` }, 'info');
            }
            coverFound = true;
            coverExt = ext;
          }
          break;
        }
      }
    }
  }

  const chapterFiles = [];
  const imageFiles = [];
  const audioFiles = [];
  const ordComicEntries = [];
  let pageCounter = 0;

  if (isComicImport) {
    const pagesTarget = path.join(imagesTarget, 'pages');
    ensureDir(pagesTarget);

    const coverHref = (() => {
      for (const id in manifestMap) {
        const item = manifestMap[id];
        if (item.properties && item.properties.includes('cover-image')) {
          return item.href;
        }
      }
      return null;
    })();

    for (const idref of spineOrder) {
      const item = manifestMap[idref];
      if (!item) continue;

      const baseNameLower = path.basename(item.href).toLowerCase();
      if (['nav.xhtml', 'toc.xhtml', 'cover.xhtml', 'titlepage.xhtml'].includes(baseNameLower)) continue;
      if (item.href === coverHref) continue;

      if (item.properties && item.properties.includes('rendition:layout-reflowable')) {
        const entry = findZipEntryByHref(item.href);
        if (entry) {
          const dest = path.join(epubTarget, path.basename(item.href));
          if (!fs.existsSync(dest) || force) {
            fs.writeFileSync(dest, entry.getData());
            logI18n('created', { file: dest }, 'success');
          }
        }
        continue;
      }

      const entry = findZipEntryByHref(item.href);
      if (!entry) continue;
      const xhtmlContent = entry.getData().toString('utf8');

      if (/<nav\b[^>]*epub:type=["']toc["']/i.test(xhtmlContent)) continue;

      const imgMatch = xhtmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (!imgMatch) {
        const dest = path.join(epubTarget, path.basename(item.href));
        if (!fs.existsSync(dest) || force) {
          fs.writeFileSync(dest, entry.getData());
          logI18n('created', { file: dest }, 'success');
        }
        continue;
      }

      const imgHref = imgMatch[1];
      const altMatch = xhtmlContent.match(/<img[^>]+alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '';

      const xhtmlDir = path.posix.dirname(resolveHref(item.href));
      const resolvedImg = path.posix.normalize(path.posix.join(xhtmlDir, imgHref));
      const imgEntry = zipEntries.find(e => e.entryName === resolvedImg);
      if (!imgEntry) {
        logI18n('import_skip_non_spine', { file: item.href }, 'warn');
        continue;
      }

      pageCounter++;
      const newBase = String(pageCounter).padStart(4, '0');
      const imgExt = path.extname(imgEntry.entryName) || '.jpg';
      const newImgName = `${newBase}${imgExt}`;
      const imgDest = path.join(pagesTarget, newImgName);

      if (!fs.existsSync(imgDest) || force) {
        fs.writeFileSync(imgDest, imgEntry.getData());
        imageFiles.push(newImgName);
      }

      ordComicEntries.push({
        path: `${newBase}.xhtml`,
        alt: alt || null,
        spread: null,
      });
    }

    logI18n('import_comic_pages', { count: pageCounter }, 'info');

    await syncXhtmlFromImages(epubTarget, { silent: true, force: false });

    for (const id in manifestMap) {
      const item = manifestMap[id];
      if (!item.mediaType) continue;
      if (item.mediaType.startsWith('audio/') || item.mediaType.startsWith('video/')) {
        const entry = findZipEntryByHref(item.href);
        if (entry) {
          const filename = path.basename(item.href);
          const dest = path.join(audioTarget, filename);
          if (!fs.existsSync(dest) || force) {
            fs.writeFileSync(dest, entry.getData());
            audioFiles.push(filename);
            logI18n('created', { file: dest }, 'success');
          }
        }
      }
    }

    const configPath = path.join(outputDir, 'config.txt');
    const type = pageProgression === 'rtl' ? 'manga' : 'comic';
    const configContent = buildImportComicConfig({
      mainTitle, author, lang, identifier, date, publisher, description,
      subjects, seriesName, seriesNumber, contributors, extraTitles,
      type, direction: pageProgression, spread: renditionSpread || 'auto',
    });
    if (fs.existsSync(configPath) && !force) {
      const ans = await question(t('file_exists', { file: 'config.txt' }));
      if ((ans || '').toLowerCase() === 'y') {
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
    if (fs.existsSync(ordPath) && !force) {
      const ans = await question(t('file_exists', { file: 'ord.txt' }));
      if ((ans || '').toLowerCase() === 'y') {
        writeOrdFile(ordPath, ordComicEntries, true);
        logI18n('overwritten', { file: 'ord.txt' }, 'success');
      } else {
        logI18n('not_modified', { file: 'ord.txt' }, 'warn');
      }
    } else {
      writeOrdFile(ordPath, ordComicEntries, true);
      logI18n('import_ord_written', { count: ordComicEntries.length }, 'success');
    }

    logI18n('import_done', {}, 'success');
    logI18n('import_summary', {
      chapters: pageCounter,
      images: imageFiles.length + (coverFound ? 1 : 0),
      audio: audioFiles.length,
    }, 'info');

    closeRL();
    return;
  }

  function copyZipEntry(entryName, destPath, overwrite = false) {
    const entry = zipEntries.find(e => e.entryName === entryName);
    if (!entry) return false;
    if (fs.existsSync(destPath) && !overwrite) return false;
    ensureDir(path.dirname(destPath));
    fs.writeFileSync(destPath, entry.getData());
    return true;
  }

  for (const id of spineOrder) {
    const item = manifestMap[id];
    if (!item) continue;
    if (item.mediaType === 'application/xhtml+xml' ||
        item.mediaType === 'application/xhtml+xml;charset=utf-8' ||
        item.mediaType === 'application/xhtml+xml; charset=utf-8') {
      const epubInternal = resolveHref(item.href);
      const destRel = path.posix.relative(opfDir, epubInternal) || item.href;
      const dest = path.join(epubTarget, destRel);
      if (copyZipEntry(epubInternal, dest, force)) {
        chapterFiles.push(destRel);
        logI18n('created', { file: dest }, 'success');
      } else if (fs.existsSync(dest)) {
        logI18n('not_modified', { file: dest }, 'warn');
      }
    } else if (item.mediaType && !item.mediaType.startsWith('application/xhtml+xml')) {
      // ignore
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
      const epubInternal = resolveHref(item.href);
      const dest = path.join(imagesTarget, filename);
      if (copyZipEntry(epubInternal, dest, force)) {
        imageFiles.push(filename);
        logI18n('created', { file: dest }, 'success');
      }
    } else if (item.mediaType.startsWith('audio/') || item.mediaType.startsWith('video/')) {
      const filename = path.basename(item.href);
      const epubInternal = resolveHref(item.href);
      const dest = path.join(audioTarget, filename);
      if (copyZipEntry(epubInternal, dest, force)) {
        audioFiles.push(filename);
        logI18n('created', { file: dest }, 'success');
      }
    }
  }

  const configPath = path.join(outputDir, 'config.txt');
  const configContent = buildImportTextbookConfig({
    mainTitle, author, lang, identifier, date, publisher, description,
    subjects, seriesName, seriesNumber, contributors, extraTitles,
  });
  if (fs.existsSync(configPath) && !force) {
    const ans = await question(t('file_exists', { file: 'config.txt' }));
    if ((ans || '').toLowerCase() === 'y') {
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
    if ((ans || '').toLowerCase() === 'y') {
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
    audio: audioFiles.length,
  }, 'info');
  logI18n('import_hint', {}, 'info');

  closeRL();
}

function buildImportTextbookConfig(d) {
  return `# ============================================================
#  METADATA BUKU  -  diedit dari hasil impor
# ============================================================

type: textbook

title: ${d.mainTitle}
subtitle: 
volume: 
author: ${d.author}
language: ${d.lang}
identifier: ${d.identifier}
date: ${d.date}
publisher: ${d.publisher}
description: ${d.description}
subjects: ${d.subjects.join(', ')}
series_name: ${d.seriesName}
series_number: ${d.seriesNumber}
contributors: ${d.contributors.map(cc => `${cc.name}|${cc.role}`).join(', ')}
extra_titles: ${d.extraTitles.join(', ')}

# ============================================================
#  KONVERSI DOCX -> MARKDOWN (opsional)
# ============================================================
# [docx-mapping]
# heading1 = 24
# heading2 = 18
# heading3 = 14
`;
}

function buildImportComicConfig(d) {
  return `# ============================================================
#  METADATA BUKU  -  diedit dari hasil impor
# ============================================================

type: ${d.type}
reading_direction: ${d.direction}
spread: ${d.spread}
fit_mode: contain
custom_css: 

title: ${d.mainTitle}
subtitle: 
volume: 
author: ${d.author}
language: ${d.lang}
identifier: ${d.identifier}
date: ${d.date}
publisher: ${d.publisher}
description: ${d.description}
subjects: ${d.subjects.join(', ')}
series_name: ${d.seriesName}
series_number: ${d.seriesNumber}
contributors: ${d.contributors.map(cc => `${cc.name}|${cc.role}`).join(', ')}
extra_titles: ${d.extraTitles.join(', ')}

# ============================================================
#  CATATAN:
#  Halaman diekstrak ke EPUB/images/pages/ (flat, tanpa chapter)
#  XHTML di-generate ke EPUB/xhtmls/
#  ord.txt sudah terisi sesuai urutan spine EPUB asli
#  nav/toc dari EPUB asli otomatis di-skip
# ============================================================
`;
}

// ─── Command: updatemodule ────────────────────────────────────────────
async function cmdUpdateModule(force = false) {
  const nodeModulesDir = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nodeModulesDir) && !force) {
    const ans = await question(t('update_confirm'));
    if ((ans || '').toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      closeRL();
      return;
    }
  } else if (fs.existsSync(nodeModulesDir) && force) {
    logI18n('update_force', {}, 'info');
  }

  try {
    const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/modules.tar.gz';
    await downloadAndExtract(url, process.cwd(), 'node_modules', 1);
    logI18n('extract_success', {}, 'success');
  } catch (err) {
    logI18n('extract_failed', { error: err.message }, 'error');
  }
  closeRL();
}

// ─── Command: updateconfig ─────────────────────────────────────────────
async function cmdUpdateConfig(force = false) {
  const configDir = path.join(process.cwd(), TOOL_DIR);
  if (fs.existsSync(configDir) && !force) {
    const ans = await question(t('updateconfig_confirm'));
    if ((ans || '').toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      closeRL();
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
  closeRL();
}

// ─── Command: settings ─────────────────────────────────────────────────
async function cmdSettings() {
  const settingsPath = path.join(process.cwd(), SETTINGS_FILE);
  const settings = loadSettings();

  console.log(t('settings_title'));
  const keys = ['watch_delay', 'auto_build', 'overwrite_policy', 'default_type'];
  const current = {};
  for (const k of keys) {
    current[k] = settings[k] || '';
    console.log(`${k.padEnd(15)} : ${current[k]}`);
  }
  console.log('\n' + t('settings_prompt'));

  const newSettings = {};
  for (const k of keys) {
    const prompt = `[${k}] (${current[k]}): `;
    const answer = await question(prompt);
    if ((answer || '').trim().toLowerCase() === 'save') {
      for (const kk of keys) {
        if (newSettings[kk] === undefined) {
          newSettings[kk] = current[kk];
        }
      }
      break;
    }
    if ((answer || '').trim().toLowerCase() === 'cancel') {
      logI18n('settings_cancelled', {}, 'warn');
      closeRL();
      return;
    }
    if ((answer || '').trim() !== '') {
      if (k === 'watch_delay' && isNaN(parseInt(answer.trim()))) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else if (k === 'auto_build' && !['true', 'false'].includes(answer.trim().toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else if (k === 'overwrite_policy' && !['ask', 'force', 'skip'].includes(answer.trim().toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else if (k === 'default_type' && !VALID_TYPES.includes(answer.trim().toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn');
        newSettings[k] = current[k];
      } else {
        newSettings[k] = answer.trim();
      }
    } else {
      newSettings[k] = current[k];
    }
  }

  const content = Object.entries(newSettings).map(([k, v]) => `${k} = ${v}`).join('\n');
  ensureDir(TOOL_DIR);
  fs.writeFileSync(settingsPath, content, 'utf8');
  logI18n('settings_saved', { file: settingsPath }, 'success');

  closeRL();
}

// ─── Command: validate ─────────────────────────────────────────────────
async function cmdValidate() {
  const buildsDir = path.join(process.cwd(), 'builds');
  if (!fs.existsSync(buildsDir)) {
    logI18n('validate_no_epub', {}, 'error');
    closeRL();
    return;
  }
  const files = fs.readdirSync(buildsDir).filter(f => f.endsWith('.epub'));
  if (files.length === 0) {
    logI18n('validate_no_epub', {}, 'error');
    closeRL();
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
  closeRL();
}

// ─── Help ──────────────────────────────────────────────────────────────
function printHelp() {
  console.log('');
  console.log(t('help_title', { version: VERSION }));
  console.log(t('help_commands'));
  console.log(t('help_structure'));
  console.log(t('help_deps'));
  console.log('');
}

// ─── Menu (fallback, numeric) ──────────────────────────────────────────
function printMenu() {
  const line = c.gray + '-'.repeat(52) + c.reset;
  console.log('');
  console.log(`  ${c.bold}epubcreator${c.reset} ${c.gray}v${VERSION}${c.reset}  ${c.gray}--${c.reset}  EPUB builder`);
  console.log(`  ${line}`);
  console.log('');
  console.log(`  ${c.bold}${c.cyan}CREATE NEW BOOK${c.reset}`);
  console.log(`    ${c.bold}1${c.reset}  Textbook`);
  console.log(`    ${c.bold}2${c.reset}  Comic (LTR)`);
  console.log(`    ${c.bold}3${c.reset}  Manga (RTL)`);
  console.log('');
  console.log(`  ${c.bold}${c.cyan}CONVERSION${c.reset}`);
  console.log(`    ${c.bold}4${c.reset}  Markdown -> XHTML`);
  console.log(`    ${c.bold}5${c.reset}  XHTML -> Markdown`);
  console.log(`    ${c.bold}6${c.reset}  DOCX -> Markdown`);
  console.log(`    ${c.bold}7${c.reset}  Images -> XHTML (comic/manga)`);
  console.log(`    ${c.bold}8${c.reset}  Split Markdown`);
  console.log(`    ${c.bold}9${c.reset}  Merge Markdown`);
  console.log('');
  console.log(`  ${c.bold}${c.cyan}BUILD & MANAGE${c.reset}`);
  console.log(`    ${c.bold}b${c.reset}  Build EPUB`);
  console.log(`    ${c.bold}d${c.reset}  Debug (auto-rebuild)`);
  console.log(`    ${c.bold}v${c.reset}  Validate`);
  console.log(`    ${c.bold}i${c.reset}  Import EPUB`);
  console.log(`    ${c.bold}s${c.reset}  Settings`);
  console.log(`    ${c.bold}u${c.reset}  Update module`);
  console.log(`    ${c.bold}c${c.reset}  Update config`);
  console.log('');
  console.log(`    ${c.bold}h${c.reset}  Help      ${c.bold}q${c.reset}  Quit`);
  console.log('');
}

async function handleMenuChoice(choice, deps) {
  const { archiver, marked, TurndownService } = deps;

  switch (choice) {
    case '1': await cmdCreateDir(['textbook']); break;
    case '2': await cmdCreateDir(['comic']); break;
    case '3': await cmdCreateDir(['manga']); break;
    case '4': await cmdConvertCh(null, false, marked); break;
    case '5': await cmdConvertX(null, TurndownService); break;
    case '6': await cmdDocxToMd([]); break;
    case '7': await cmdImg2Xhtml([]); break;
    case '8': {
      const p = await question(`  ${c.gray}Path to .md file or directory [Markdowns]:${c.reset} `);
      const target = (p || '').trim() || 'Markdowns';
      await cmdSplit([target]);
      break;
    }
    case '9': {
      const p = await question(`  ${c.gray}Path to .md file or directory [Markdowns]:${c.reset} `);
      const target = (p || '').trim() || 'Markdowns';
      await cmdMerge([target]);
      break;
    }
    case 'b': await cmdBuild(archiver); break;
    // 'd' (debug) sekarang ditangani eksplisit oleh TUI.executeAction / runMenuFallback.
    case 'v': await cmdValidate(); break;
    case 'i': await cmdImport([]); break;
    case 's': await cmdSettings(); break;
    case 'u': await cmdUpdateModule(false); break;
    case 'c': await cmdUpdateConfig(false); break;
    case 'h': printHelp(); break;
    default:
      log(`Unknown option: "${choice}". Type "h" for help.`, 'warn');
  }
}

// ─── Fallback debug runner ─────────────────────────────────────────────
// Fallback TIDAK punya raw-mode TUI. Jadi kita pinjam raw mode sementara
// untuk mendeteksi satu tombol 'q', lalu restore rl setelah selesai.
async function runDebugFallback(deps) {
  // Lepas rl supaya tidak merebut stdin dari listener raw-mode kita.
  try { rl.close(); } catch (_) {}
  try { process.stdin.setRawMode(true); } catch (_) {}
  process.stdin.resume();

  console.log('');
  log(`Debug mode active. Press ${c.bold}q${c.reset} to stop, Ctrl+C to exit.`, 'info');
  console.log('');

  const stopKeyPromise = new Promise((resolve) => {
    const handler = (chunk) => {
      const str = chunk.toString('utf8');
      if (str.includes('q') || str.includes('Q')) {
        process.stdin.removeListener('data', handler);
        resolve('stop');
      } else if (str.includes('\x03')) {
        // Ctrl+C di raw mode tidak jadi SIGINT. Kita berhentikan debug
        // lalu kill process (agar konsisten dengan "Ctrl+C = kill").
        process.stdin.removeListener('data', handler);
        if (_activeDebugStop) _activeDebugStop();
        // eslint-disable-next-line no-process-exit
        process.exit(0);
      }
    };
    process.stdin.on('data', handler);
  });

  const debugPromise = cmdDebug(deps.archiver, deps.marked);

  await Promise.race([
    debugPromise,
    stopKeyPromise.then(() => {
      if (_activeDebugStop) _activeDebugStop();
      return debugPromise;
    }),
  ]);

  // Restore: matikan raw mode, hidupkan lagi rl untuk menu loop.
  try { process.stdin.setRawMode(false); } catch (_) {}
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
}

// ─── Fallback menu (numeric input) ─────────────────────────────────────
async function runMenuFallback(deps) {
  while (true) {
    printMenu();
    const answer = await question(`  ${c.cyan}>${c.reset} `);
    const choice = (answer || '').trim().toLowerCase();

    if (!choice) continue;
    if (choice === 'q' || choice === 'quit' || choice === 'exit') {
      console.log(`\n  ${c.gray}Bye.${c.reset}\n`);
      return;
    }

    console.log('');
    try {
      if (choice === 'd') {
        await runDebugFallback(deps);
      } else {
        await handleMenuChoice(choice, deps);
      }
    } catch (err) {
      log(`Error: ${err.message}`, 'error');
    }

    console.log('');
    await pauseBeforeMenu(3);
  }
}

// ─── TUI menu (arrow keys, full-screen) ────────────────────────────────
async function runMenuTUI(deps) {
  TUI.init(deps);

  if (!TUI.enter()) {
    // TUI couldn't activate — restore rl and fall back.
    try { rl.close(); } catch (_) {}
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return await runMenuFallback(deps);
  }

  await new Promise(resolve => { TUI.onExit = resolve; });
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  loadSettings();

  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--version' || command === '-v') {
    console.log(`epubcreator v${VERSION}`);
    try { rl.close(); } catch (_) {}
    return;
  }
  if (command === 'help' || command === '--help') {
    printHelp();
    try { rl.close(); } catch (_) {}
    return;
  }

  // ─── Tanpa argumen → menu interaktif ──────────────────────────────
  if (!command) {
    interactiveMode = true;
    let deps;
    try {
      deps = checkDependencies();
    } catch (_) {
      process.exit(1);
    }

    TUI.cols = process.stdout.columns || 80;
    TUI.rows = process.stdout.rows || 24;

    if (TUI.canUse()) {
      await runMenuTUI(deps);
    } else {
      await runMenuFallback(deps);
      try { rl.close(); } catch (_) {}
    }
    return;
  }

  // ─── Perintah tanpa dependensi (non-interaktif) ──────────────────
  if (command === 'createdir') {
    await cmdCreateDir(args.slice(1));
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

  // ─── Perintah dengan dependensi ──────────────────────────────────
  let deps;
  try {
    deps = checkDependencies();
  } catch (_) {
    process.exit(1);
  }
  const { archiver, marked, TurndownService } = deps;

  if (command === 'convertch' || command === 'conv') {
    const sub = args[1] || 'md2xhtml';
    const rest = args.slice(2);

    if (sub === 'img2xhtml') {
      await cmdImg2Xhtml(rest);
      return;
    }
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
      try { rl.close(); } catch (_) {}
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
    // Di mode CLI murni, debug berjalan sampai user menekan Ctrl+C
    // (SIGINT default = kill proses). _activeDebugStop tidak pernah dipanggil.
    await cmdDebug(archiver, marked);
    return;
  }

  logI18n('unknown_command', { cmd: command }, 'error');
  logI18n('usage_hint', {}, 'info');
  try { rl.close(); } catch (_) {}
}

async function cmdBuild(archiver) {
  await buildEpub(archiver);
  closeRL();
}

main().catch((err) => {
  console.error(`${c.red}[!!]${c.reset} Error: ${err.message}`);
  try { rl.close(); } catch (_) {}
  if (TUI.active) {
    try { process.stdout.write('\x1b[?25h\x1b[?1049l'); } catch (_) {}
  }
});