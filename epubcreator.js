#!/usr/bin/env node
/**
 * epubcreator.js — Node CLI untuk kompilasi direktori ke EPUB
 *
 * Versi: 4.2.0
 *   - Security: import zip-slip guard, symlink cycle protection, ord.txt path guard
 *   - Bugfix: parseConfig "#" in value, epubcheck detection, Termux debug warning
 *   - New: stats, preview (HTTP server + epub.js), incremental convertch
 *   - New: --dry-run, --quiet, --verbose, --json global flags
 *   - New: sanitize-html integration (optional fallback)
 *
 *  Copyright (C) 2026 YogabyAllwaysever.
 *
 * Cara pakai:
 *   node epubcreator.js                    -> menu interaktif
 *   node epubcreator.js createdir          -> buat struktur direktori
 *   node epubcreator.js createdir comic    -> paksa mode comic (LTR)
 *   node epubcreator.js createdir manga    -> paksa mode manga (RTL)
 *   node epubcreator.js convertch          -> ubah file .md menjadi .xhtml
 *   node epubcreator.js convertch img2xhtml -> generate .xhtml dari gambar
 *   node epubcreator.js convertch xhtml2md -> ubah file .xhtml menjadi .md
 *   node epubcreator.js convertch docx2md  -> ubah file .docx menjadi .md
 *   node epubcreator.js conv ...           -> alias untuk convertch
 *   node epubcreator.js split <path>       -> pecah file .md berdasarkan ##
 *   node epubcreator.js merge <path>       -> gabungkan file .md
 *   node epubcreator.js build              -> build EPUB
 *   node epubcreator.js debug              -> pantau perubahan, auto build
 *   node epubcreator.js import             -> impor file .epub
 *   node epubcreator.js stats              -> tampilkan statistik buku
 *   node epubcreator.js preview            -> jalankan server preview lokal
 *   node epubcreator.js update module      -> update node_modules dari repo
 *   node epubcreator.js update config      -> update .epubcreator dari repo
 *   node epubcreator.js settings           -> ubah pengaturan tool
 *   node epubcreator.js validate           -> validasi EPUB dengan epubcheck
 *   node epubcreator.js --version          -> tampilkan versi
 *   node epubcreator.js help               -> tampilkan bantuan
 *
 * Global flags (dapat dipakai di mana saja):
 *   --quiet, -q      hanya tampilkan error
 *   --verbose        tampilkan detail tambahan
 *   --json           output JSON ke stdout (mensupresi log non-error)
 *   --dry-run, -n    tampilkan rencana tanpa menulis file
 */

const VERSION = '4.2.0';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { execSync, execFileSync, spawn } = require('child_process');

// ─── Runtime flags ─────────────────────────────────────────────────────
const OPTS = {
  quiet: false,
  verbose: false,
  json: false,
  dryRun: false,
};

const isTermux = !!(
  (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) ||
  process.env.TERMUX_VERSION
);

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
  missing_dep: 'Module "{mod}" (v{version}) not found. Install with:\n  npm install {mod}@{version}\nor\n  node epubcreator.js update module\n',
  marked_old: '"marked" version is too old. Reinstall with:\n  npm install marked@4.0.0\nor\n  node epubcreator.js update module\n',
  cancelled: 'Cancelled.',
  file_exists: '{file} already exists. Overwrite? (y/n) ',
  overwritten: '{file} overwritten.',
  not_modified: '{file} unchanged.',
  created: '{file} created.',
  dir_created: 'Directory structure created at {dirs}',
  ready: 'Directory and template files ready.',

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
  convert_incremental_skip: 'Skipped (unchanged): {file}',
  convert_incremental_force_all: 'Overwriting all .xhtml (--all).',

  epub_not_found: 'EPUB/ directory not found.',
  must_be_xhtml: 'File must have .xhtml extension',
  skip_cover: 'Skipping {file} (excluded)',
  no_xhtml_found: 'No valid .xhtml files found in that directory.',
  xhtml_count: 'Found {count} .xhtml files.',
  convertx_success: 'Successfully converted: {file}',
  convertx_fail: 'Failed to convert {file}: {error}',
  convertx_summary: 'Done: {success} out of {total} files converted successfully.',

  docx_no_files: 'No .docx files found.',
  docx_processing: 'Processing: {file}',
  docx_no_images: 'Image extraction from DOCX not yet supported; images will be ignored.',
  docx_heading_mode_warn: 'Font size based heading mode is used (with configured thresholds).',
  docx_nosplit_mode: 'No-split mode (--nosplit) is active, all content will be merged into one file.',
  docx_done: 'Done.',

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
  img2x_alt_missing: 'Missing alt text for {file}. Add " | description" in ord.txt for better accessibility.',

  split_usage: 'node epubcreator.js split <path> [--output dir] [--force] [--dry-run]',
  split_processing: 'Processing {file} ...',
  split_no_heading: 'No heading level 2 (##) found in {file}, entire content saved as one file.',
  split_parts: 'Split into {count} parts.',
  split_created: 'File created: {file}',
  split_summary: 'Done: {success} out of {total} files processed successfully.',
  split_output_dir: 'Output directory: {dir}',
  split_dry: '[dry] Would create {count} file(s) in {dir}',

  merge_usage: 'node epubcreator.js merge <path> [--output file] [--force] [--dry-run]',
  merge_no_files: 'No .md files found in {path}.',
  merge_processing: 'Merging {count} files ...',
  merge_created: 'Merged file created: {file}',
  merge_summary: '{count} files successfully merged into {output}.',
  merge_output_file: 'Output: {file}',
  merge_dry: '[dry] Would merge {count} file(s) into {output}',

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
  ord_unsafe_path: 'Skipping unsafe path in ord.txt: {file}',
  build_dry: '[dry] Would build {file}: {chapters} chapter(s), {images} image(s), {audio} audio/video',

  comic_mode: 'Comic mode: {type} ({direction}, spread: {spread})',
  comic_pages_found: 'Found {count} page(s).',
  comic_double_detected: 'Page {page} detected as double-spread (ratio {ratio}).',
  comic_pages_dir_missing: 'EPUB/images/pages/ not found. Put page images there first.',
  comic_xhtmls_missing: 'EPUB/xhtmls/ not found. Run "convertch img2xhtml" first.',
  comic_syncing: 'Syncing XHTML from images...',
  comic_css_found: 'Custom CSS: {list}',

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
  import_unsafe_path: 'Unsafe path in EPUB, skipping: {path}',

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

  update_usage: 'Usage: node epubcreator.js update <module|config> [--force]',
  update_unknown_sub: 'Unknown update target: {sub}',

  validate_no_epub: 'No .epub file found in builds/',
  validate_start: 'Validating {file} ...',
  validate_ok: 'Validation passed for {file}',
  validate_fail: 'Validation failed:\n{output}',
  validate_epubcheck_missing: 'epubcheck not found.\n  Termux: pkg install openjdk-17\n  Then: node epubcreator.js update config (downloads epubcheck.jar)\n  Or install manually: https://github.com/w3c/epubcheck/releases',
  validate_java_missing: 'epubcheck found but Java is missing.\n  Termux: pkg install openjdk-17\n  Others: install Java 8+ from java.com',

  debug_usage: 'node epubcreator.js debug  -> Watch changes, auto convertch + build',
  debug_start: 'Watching Markdowns/ for changes... Press q to stop, Ctrl+C to exit.',
  debug_start_comic: 'Watching EPUB/images/pages/ for changes... Press q to stop, Ctrl+C to exit.',
  debug_change: 'Changes detected, rebuilding...',
  debug_error: 'Error during rebuild: {error}',
  debug_watch_fallback: 'Warning: recursive watch not supported, watching root directory only (subdirectory changes may not trigger).',
  debug_termux_warning: 'Termux: recursive file watching is not supported on Android. Subdirectory changes may not trigger rebuild.',
  debug_watching_again: 'Watching again...',
  debug_stopped: 'Debug stopped.',

  settings_title: '=== .epubcreator/settings.txt ===',
  settings_prompt: 'Press Enter to keep current value, or type new value. Type "save" to save, "cancel" to abort.',
  settings_saved: 'Settings saved to {file}.',
  settings_cancelled: 'Settings cancelled.',
  settings_invalid_value: 'Invalid value. Keeping previous.',

  updateconfig_confirm: 'This will replace your existing .epubcreator folder. Continue? (y/n) ',
  updateconfig_force: 'Overwriting .epubcreator (--force).',
  updateconfig_fetching: 'Downloading configuration bundle from config branch...',
  updateconfig_extracting: 'Extracting configuration...',
  updateconfig_success: '.epubcreator updated successfully.',
  updateconfig_no_assets: 'Folder .epubcreator not found in archive.',
  updateconfig_failed: 'Failed to update config: {error}',

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

  unknown_command: 'Unknown command: {cmd}',
  maybe_you_mean: 'Maybe you mean: {suggestion}',
  usage_hint: 'Use: createdir | convertch | conv | split | merge | build | debug | import | stats | preview | update | settings | validate | --version',

  // stats
  stats_no_config: 'config.txt not found. Run: node epubcreator.js createdir',
  stats_title: 'Statistics: {dir}',
  stats_type: '  Type        : {type}',
  stats_direction: '  Direction   : {direction}',
  stats_chapters: '  Chapters    : {count}',
  stats_pages: '  Pages       : {count}',
  stats_words: '  Words       : {count} ({readtime})',
  stats_images: '  Images      : {count} ({size})',
  stats_audio: '  Audio/Video : {count} ({size})',
  stats_last_build: '  Last build  : {file} ({size}, {date})',
  stats_no_build: '  Last build  : (none)',

  // preview
  preview_start: 'Preview server: http://{host}:{port}/',
  preview_no_epub: 'No .epub file found. Run "node epubcreator.js build" first.',
  preview_no_epubjs: 'epub.min.js not found. Run "node epubcreator.js update config" or install via "npm install epubjs".',
  preview_watching: 'Watching for changes (--watch active). Press Ctrl+C to stop.',
  preview_rebuilt: 'Rebuilt. Browser will reload.',
  preview_reload: 'Reload signal sent.',
  preview_stopped: 'Preview stopped.',
  preview_port_in_use: 'Port {port} in use. Try --port <number>.',
  preview_open_hint: 'Open in browser: http://{host}:{port}/',
  preview_termux_open: 'Opening browser via termux-open-url...',
  preview_build_needed: 'Building EPUB before serving...',

  // sanitize
  sanitize_missing: 'sanitize-html not installed; using minimal fallback. Install with: npm install sanitize-html',
};

// ─── Variabel global ──────────────────────────────────────────────────
let interactiveMode = false;
let _activeDebugStop = null;

// ─── Emoji strip (safety net) ─────────────────────────────────────────
const EMOJI_PREFIX_RE = /^[\s\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2139}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}]+/u;

function stripEmojiPrefix(str) {
  return String(str).replace(EMOJI_PREFIX_RE, '');
}

// ─── Settings ─────────────────────────────────────────────────────────
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
    if (key && value) settings[key] = value;
  }
  return settings;
}

// ─── Message substitution ─────────────────────────────────────────────
function t(key, params = {}) {
  let str = MESSAGES[key] || key;
  str = stripEmojiPrefix(str);
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`{${k}}`, 'g'), v);
  }
  return str;
}

// ─── Logging ──────────────────────────────────────────────────────────
const LOG_STYLES = {
  info:    { tag: '[i] ', color: c.cyan },
  success: { tag: '[OK]', color: c.green },
  warn:    { tag: '[!] ', color: c.yellow },
  error:   { tag: '[!!]', color: c.red },
};

let _logCapture = null;

function log(msg, type = 'info') {
  const s = LOG_STYLES[type] || LOG_STYLES.info;
  const cleanMsg = stripEmojiPrefix(String(msg));
  if (_logCapture) _logCapture.push({ type, msg: cleanMsg });
  if (OPTS.quiet && type !== 'error') return;
  if (OPTS.json && type !== 'error') return;
  console.log(`${s.color}${s.tag}${c.reset} ${cleanMsg}`);
}

function logI18n(key, params = {}, type = 'info') {
  log(t(key, params), type);
}

function emitJson(data) {
  if (!OPTS.json) return;
  console.log(JSON.stringify(data));
}

// ─── Suggest command ──────────────────────────────────────────────────
const COMMAND_SUGGESTIONS = {
  'updatemodule': 'update module',
  'updateconfig': 'update config',
};
const KNOWN_COMMANDS = [
  'createdir', 'convertch', 'conv', 'split', 'merge',
  'build', 'debug', 'import', 'update', 'settings',
  'validate', 'stats', 'preview', 'help',
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function suggestCommand(cmd) {
  const lower = String(cmd || '').toLowerCase();
  if (COMMAND_SUGGESTIONS[lower]) return COMMAND_SUGGESTIONS[lower];
  let best = null, bestDist = Infinity;
  for (const cc of KNOWN_COMMANDS) {
    const d = levenshtein(lower, cc);
    if (d < bestDist) { bestDist = d; best = cc; }
  }
  if (best && bestDist <= 3) return best;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
//  TUI
// ═══════════════════════════════════════════════════════════════════════

const _origConsoleLog = console.log.bind(console);
const _origConsoleError = console.error.bind(console);

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

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
      { key: 'p', label: 'Preview' },
      { key: 't', label: 'Stats' },
      { key: 'i', label: 'Import' },
      { key: 's', label: 'Settings' },
      { key: 'u', label: 'Update...' },
    ],
  },
];

const TUI = {
  active: false,
  suspended: false,
  executing: false,
  debugActive: false,
  updateSubmenu: false,
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
    if (OPTS.json) return false;
    if (OPTS.quiet) return false;
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
    process.stdout.write('\x1b[?1049h');
    process.stdout.write('\x1b[?25l');
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
    process.stdout.write('\x1b[?25h');
    process.stdout.write('\x1b[?1049l');
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
    if (this.logs.length > this.maxLogs) this.logs = this.logs.slice(-this.maxLogs);
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
    if (this.updateSubmenu) {
      return ` ${c.yellow}Update: [m]odule / [c]onfig / Esc cancel${c.reset}`;
    }
    if (this.debugActive) {
      return ` ${c.yellow}Debug active - q stop   PgUp/PgDn scroll   Ctrl+C exit${c.reset}`;
    }
    return ` ${c.gray}Up/Down navigate   Enter select   PgUp/PgDn scroll   h help   q quit   (${this.selected + 1}/${this.menu.length})${c.reset}`;
  },

  handleInput(chunk) {
    if (this.suspended) return;
    const str = chunk.toString('utf8');
    if (this.promptState) { this.handlePromptInput(str); return; }
    if (this.updateSubmenu) { this.handleUpdateSubmenuInput(str); return; }
    if (this.debugActive) { this.handleDebugInput(str); return; }
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
        this.pushLog(`${c.cyan}Help:${c.reset} use Up/Down + Enter, or press shortcut keys directly (1-9, b, d, v, p, t, i, s, u). q quits. PgUp/PgDn scrolls log.`);
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

  handleUpdateSubmenuInput(str) {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '\x03') { this.updateSubmenu = false; this.exit(); return; }
      if (ch === '\x1b') {
        if (str[i + 1] === '[') { i += 2; continue; }
        this.updateSubmenu = false;
        this.render();
        return;
      }
      const lower = ch.toLowerCase();
      if (lower === 'm') { this.updateSubmenu = false; this.runUpdateAction('module'); return; }
      if (lower === 'c') { this.updateSubmenu = false; this.runUpdateAction('config'); return; }
      if (lower === 'q') { this.updateSubmenu = false; this.render(); return; }
    }
  },

  async runUpdateAction(which) {
    if (this.executing) return;
    this.executing = true;
    this.pushLog(`${c.cyan}> Update ${which}${c.reset}`);
    this.suspend();
    try {
      if (which === 'module') await doUpdateModule(false);
      else await doUpdateConfig(false);
    } catch (err) {
      this.pushLog(`${c.red}Error: ${err.message}${c.reset}`);
    } finally {
      this.executing = false;
      this.resume();
    }
  },

  handleDebugInput(str) {
    let i = 0;
    while (i < str.length) {
      const ch = str[i];
      if (ch === '\x03') {
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
    if (key === 'd') { await this.runDebugInTui(); return; }
    if (key === 'u') { this.updateSubmenu = true; this.render(); return; }
    if (key === 'p') {
      this.suspend();
      try {
        await cmdPreview([]);
      } catch (err) {
        this.pushLog(`${c.red}Error: ${err.message}${c.reset}`);
      } finally {
        this.resume();
      }
      return;
    }
    const needsSuspend = ['1', '2', '3'];
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

function tryCheckDependencies() {
  const missing = [];
  try { require.resolve('archiver'); }
  catch (_) { missing.push({ mod: 'archiver', version: '5.3.0' }); }
  try {
    const m = require('marked');
    if (typeof m.parse !== 'function') missing.push({ mod: 'marked', version: '4.0.0', old: true });
  } catch (_) {
    missing.push({ mod: 'marked', version: '4.0.0' });
  }
  try { require.resolve('turndown'); }
  catch (_) { missing.push({ mod: 'turndown', version: '7.2.4' }); }
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    deps: {
      archiver: require('archiver'),
      marked: require('marked'),
      TurndownService: require('turndown'),
    },
  };
}

function printMissingDeps(missing) {
  for (const m of missing) {
    if (m.old) console.error(t('marked_old'));
    else console.error(t('missing_dep', { mod: m.mod, version: m.version }));
  }
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
  if (TUI.active && !TUI.suspended) return TUI.askUser(prompt);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pauseBeforeMenu(seconds = 3) {
  if (TUI.active) return;
  if (OPTS.quiet || OPTS.json) return;
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

// ─── Symlink-safe walkers ──────────────────────────────────────────────
function walkMdFiles(dir, seen = new Set()) {
  let results = [];
  let real;
  try { real = fs.realpathSync(dir); } catch (_) { return results; }
  if (seen.has(real)) return results;
  seen.add(real);
  let list;
  try { list = fs.readdirSync(dir); } catch (_) { return results; }
  for (const item of list) {
    const fullPath = path.join(dir, item);
    let stat;
    try { stat = fs.lstatSync(fullPath); } catch (_) { continue; }
    if (stat.isSymbolicLink()) {
      let targetStat;
      try { targetStat = fs.statSync(fullPath); } catch (_) { continue; }
      if (targetStat.isDirectory()) results = results.concat(walkMdFiles(fullPath, seen));
      else if (targetStat.isFile() && fullPath.toLowerCase().endsWith('.md')) results.push(fullPath);
      continue;
    }
    if (stat.isDirectory()) {
      results = results.concat(walkMdFiles(fullPath, seen));
    } else if (stat.isFile() && fullPath.toLowerCase().endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function walkXhtmlFiles(dir, seen = new Set()) {
  const exclude = ['cover.xhtml', 'toc.xhtml', 'nav.xhtml'];
  let results = [];
  let real;
  try { real = fs.realpathSync(dir); } catch (_) { return results; }
  if (seen.has(real)) return results;
  seen.add(real);
  let list;
  try { list = fs.readdirSync(dir); } catch (_) { return results; }
  for (const item of list) {
    const fullPath = path.join(dir, item);
    let stat;
    try { stat = fs.lstatSync(fullPath); } catch (_) { continue; }
    if (stat.isSymbolicLink()) {
      let targetStat;
      try { targetStat = fs.statSync(fullPath); } catch (_) { continue; }
      if (targetStat.isDirectory()) results = results.concat(walkXhtmlFiles(fullPath, seen));
      else if (targetStat.isFile() && fullPath.toLowerCase().endsWith('.xhtml')) {
        const base = path.basename(fullPath).toLowerCase();
        if (!exclude.includes(base)) results.push(fullPath);
      }
      continue;
    }
    if (stat.isDirectory()) {
      results = results.concat(walkXhtmlFiles(fullPath, seen));
    } else if (stat.isFile() && fullPath.toLowerCase().endsWith('.xhtml')) {
      const base = path.basename(fullPath).toLowerCase();
      if (!exclude.includes(base)) results.push(fullPath);
    }
  }
  return results;
}

function walkFilesRecursive(dir, filterFn, seen = new Set()) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  let real;
  try { real = fs.realpathSync(dir); } catch (_) { return results; }
  if (seen.has(real)) return results;
  seen.add(real);
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return results; }
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    let isDir = item.isDirectory();
    let isFile = item.isFile();
    if (item.isSymbolicLink()) {
      try {
        const st = fs.statSync(fullPath);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch (_) { continue; }
    }
    if (isDir) {
      results.push(...walkFilesRecursive(fullPath, filterFn, seen));
    } else if (isFile && filterFn(fullPath)) {
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

// ─── Image size detector ───────────────────────────────────────────────
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
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
        if (i + 4 > buf.length) break;
        const len = buf.readUInt16BE(i + 2);
        if (len < 2) break;
        i += 2 + len;
      }
    }
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      const chunk = buf.slice(12, 16).toString();
      if (chunk === 'VP8 ') {
        return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF };
      } else if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3FFF) + 1, height: ((b >> 14) & 0x3FFF) + 1 };
      } else if (chunk === 'VP8X') {
        return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
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

// ─── Comic helpers ─────────────────────────────────────────────────────
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

function epubPathToPosix(p) {
  return String(p).split(path.sep).join('/');
}

function epubRelative(fromEpubFile, toEpubFile) {
  const fromDir = path.posix.dirname(epubPathToPosix(fromEpubFile));
  return path.posix.relative(fromDir, epubPathToPosix(toEpubFile));
}

// ─── Path safety ──────────────────────────────────────────────────────
function isSafeRelative(p) {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('\0')) return false;
  const normalized = path.posix.normalize(p.replace(/\\/g, '/'));
  if (normalized.startsWith('..')) return false;
  if (path.posix.isAbsolute(normalized)) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false;
  return true;
}

// ─── Sanitizer ────────────────────────────────────────────────────────
let _sanitizeWarned = false;
function sanitizeHtmlContent(html) {
  let sanitizeHtml;
  try { sanitizeHtml = require('sanitize-html'); }
  catch (_) {
    if (!_sanitizeWarned) {
      logI18n('sanitize_missing', {}, 'warn');
      _sanitizeWarned = true;
    }
    return String(html)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline',
      'polygon', 'text', 'defs', 'use', 'linearGradient', 'radialGradient',
      'stop', 'figure', 'figcaption', 'mark', 'ruby', 'rt', 'rp',
    ]),
    allowedAttributes: {
      '*': ['id', 'class', 'style', 'title', 'lang', 'dir', 'epub:type', 'role'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      'a': ['href', 'title', 'rel', 'id'],
      'svg': ['xmlns', 'viewBox', 'width', 'height', 'preserveAspectRatio'],
      'image': ['xlink:href', 'href', 'width', 'height'],
      'use': ['xlink:href', 'href'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data', 'tel', 'urn', 'file'],
    allowedSchemesByTag: { img: ['data', 'http', 'https', 'file'] },
    allowProtocolRelative: false,
  });
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
    if (line) entries.push({ path: line, alt, spread });
  }
  return entries;
}

function writeOrdFile(ordPath, entries, comicMode = false) {
  const lines = [];
  if (comicMode) {
    lines.push('# Page order list (one .xhtml per line, path relative to EPUB/xhtmls/)');
    lines.push('# Format: [*|!]path [| alt-text]');
    lines.push('#   *  = force page-spread-center (double spread)');
    lines.push('#   !  = force single spread');
    lines.push('#   (no prefix) = auto-detect');
    lines.push('');
  } else {
    lines.push('# Chapter order list (one .xhtml per line)');
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

// ─── XHTML from image ─────────────────────────────────────────────────
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

// ─── Sync XHTML from images ────────────────────────────────────────────
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
          if (!fitChanged && !cssChanged) needGen = false;
        }
      } catch (_) { needGen = true; }
    }

    if (!needGen) {
      skipped++;
      generatedPaths.push(epubPathToPosix(relXhtml));
      if (!silent) logI18n('img2x_skipped', { file: xhtmlPath }, 'info');
      continue;
    }

    if (OPTS.dryRun) {
      generated++;
      generatedPaths.push(epubPathToPosix(relXhtml));
      if (!silent) log(`[dry] Would generate: ${xhtmlPath}`, 'info');
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

// ─── img2xhtml command ────────────────────────────────────────────────
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

  // Alt text check
  const ordPathCheck = path.join(process.cwd(), 'ord.txt');
  if (fs.existsSync(ordPathCheck)) {
    const entries = parseOrdFile(ordPathCheck, true);
    for (const e of entries) {
      if (!e.alt) {
        logI18n('img2x_alt_missing', { file: e.path }, 'warn');
      }
    }
  }

  const ordPath = path.join(process.cwd(), 'ord.txt');
  const ordExists = fs.existsSync(ordPath);

  if (!ordExists) {
    if (OPTS.dryRun) {
      log(`[dry] Would create ord.txt with ${result.generatedPaths.length} entries`, 'info');
    } else {
      const entries = naturalSort(result.generatedPaths).map(p => ({ path: p, alt: null, spread: null }));
      writeOrdFile(ordPath, entries, true);
      logI18n('img2x_ord_created', { file: ordPath }, 'success');
    }
  } else if (regenOrd || force) {
    if (OPTS.dryRun) {
      log('[dry] Would regenerate ord.txt', 'info');
    } else {
      const ans = await question(t('img2x_ord_regen_confirm'));
      if (ans.trim().toLowerCase() === 'y') {
        const entries = naturalSort(result.generatedPaths).map(p => ({ path: p, alt: null, spread: null }));
        writeOrdFile(ordPath, entries, true);
        logI18n('img2x_ord_regen', { file: ordPath }, 'success');
      } else {
        logI18n('img2x_ord_cancelled', {}, 'warn');
      }
    }
  } else {
    const existing = parseOrdFile(ordPath, true);
    const existingSet = new Set(existing.map(e => epubPathToPosix(e.path)));
    const newEntries = [];
    for (const p of naturalSort(result.generatedPaths)) {
      const norm = epubPathToPosix(p);
      if (!existingSet.has(norm)) newEntries.push({ path: norm, alt: null, spread: null });
    }
    if (newEntries.length === 0) {
      logI18n('img2x_ord_skip', {}, 'info');
    } else if (OPTS.dryRun) {
      log(`[dry] Would append ${newEntries.length} entries to ord.txt`, 'info');
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

  emitJson({
    ok: true,
    generated: result.generated,
    skipped: result.skipped,
    total: result.total,
    dryRun: OPTS.dryRun,
  });

  closeRL();
}

function chapterTitleFromFolderOrOverride(epubDir, folder) {
  const override = readChapterTitleOverride(path.join(epubDir, 'xhtmls', folder));
  if (override) return override;
  return chapterTitleFromFolder(folder);
}

function collectComicPages(epubDir, ordPath) {
  const xhtmlsDir = path.join(epubDir, 'xhtmls');
  if (!fs.existsSync(xhtmlsDir)) return [];

  const allXhtml = walkFilesRecursive(xhtmlsDir, (p) => p.toLowerCase().endsWith('.xhtml'));
  if (allXhtml.length === 0) return [];

  const xhtmlRelSet = new Set(allXhtml.map(f => epubPathToPosix(path.relative(xhtmlsDir, f))));
  const ordEntries = parseOrdFile(ordPath, true);
  let ordered = [];

  if (ordEntries.length > 0) {
    for (const e of ordEntries) {
      const norm = epubPathToPosix(e.path);
      if (!isSafeRelative(norm)) {
        logI18n('ord_unsafe_path', { file: e.path }, 'warn');
        continue;
      }
      if (xhtmlRelSet.has(norm)) {
        ordered.push({ relPath: norm, alt: e.alt, spread: e.spread });
      } else {
        logI18n('warning_ord_not_found', { file: e.path }, 'warn');
      }
    }
    const orderedSet = new Set(ordered.map(o => o.relPath));
    const leftovers = naturalSort([...xhtmlRelSet].filter(p => !orderedSet.has(p)));
    for (const p of leftovers) ordered.push({ relPath: p, alt: null, spread: null });
  } else {
    ordered = naturalSort([...xhtmlRelSet]).map(p => ({ relPath: p, alt: null, spread: null }));
  }

  return ordered;
}

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

// ─── Marked renderer ──────────────────────────────────────────────────
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

// ─── DOCX mapping ─────────────────────────────────────────────────────
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
  try { require.resolve('cheerio'); useCheerio = true; } catch (_) {}

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
          for (const th of thresholds) { if (size >= th.size) { level = th.level; break; } }
          if (level > 0) {
            const $el = $(el);
            const content = $el.html();
            $el.replaceWith(`<h${level}>${content}</h${level}>`);
          }
        }
      }
    });
    return $.html();
  } else {
    const pRegex = /<p\s+([^>]*style="[^"]*font-size:(\d+)pt[^"]*"[^>]*)>([\s\S]*?)<\/p>/gi;
    let modified = html.replace(pRegex, (match, attrs, sizeStr, content) => {
      const size = parseInt(sizeStr);
      let level = 0;
      for (const th of thresholds) { if (size >= th.size) { level = th.level; break; } }
      if (level > 0) return `<h${level}>${content}</h${level}>`;
      return match;
    });
    if (!adjustHeadings._warned) {
      logI18n('docx_heading_mode_warn', {}, 'warn');
      adjustHeadings._warned = true;
    }
    return modified;
  }
}

// ─── Download & extract ───────────────────────────────────────────────
function isTarAvailable() {
  try { execSync('tar --version', { stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) { reject(new Error('Redirect without location header')); return; }
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    });
    request.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    request.end();
  });
}

function extractTarGz(tarballPath, destDir = '.', stripComponents = 0, srcPath = '') {
  return new Promise((resolve, reject) => {
    if (!isTarAvailable()) { reject(new Error(t('tar_not_found'))); return; }
    let entries;
    try {
      const out = execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' });
      entries = out.split('\n').map(s => s.trim()).filter(Boolean);
    } catch (err) { reject(new Error(`Failed to list archive: ${err.message}`)); return; }
    if (entries.length === 0) { reject(new Error('Archive is empty or invalid')); return; }
    const topFolder = entries[0].split('/')[0];
    if (!topFolder) { reject(new Error('Cannot determine top-level folder')); return; }
    let targetArg = null;
    if (srcPath) {
      const needle = `${topFolder}/${srcPath}`;
      const found = entries.some(e => e === needle || e.startsWith(needle + '/'));
      if (!found) { reject(new Error(t('extract_no_assets'))); return; }
      targetArg = needle;
    }
    const args = ['-xzf', tarballPath, `--strip-components=${stripComponents}`, '-C', destDir];
    if (targetArg) args.push(targetArg);
    try {
      execFileSync('tar', args, { stdio: 'inherit' });
      resolve();
    } catch (err) { reject(err); }
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
    if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath);
  }
}

// ─── createdir ────────────────────────────────────────────────────────
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

  if (type === 'textbook') await createTextbookStructure();
  else await createComicStructure(type);

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

  const ordTemplate = '# Chapter order list (one .xhtml per line)\n';
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
    '# Page order list (one .xhtml per line, path relative to EPUB/xhtmls/)',
    '# Format: [*|!]path [| alt-text]',
    '#   *  = force page-spread-center (double spread)',
    '#   !  = force single spread',
    '#   (no prefix) = auto-detect',
    '#',
    '# Example:',
    '#   ch1/0001.xhtml | Haruko enters the cafe',
    '#   ch1/0002.xhtml | "Where did you go?"',
    '#   *ch2/0001.xhtml | Double spread opening',
    '#',
    '# Leave empty for auto-sort. Run "convertch img2xhtml" to generate automatically.',
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
#  BOOK METADATA - edit values below as needed
# ============================================================

# Book type: textbook | comic | manga
type: textbook

# Main title (required)
title: Book Title

# Subtitle (optional)
subtitle: Subtitle

# Volume (optional)
volume: Vol. 1

# Author (required)
author: Author Name

# Language (default: en)
language: en

# Unique identifier (URN or ISBN), leave empty for auto
identifier: 

# Publish date (YYYY-MM-DD), leave empty for today
date: 

# Publisher (optional)
publisher: 

# Description / synopsis (optional)
description: Short description of the book.

# Subjects / categories, comma separated
subjects: Fiction, Adventure

# Series name (optional)
series_name: 

# Series number (optional)
series_number: 

# Additional contributors: name|role, name|role, ...
# Roles: aut (author), edt (editor), ill (illustrator), etc.
contributors: 

# Extra titles (optional), comma separated
extra_titles: 

# ============================================================
#  DOCX -> MARKDOWN CONVERSION (optional)
# ============================================================
# [docx-mapping]
# heading1 = 24
# heading2 = 18
# heading3 = 14

# ============================================================
#  DIRECTORY STRUCTURE (textbook):
#
#   ./
#   |-- config.txt
#   |-- ord.txt          <- optional
#   |-- Docs/            <- source .docx
#   |-- Markdowns/       <- source .md
#   |-- EPUB/
#       |-- images/
#       |   |-- cover.png   <- REQUIRED
#       |-- audiovideo/     <- optional
#       |-- bab1.xhtml      <- chapters (in EPUB/ root)
#
#  Run:  node epubcreator.js build
# ============================================================
`;
}

function buildComicConfigTemplate(type, direction) {
  return `# ============================================================
#  BOOK METADATA - edit values below as needed
# ============================================================

# Book type: textbook | comic | manga
type: ${type}

# Reading direction: ltr | rtl
reading_direction: ${direction}

# Spread behavior: auto | none | landscape | both
spread: auto

# Image fit mode: contain | cover | width | height | none
fit_mode: contain

# Custom CSS (optional). Leave empty to auto-detect from EPUB/styles/
custom_css: 

# Main title (required)
title: Comic Title

# Subtitle (optional)
subtitle: 

# Volume (optional)
volume: 

# Author (required)
author: Author Name

# Language (default: en)
language: en

# Unique identifier, leave empty for auto
identifier: 

# Publish date (YYYY-MM-DD)
date: 

# Publisher (optional)
publisher: 

# Description / synopsis (optional)
description: 

# Subjects / categories, comma separated
subjects: 

# Series name (optional)
series_name: 

# Series number (optional)
series_number: 

# Additional contributors: name|role, name|role
contributors: 

# Extra titles (optional)
extra_titles: 

# ============================================================
#  DIRECTORY STRUCTURE (comic/manga):
#
#   ./
#   |-- config.txt
#   |-- ord.txt             <- optional: [*|!]path [| alt]
#   |-- EPUB/
#       |-- images/
#       |   |-- cover.jpg   <- REQUIRED
#       |   |-- pages/
#       |       |-- ch1/
#       |       |   |-- 0001.jpg
#       |       |-- ch2/
#       |           |-- 0001.jpg
#       |-- xhtmls/         <- auto-generated by "convertch img2xhtml"
#       |-- styles/         <- optional custom CSS
#       |-- about.xhtml     <- back-matter (optional, reflowable)
#
#  Flow:
#    1. Put page images at EPUB/images/pages/
#    2. node epubcreator.js convertch img2xhtml
#    3. node epubcreator.js build
# ============================================================
`;
}

// ─── MD -> XHTML ──────────────────────────────────────────────────────
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

  // Incremental: skip if xhtml newer than md
  if (!force && fs.existsSync(xhtmlFile)) {
    try {
      const mdStat = fs.statSync(mdFile);
      const xhStat = fs.statSync(xhtmlFile);
      if (xhStat.mtimeMs >= mdStat.mtimeMs) {
        logI18n('convert_incremental_skip', { file: path.basename(xhtmlFile) }, 'info');
        return true;
      }
    } catch (_) { /* fall through to prompt */ }
  }

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
  if (!title) title = path.basename(mdFile, '.md');

  const renderer = createXhtmlRenderer(marked);
  let htmlContent;
  try {
    htmlContent = marked.parse(mdContent, { renderer });
    htmlContent = sanitizeHtmlContent(htmlContent);
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

  if (OPTS.dryRun) {
    log(`[dry] Would write: ${xhtmlFile}`, 'info');
    return true;
  }

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

async function cmdConvertCh(filePath, force = false, marked, forceAll = false) {
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

  if (forceAll) {
    logI18n('convert_incremental_force_all', {}, 'info');
    force = true;
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
    const ok = await convertOneMdFile(target, outputDir, force, marked);
    emitJson({ ok: !!ok, file: target });
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

    // Incremental check for batch prompt — only prompt if files are out of date
    let overwriteAll = force;
    if (!force) {
      const stale = mdFiles.filter(f => {
        const rel = path.relative(target, f);
        const xhtmlPath = path.join(outputDir, rel.replace(/\.md$/i, '.xhtml'));
        if (!fs.existsSync(xhtmlPath)) return false;
        try {
          return fs.statSync(f).mtimeMs > fs.statSync(xhtmlPath).mtimeMs;
        } catch (_) { return true; }
      });
      if (stale.length > 0) {
        const answer = await question(t('xhtml_exists', { count: stale.length }));
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
    }

    let successCount = 0;
    for (const md of mdFiles) {
      const ok = await convertOneMdFile(md, outputDir, overwriteAll, marked);
      if (ok) successCount++;
    }
    logI18n('convert_summary', { success: successCount, total: mdFiles.length }, 'info');

    const settings = loadSettings();
    if (settings.auto_build === 'true' && successCount > 0 && !OPTS.dryRun) {
      log('Auto-build enabled, building...', 'info');
      await buildEpub(require('archiver'));
    }

    emitJson({ ok: true, converted: successCount, total: mdFiles.length, dryRun: OPTS.dryRun });
    closeRL();
    return;
  }

  logI18n('invalid_path', {}, 'error');
  closeRL();
}

// ─── XHTML -> MD ──────────────────────────────────────────────────────
function convertOneXhtmlFile(xhtmlFile, outputDir, TurndownService) {
  const epubBase = path.join(process.cwd(), 'EPUB');
  let relPath;
  if (xhtmlFile.startsWith(epubBase)) relPath = path.relative(epubBase, xhtmlFile);
  else relPath = path.relative(process.cwd(), xhtmlFile);
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
  if (title) markdown = `## ${title}\n\n${markdown}`;

  if (OPTS.dryRun) {
    log(`[dry] Would write: ${mdFile}`, 'info');
    return true;
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

// ─── DOCX -> MD ───────────────────────────────────────────────────────
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
    else if (arg === '--output' && i + 1 < argv.length) { output = argv[i + 1]; i++; }
    else if (!arg.startsWith('--')) input = arg;
  }

  let mammoth;
  try { mammoth = require('mammoth'); }
  catch (_) {
    logI18n('missing_dep', { mod: 'mammoth', version: '1.6.0' }, 'error');
    log('Install with: npm install mammoth@1.6.0', 'info');
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
        if (fs.statSync(full).isFile() && f.toLowerCase().endsWith('.docx')) docxFiles.push(full);
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

  if (nosplit) logI18n('docx_nosplit_mode', {}, 'info');

  const isMultiple = docxFiles.length > 1;
  for (const docxFile of docxFiles) {
    const baseName = path.basename(docxFile, '.docx');
    let outDir = isMultiple ? path.join(output, baseName) : output;
    ensureDir(outDir);
    logI18n('docx_processing', { file: path.basename(docxFile) }, 'info');

    try {
      const result = await mammoth.convertToHtml({ path: docxFile });
      const modifiedHtml = adjustHeadings(result.value, mapping);
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
      if (parts.length === 0) parts.push(markdown);

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
        if (OPTS.dryRun) log(`[dry] Would write: ${mdPath}`, 'info');
        else { fs.writeFileSync(mdPath, combined, 'utf8'); logI18n('created', { file: mdPath }, 'success'); }
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
          if (OPTS.dryRun) log(`[dry] Would write: ${mdPath}`, 'info');
          else { fs.writeFileSync(mdPath, content, 'utf8'); logI18n('created', { file: mdPath }, 'success'); }
        }
      }

      if (!noImages) logI18n('docx_no_images', {}, 'warn');
    } catch (err) {
      logI18n('convert_fail', { file: path.basename(docxFile), error: err.message }, 'error');
    }
  }

  logI18n('docx_done', {}, 'success');
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
    else if (arg === '--output' && i + 1 < argv.length) { outputDir = argv[i + 1]; i++; }
    else if (!arg.startsWith('--')) inputPath = arg;
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
  let totalParts = 0;
  for (const mdFile of mdFiles) {
    logI18n('split_processing', { file: path.basename(mdFile) }, 'info');
    try {
      const content = fs.readFileSync(mdFile, 'utf8');
      const parts = content.split(/(?=^##\s+)/m).filter(p => p.trim() !== '');
      if (parts.length === 0) {
        const baseName = path.basename(mdFile, '.md');
        const dest = path.join(outDir, `${baseName}.md`);
        if (fs.existsSync(dest) && !force) {
          const ans = await question(t('file_exists', { file: path.basename(dest) }));
          if ((ans || '').toLowerCase() !== 'y') {
            logI18n('skip_file', { file: path.basename(dest) }, 'warn');
            continue;
          }
        }
        if (OPTS.dryRun) log(`[dry] Would write: ${dest}`, 'info');
        else { fs.writeFileSync(dest, content, 'utf8'); logI18n('split_created', { file: dest }, 'success'); }
        totalParts++;
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
          if (OPTS.dryRun) log(`[dry] Would write: ${dest}`, 'info');
          else { fs.writeFileSync(dest, part, 'utf8'); logI18n('split_created', { file: dest }, 'success'); }
          totalParts++;
        }
        logI18n('split_parts', { count: parts.length }, 'info');
        successCount++;
      }
    } catch (err) {
      logI18n('convert_fail', { file: path.basename(mdFile), error: err.message }, 'error');
    }
  }

  if (OPTS.dryRun) logI18n('split_dry', { count: totalParts, dir: outDir }, 'info');
  logI18n('split_summary', { success: successCount, total: mdFiles.length }, 'info');
  emitJson({ ok: true, files: successCount, parts: totalParts, outputDir: outDir, dryRun: OPTS.dryRun });
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
    else if (arg === '--output' && i + 1 < argv.length) { outputFile = argv[i + 1]; i++; }
    else if (!arg.startsWith('--')) inputPath = arg;
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
  if (OPTS.dryRun) {
    logI18n('merge_dry', { count: mdFiles.length, output: outPath }, 'info');
    emitJson({ ok: true, count: mdFiles.length, output: outPath, dryRun: true });
    closeRL();
    return;
  }

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
  emitJson({ ok: true, count: mdFiles.length, output: outPath });
  closeRL();
}

// ─── Build core ───────────────────────────────────────────────────────
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
  if (!media.cover) logI18n('cover_missing', {}, 'warn');
  else logI18n('cover_found', { file: media.cover }, 'info');
  logI18n('media_summary', { images: media.images.length, audio: media.audio.length }, 'info');

  const buildsDir = path.join(cwd, 'builds');
  ensureDir(buildsDir);
  const epubFilename = `${rootName}.epub`;
  const epubPath = path.join(buildsDir, epubFilename);

  if (OPTS.dryRun) {
    logI18n('build_dry', {
      file: epubPath,
      chapters: chapters.length,
      images: media.images.length,
      audio: media.audio.length,
    }, 'info');
    emitJson({
      ok: true, dryRun: true, path: epubPath,
      chapters: chapters.length, images: media.images.length, audio: media.audio.length,
    });
    return;
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
      emitJson({ ok: true, path: epubPath, sizeKB: parseFloat(size), chapters: chapters.length });
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
          if (fs.statSync(src).isFile()) archive.file(src, { name: `EPUB/${sub}/${f}` });
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

async function buildComicEpub(archiver, config, epubDir, type) {
  const cwd = process.cwd();
  const rootName = path.basename(cwd);
  const ordPath = path.join(cwd, 'ord.txt');

  const direction = (config.reading_direction || defaultDirectionFor(type)).toLowerCase();
  const spread = (config.spread || 'auto').toLowerCase();
  const fitMode = (config.fit_mode || 'contain').toLowerCase();

  logI18n('comic_mode', { type, direction, spread }, 'info');

  const cssRelPaths = collectCssFiles(epubDir, config);
  if (cssRelPaths.length > 0) logI18n('comic_css_found', { list: cssRelPaths.join(', ') }, 'info');

  logI18n('comic_syncing', {}, 'info');
  await syncXhtmlFromImages(epubDir, { silent: true, force: false, fitMode, cssRelPaths });

  const pages = collectComicPages(epubDir, ordPath);
  if (pages.length === 0) {
    logI18n('comic_xhtmls_missing', {}, 'error');
    return;
  }
  logI18n('comic_pages_found', { count: pages.length }, 'info');

  const media = collectMediaComic(epubDir);
  if (!media.cover) logI18n('cover_missing', {}, 'warn');
  else logI18n('cover_found', { file: media.cover }, 'info');
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
    if (isCenter) currentSide = (direction === 'rtl') ? 'right' : 'left';
    else currentSide = currentSide === 'left' ? 'right' : 'left';

    let title = p.alt;
    if (!title) {
      const xhtmlPath = path.join(epubDir, 'xhtmls', p.relPath);
      try {
        const content = fs.readFileSync(xhtmlPath, 'utf8');
        const m = content.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (m && m[1].trim() && m[1].trim().toLowerCase() !== 'page') title = m[1].trim();
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

  if (OPTS.dryRun) {
    logI18n('build_dry', {
      file: epubPath,
      chapters: chapters.length,
      images: media.pages.length + media.illustrations.length,
      audio: media.audio.length,
    }, 'info');
    emitJson({
      ok: true, dryRun: true, path: epubPath,
      pages: chapters.length, images: media.pages.length + media.illustrations.length,
      audio: media.audio.length,
    });
    return;
  }

  let coverSize = null;
  if (media.cover) coverSize = getImageSize(path.join(epubDir, 'images', media.cover));

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
      emitJson({ ok: true, path: epubPath, sizeKB: parseFloat(size), pages: chapters.length });
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
      if (item.toLowerCase().endsWith('.xhtml')) archive.file(src, { name: `EPUB/${item}` });
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

// ─── Debug ────────────────────────────────────────────────────────────
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
  if (isTermux) {
    logI18n('debug_termux_warning', {}, 'warn');
  }
  if (isComicType(type)) return await cmdDebugComic(archiver, type);
  return await cmdDebugTextbook(archiver, marked);
}

async function cmdDebugTextbook(archiver, marked) {
  const markdownsDir = path.join(process.cwd(), 'Markdowns');
  const epubDir = path.join(process.cwd(), 'EPUB');
  if (!fs.existsSync(markdownsDir)) { logI18n('markdowns_not_found', {}, 'error'); return; }
  if (!fs.existsSync(epubDir)) { logI18n('epub_dir_not_found', {}, 'error'); return; }

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
  if (!fs.existsSync(pagesDir)) { logI18n('comic_pages_dir_missing', {}, 'error'); return; }

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

// ─── parseConfig ──────────────────────────────────────────────────────
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
    // Strip trailing comment only if preceded by space and not quoted
    if (!value.includes('"') && !value.includes("'")) {
      const commentMatch = value.match(/^(.*?)\s+#/);
      if (commentMatch) value = commentMatch[1].trim();
    }
    if (key && value) config[key] = value;
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

  if (config.extra_titles) config.extra_titles = config.extra_titles.split(',').map(s => s.trim()).filter(Boolean);
  else config.extra_titles = [];

  if (config.subjects) config.subjects = config.subjects.split(',').map(s => s.trim()).filter(Boolean);
  else config.subjects = [];

  config.type = (config.type || 'textbook').toLowerCase();
  if (!VALID_TYPES.includes(config.type)) config.type = 'textbook';

  return config;
}

// ─── Chapter collection (textbook) ────────────────────────────────────
function collectChapters(epubDir, ordPath) {
  const allFiles = fs.readdirSync(epubDir);
  const xhtmlFiles = allFiles.filter(f =>
    f.endsWith('.xhtml') &&
    !['cover.xhtml', 'toc.xhtml', 'nav.xhtml'].includes(f.toLowerCase())
  );

  let order = [];
  if (fs.existsSync(ordPath)) {
    const content = fs.readFileSync(ordPath, 'utf8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    for (const line of lines) {
      if (!isSafeRelative(line)) {
        logI18n('ord_unsafe_path', { file: line }, 'warn');
        continue;
      }
      const found = xhtmlFiles.find(f => f === line);
      if (found) order.push(found);
      else logI18n('warning_ord_not_found', { file: line }, 'warn');
    }
  }

  if (order.length === 0) order = naturalSort(xhtmlFiles);

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
      if (/\.(mp3|m4a|ogg|wav|mp4|webm)$/i.test(f)) result.audio.push(f);
    }
  }
  return result;
}

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
      if (/^cover\./i.test(f)) result.cover = f;
      else result.illustrations.push(f);
    }
  }
  if (fs.existsSync(pagesDir)) {
    const pages = walkFilesRecursive(pagesDir, isImageFile);
    for (const p of pages) result.pages.push(path.relative(epubDir, p));
  }
  if (fs.existsSync(audioDir)) {
    const files = walkFilesRecursive(audioDir, (f) => /\.(mp3|m4a|ogg|wav|mp4|webm)$/i.test(f));
    for (const f of files) result.audio.push(path.relative(audioDir, f));
  }
  return result;
}

// ─── MIME ─────────────────────────────────────────────────────────────
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
    '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.xhtml': 'application/xhtml+xml', '.html': 'application/xhtml+xml',
    '.xml': 'application/xml', '.css': 'text/css',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── OPF generation ───────────────────────────────────────────────────
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
  for (const tt of extraTitles) if (tt.trim()) titles.push(tt.trim());
  for (const tt of titles) metadata.push(`<dc:title>${escapeXml(tt)}</dc:title>`);

  if (creator) metadata.push(`<dc:creator id="creator">${escapeXml(creator)}</dc:creator>`);

  for (const cc of contributors) {
    const role = cc.role || 'ctb';
    if (role === 'aut' && !creator) metadata.push(`<dc:creator id="creator">${escapeXml(cc.name)}</dc:creator>`);
    else {
      const roleLabel = role === 'aut' ? 'author' : (role === 'edt' ? 'editor' : role);
      metadata.push(`<dc:contributor>${escapeXml(cc.name)} (${roleLabel})</dc:contributor>`);
    }
  }

  for (const s of subjects) if (s.trim()) metadata.push(`<dc:subject>${escapeXml(s)}</dc:subject>`);

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
    if (seriesNumber) metadata.push(`<meta property="group-position" refines="#collection">${escapeXml(seriesNumber)}</meta>`);
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
  if (isComic) spine.push(`<itemref idref="cover-xhtml" linear="yes" properties="page-spread-center"/>`);
  else spine.push(`<itemref idref="cover-xhtml" linear="yes"/>`);

  manifest.push(`<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  spine.push(`<itemref idref="toc" linear="no"/>`);

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const id = isComic ? `page_${i}` : `chap_${i}`;
    manifest.push(`<item id="${id}" href="${escapeXml(ch.path)}" media-type="application/xhtml+xml"/>`);
    if (isComic && ch.spread) spine.push(`<itemref idref="${id}" linear="yes" properties="${ch.spread}"/>`);
    else spine.push(`<itemref idref="${id}" linear="yes"/>`);
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
    manifest.push(`<item id="css_${i}" href="${escapeXml(cssRelPaths[i])}" media-type="text/css"/>`);
  }

  if (isComic) {
    for (let i = 0; i < media.illustrations.length; i++) {
      const img = media.illustrations[i];
      const id = `img_${i}_${String(img).replace(/[^a-zA-Z0-9]/g, '_')}`;
      manifest.push(`<item id="${id}" href="images/${escapeXml(img)}" media-type="${getMimeType(img)}"/>`);
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
      manifest.push(`<item id="${id}" href="images/${escapeXml(img)}" media-type="${getMimeType(img)}"/>`);
    }
  }

  for (let i = 0; i < media.audio.length; i++) {
    const av = media.audio[i];
    const id = `av_${i}_${String(av).replace(/[^a-zA-Z0-9]/g, '_')}`;
    manifest.push(`<item id="${id}" href="audiovideo/${escapeXml(av)}" media-type="${getMimeType(av)}"/>`);
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
        for (const p of pages) outer.push(`<li><a href="${escapeXml(p.path)}">${escapeXml(p.title)}</a></li>`);
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

function generateCoverXhtml(coverFilename, coverSize, options = {}) {
  const comic = options.comic === true;
  const cssRelPaths = options.cssRelPaths || [];
  const cssLinks = buildCssLinks('cover.xhtml', cssRelPaths);

  if (!coverFilename) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
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
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink" xml:lang="en" lang="en">
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

// ─── Import ───────────────────────────────────────────────────────────
async function cmdImport(argv) {
  let force = false;
  let outputDir = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--output' && i + 1 < argv.length) { outputDir = path.resolve(process.cwd(), argv[i + 1]); i++; }
  }

  let AdmZip, xml2js;
  try { AdmZip = require('adm-zip'); }
  catch (_) { logI18n('missing_dep', { mod: 'adm-zip', version: '0.5.10' }, 'error'); closeRL(); return; }
  try { xml2js = require('xml2js'); }
  catch (_) { logI18n('missing_dep', { mod: 'xml2js', version: '0.5.0' }, 'error'); closeRL(); return; }

  const cwd = process.cwd();
  const files = fs.readdirSync(cwd).filter(f => f.endsWith('.epub'));
  if (files.length === 0) { logI18n('import_no_epub', {}, 'error'); closeRL(); return; }

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
  if (!containerEntry) { console.error('META-INF/container.xml not found in EPUB.'); closeRL(); return; }
  const containerXml = containerEntry.getData().toString('utf8');
  const parser = new xml2js.Parser();
  let opfPath;
  try {
    const parsed = await parser.parseStringPromise(containerXml);
    const rootfile = parsed.container?.rootfiles?.[0]?.rootfile?.[0]?.$?.['full-path'];
    if (rootfile) opfPath = rootfile;
  } catch (_) {}
  if (!opfPath) { console.error('Failed to read OPF path from container.xml.'); closeRL(); return; }

  const opfEntry = zipEntries.find(e => e.entryName === opfPath);
  if (!opfEntry) { console.error(`OPF not found: ${opfPath}`); closeRL(); return; }
  const opfXml = opfEntry.getData().toString('utf8');
  let opfParsed;
  try { opfParsed = await parser.parseStringPromise(opfXml); }
  catch (_) { console.error('Failed to parse OPF.'); closeRL(); return; }

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

  let seriesName = '', seriesNumber = '', renditionLayout = '', renditionSpread = '';
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
    if (id && href) manifestMap[id] = { href, mediaType, properties };
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

  // SAFE resolveHref with zip-slip protection
  function resolveHref(href) {
    if (!href || typeof href !== 'string') throw new Error('Empty href');
    if (href.includes('\0')) throw new Error(`Unsafe path in EPUB: ${href}`);
    const joined = path.posix.normalize(path.posix.join(opfDir, href));
    if (joined.startsWith('..') || path.posix.isAbsolute(joined) || /^[a-zA-Z]:/.test(joined)) {
      throw new Error(`Unsafe path in EPUB: ${href}`);
    }
    return joined;
  }

  function findZipEntryByHref(href) {
    let epubInternal;
    try { epubInternal = resolveHref(href); }
    catch (err) {
      logI18n('import_unsafe_path', { path: href }, 'warn');
      return null;
    }
    return zipEntries.find(e => e.entryName === epubInternal);
  }

  let coverFound = false, coverExt = null;
  for (const id in manifestMap) {
    const item = manifestMap[id];
    if (item.properties && item.properties.includes('cover-image')) {
      const entry = findZipEntryByHref(item.href);
      if (entry) {
        const ext = path.extname(entry.entryName).toLowerCase() || '.jpg';
        const dest = path.join(imagesTarget, `cover${ext}`);
        if (fs.existsSync(dest) && !force) logI18n('not_modified', { file: dest }, 'warn');
        else {
          ensureDir(path.dirname(dest));
          if (!OPTS.dryRun) fs.writeFileSync(dest, entry.getData());
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
            if (fs.existsSync(dest) && !force) logI18n('not_modified', { file: dest }, 'warn');
            else {
              if (!OPTS.dryRun) fs.writeFileSync(dest, entry.getData());
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
        if (item.properties && item.properties.includes('cover-image')) return item.href;
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
            if (!OPTS.dryRun) fs.writeFileSync(dest, entry.getData());
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
          if (!OPTS.dryRun) fs.writeFileSync(dest, entry.getData());
          logI18n('created', { file: dest }, 'success');
        }
        continue;
      }

      const imgHref = imgMatch[1];
      const altMatch = xhtmlContent.match(/<img[^>]+alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '';

      let resolvedImg;
      try {
        const xhtmlDir = path.posix.dirname(resolveHref(item.href));
        resolvedImg = path.posix.normalize(path.posix.join(xhtmlDir, imgHref));
        if (resolvedImg.startsWith('..') || path.posix.isAbsolute(resolvedImg)) {
          logI18n('import_unsafe_path', { path: imgHref }, 'warn');
          continue;
        }
      } catch (err) {
        logI18n('import_unsafe_path', { path: item.href }, 'warn');
        continue;
      }
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
        if (!OPTS.dryRun) fs.writeFileSync(imgDest, imgEntry.getData());
        imageFiles.push(newImgName);
      }
      ordComicEntries.push({ path: `${newBase}.xhtml`, alt: alt || null, spread: null });
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
            if (!OPTS.dryRun) fs.writeFileSync(dest, entry.getData());
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

    if (!OPTS.dryRun) {
      if (fs.existsSync(configPath) && !force) {
        const ans = await question(t('file_exists', { file: 'config.txt' }));
        if ((ans || '').toLowerCase() === 'y') {
          fs.writeFileSync(configPath, configContent, 'utf8');
          logI18n('overwritten', { file: 'config.txt' }, 'success');
        } else logI18n('not_modified', { file: 'config.txt' }, 'warn');
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
        } else logI18n('not_modified', { file: 'ord.txt' }, 'warn');
      } else {
        writeOrdFile(ordPath, ordComicEntries, true);
        logI18n('import_ord_written', { count: ordComicEntries.length }, 'success');
      }
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

  // Textbook import
  function copyZipEntry(entryName, destPath, overwrite = false) {
    const entry = zipEntries.find(e => e.entryName === entryName);
    if (!entry) return false;
    if (fs.existsSync(destPath) && !overwrite) return false;
    ensureDir(path.dirname(destPath));
    if (!OPTS.dryRun) fs.writeFileSync(destPath, entry.getData());
    return true;
  }

  for (const id of spineOrder) {
    const item = manifestMap[id];
    if (!item) continue;
    if (item.mediaType === 'application/xhtml+xml' ||
        item.mediaType === 'application/xhtml+xml;charset=utf-8' ||
        item.mediaType === 'application/xhtml+xml; charset=utf-8') {
      let epubInternal;
      try { epubInternal = resolveHref(item.href); }
      catch (err) { logI18n('import_unsafe_path', { path: item.href }, 'warn'); continue; }
      const destRel = path.posix.relative(opfDir, epubInternal) || item.href;
      if (!isSafeRelative(destRel)) {
        logI18n('import_unsafe_path', { path: destRel }, 'warn');
        continue;
      }
      const dest = path.join(epubTarget, destRel);
      if (copyZipEntry(epubInternal, dest, force)) {
        chapterFiles.push(destRel);
        logI18n('created', { file: dest }, 'success');
      } else if (fs.existsSync(dest)) logI18n('not_modified', { file: dest }, 'warn');
    }
  }

  for (const id in manifestMap) {
    const item = manifestMap[id];
    if (!item.mediaType) continue;
    if (item.mediaType.startsWith('image/')) {
      const filename = path.basename(item.href);
      if (coverFound && /cover/i.test(filename)) continue;
      let epubInternal;
      try { epubInternal = resolveHref(item.href); }
      catch (err) { logI18n('import_unsafe_path', { path: item.href }, 'warn'); continue; }
      const dest = path.join(imagesTarget, filename);
      if (copyZipEntry(epubInternal, dest, force)) {
        imageFiles.push(filename);
        logI18n('created', { file: dest }, 'success');
      }
    } else if (item.mediaType.startsWith('audio/') || item.mediaType.startsWith('video/')) {
      const filename = path.basename(item.href);
      let epubInternal;
      try { epubInternal = resolveHref(item.href); }
      catch (err) { logI18n('import_unsafe_path', { path: item.href }, 'warn'); continue; }
      const dest = path.join(audioTarget, filename);
      if (copyZipEntry(epubInternal, dest, force)) {
        audioFiles.push(filename);
        logI18n('created', { file: dest }, 'success');
      }
    }
  }

  if (!OPTS.dryRun) {
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
      } else logI18n('not_modified', { file: 'config.txt' }, 'warn');
    } else {
      fs.writeFileSync(configPath, configContent, 'utf8');
      logI18n('created', { file: configPath }, 'success');
    }

    const ordPath = path.join(outputDir, 'ord.txt');
    let ordContent = '# Chapter order list (one .xhtml per line)\n';
    ordContent += chapterFiles.join('\n');
    if (fs.existsSync(ordPath) && !force) {
      const ans = await question(t('file_exists', { file: 'ord.txt' }));
      if ((ans || '').toLowerCase() === 'y') {
        fs.writeFileSync(ordPath, ordContent, 'utf8');
        logI18n('overwritten', { file: 'ord.txt' }, 'success');
      } else logI18n('not_modified', { file: 'ord.txt' }, 'warn');
    } else {
      fs.writeFileSync(ordPath, ordContent, 'utf8');
      logI18n('created', { file: ordPath }, 'success');
    }
  }

  logI18n('import_done', {}, 'success');
  logI18n('import_summary', {
    chapters: chapterFiles.length,
    images: imageFiles.length + (coverFound ? 1 : 0),
    audio: audioFiles.length,
  }, 'info');
  logI18n('import_hint', {}, 'info');
  emitJson({ ok: true, chapters: chapterFiles.length, images: imageFiles.length, audio: audioFiles.length });
  closeRL();
}

function buildImportTextbookConfig(d) {
  return `# ============================================================
#  BOOK METADATA - imported
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
#  DOCX -> MARKDOWN CONVERSION (optional)
# ============================================================
# [docx-mapping]
# heading1 = 24
# heading2 = 18
# heading3 = 14
`;
}

function buildImportComicConfig(d) {
  return `# ============================================================
#  BOOK METADATA - imported
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
#  NOTES:
#  Pages extracted to EPUB/images/pages/ (flat, no chapters)
#  XHTML generated to EPUB/xhtmls/
#  ord.txt populated according to original EPUB spine order
#  nav/toc from original EPUB is skipped automatically
# ============================================================
`;
}

// ─── update module / config ───────────────────────────────────────────
async function doUpdateModule(force = false) {
  const nodeModulesDir = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nodeModulesDir) && !force) {
    const ans = await question(t('update_confirm'));
    if ((ans || '').toLowerCase() !== 'y') { logI18n('cancelled', {}, 'warn'); return false; }
  } else if (fs.existsSync(nodeModulesDir) && force) {
    logI18n('update_force', {}, 'info');
  }
  try {
    const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/modules.tar.gz';
    await downloadAndExtract(url, process.cwd(), 'node_modules', 1);
    logI18n('extract_success', {}, 'success');
    return true;
  } catch (err) {
    logI18n('extract_failed', { error: err.message }, 'error');
    return false;
  }
}

async function doUpdateConfig(force = false) {
  const configDir = path.join(process.cwd(), TOOL_DIR);
  if (fs.existsSync(configDir) && !force) {
    const ans = await question(t('updateconfig_confirm'));
    if ((ans || '').toLowerCase() !== 'y') { logI18n('cancelled', {}, 'warn'); return false; }
  } else if (fs.existsSync(configDir) && force) {
    logI18n('updateconfig_force', {}, 'info');
  }
  try {
    const url = 'https://github.com/YogabyAllwaysever/epubcreator.js/archive/refs/heads/config.tar.gz';
    await downloadAndExtract(url, process.cwd(), '.epubcreator', 1);
    logI18n('updateconfig_success', {}, 'success');
    return true;
  } catch (err) {
    logI18n('updateconfig_failed', { error: err.message }, 'error');
    return false;
  }
}

async function cmdUpdateModule(force = false) {
  await doUpdateModule(force);
  closeRL();
}

async function cmdUpdateConfig(force = false) {
  await doUpdateConfig(force);
  closeRL();
}

// ─── settings ─────────────────────────────────────────────────────────
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
    const trimmed = (answer || '').trim();
    if (trimmed.toLowerCase() === 'save') {
      for (const kk of keys) if (newSettings[kk] === undefined) newSettings[kk] = current[kk];
      break;
    }
    if (trimmed.toLowerCase() === 'cancel') { logI18n('settings_cancelled', {}, 'warn'); closeRL(); return; }
    if (trimmed !== '') {
      if (k === 'watch_delay' && isNaN(parseInt(trimmed))) {
        logI18n('settings_invalid_value', {}, 'warn'); newSettings[k] = current[k];
      } else if (k === 'auto_build' && !['true', 'false'].includes(trimmed.toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn'); newSettings[k] = current[k];
      } else if (k === 'overwrite_policy' && !['ask', 'force', 'skip'].includes(trimmed.toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn'); newSettings[k] = current[k];
      } else if (k === 'default_type' && !VALID_TYPES.includes(trimmed.toLowerCase())) {
        logI18n('settings_invalid_value', {}, 'warn'); newSettings[k] = current[k];
      } else newSettings[k] = trimmed;
    } else newSettings[k] = current[k];
  }

  const content = Object.entries(newSettings).map(([k, v]) => `${k} = ${v}`).join('\n');
  ensureDir(TOOL_DIR);
  fs.writeFileSync(settingsPath, content, 'utf8');
  logI18n('settings_saved', { file: settingsPath }, 'success');
  closeRL();
}

// ─── validate ─────────────────────────────────────────────────────────
function findEpubcheck() {
  // 1. Check PATH
  try {
    execSync('epubcheck --version', { stdio: 'ignore' });
    return { command: 'epubcheck', args: [] };
  } catch (_) {}

  // 2. Check .epubcreator/tools/epubcheck/
  const toolDir = path.join(process.cwd(), TOOL_DIR, 'tools', 'epubcheck');
  const jarPath = path.join(toolDir, 'epubcheck.jar');
  if (fs.existsSync(jarPath)) {
    try {
      execSync('java -version', { stdio: 'ignore' });
      return { command: 'java', args: ['-jar', jarPath] };
    } catch (_) {
      return { error: 'java_missing' };
    }
  }

  return { error: 'not_found' };
}

async function cmdValidate() {
  const buildsDir = path.join(process.cwd(), 'builds');
  if (!fs.existsSync(buildsDir)) { logI18n('validate_no_epub', {}, 'error'); closeRL(); return; }
  const files = fs.readdirSync(buildsDir).filter(f => f.endsWith('.epub'));
  if (files.length === 0) { logI18n('validate_no_epub', {}, 'error'); closeRL(); return; }
  const latest = files.sort().pop();
  const epubPath = path.join(buildsDir, latest);
  logI18n('validate_start', { file: latest }, 'info');

  const checker = findEpubcheck();
  if (checker.error === 'not_found') {
    logI18n('validate_epubcheck_missing', {}, 'error');
    emitJson({ ok: false, error: 'epubcheck_missing' });
    closeRL();
    return;
  }
  if (checker.error === 'java_missing') {
    logI18n('validate_java_missing', {}, 'error');
    emitJson({ ok: false, error: 'java_missing' });
    closeRL();
    return;
  }

  try {
    const cmd = `${checker.command} ${checker.args.join(' ')} "${epubPath}"`;
    const output = execSync(cmd, { encoding: 'utf8' });
    logI18n('validate_ok', { file: latest }, 'success');
    if (!OPTS.quiet && !OPTS.json) console.log(output);
    emitJson({ ok: true, file: latest });
  } catch (err) {
    logI18n('validate_fail', { output: err.stdout || err.message }, 'error');
    emitJson({ ok: false, file: latest, output: err.stdout || err.message });
  }
  closeRL();
}

// ─── stats ────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `~${m}m`;
  return `~${h}h ${m}m`;
}

function countWordsInFile(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    // Strip XML/HTML tags, then count words
    const text = content.replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ');
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return words.length;
  } catch (_) { return 0; }
}

function dirSize(dir) {
  let total = 0;
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) total += dirSize(full);
        else if (st.isFile()) total += st.size;
      } catch (_) {}
    }
  } catch (_) {}
  return total;
}

async function cmdStats(argv) {
  const cwd = process.cwd();
  const config = safeParseConfig();
  if (!config) {
    logI18n('stats_no_config', {}, 'error');
    emitJson({ ok: false, error: 'no_config' });
    closeRL();
    return;
  }

  const type = (config.type || 'textbook').toLowerCase();
  const epubDir = path.join(cwd, 'EPUB');
  const result = { ok: true, type };

  console.log('');
  console.log(c.bold + t('stats_title', { dir: path.basename(cwd) }) + c.reset);
  console.log(t('stats_type', { type }));

  if (isComicType(type)) {
    const direction = (config.reading_direction || defaultDirectionFor(type)).toUpperCase();
    console.log(t('stats_direction', { direction }));

    const pagesDir = path.join(epubDir, 'images', 'pages');
    let pages = 0, chapters = 0;
    const chapterSet = new Set();
    let spreads = 0;

    if (fs.existsSync(pagesDir)) {
      const imgs = walkFilesRecursive(pagesDir, isImageFile);
      pages = imgs.length;
      for (const img of imgs) {
        const rel = path.relative(pagesDir, img);
        const parts = rel.split(/[\\/]/);
        if (parts.length > 1) chapterSet.add(parts[0]);
      }
      // Spread detection
      for (const img of imgs) {
        const size = getImageSize(img) || getSvgSize(img);
        if (size && size.height > 0 && size.width / size.height > 1.4) spreads++;
      }
    }
    chapters = chapterSet.size;

    console.log(t('stats_chapters', { count: chapters || '0 (flat)' }));
    console.log(t('stats_pages', { count: pages }));
    if (spreads > 0) console.log(`  Double spreads: ${spreads}`);

    const imagesDir = path.join(epubDir, 'images');
    let imgCount = 0, imgSize = 0;
    if (fs.existsSync(imagesDir)) {
      const allImgs = walkFilesRecursive(imagesDir, isImageFile);
      imgCount = allImgs.length;
      for (const f of allImgs) { try { imgSize += fs.statSync(f).size; } catch (_) {} }
    }
    console.log(t('stats_images', { count: imgCount, size: formatBytes(imgSize) }));

    const audioDir = path.join(epubDir, 'audiovideo');
    let audCount = 0, audSize = 0;
    if (fs.existsSync(audioDir)) {
      const files = walkFilesRecursive(audioDir, () => true);
      audCount = files.length;
      for (const f of files) { try { audSize += fs.statSync(f).size; } catch (_) {} }
    }
    if (audCount > 0) console.log(t('stats_audio', { count: audCount, size: formatBytes(audSize) }));

    Object.assign(result, { pages, chapters, images: imgCount, audio: audCount });
  } else {
    // Textbook
    let chapters = 0, words = 0;
    if (fs.existsSync(epubDir)) {
      const xhtmls = fs.readdirSync(epubDir).filter(f =>
        f.endsWith('.xhtml') && !['cover.xhtml', 'toc.xhtml', 'nav.xhtml'].includes(f.toLowerCase())
      );
      chapters = xhtmls.length;
      for (const f of xhtmls) words += countWordsInFile(path.join(epubDir, f));
    }
    const readMinutes = words / 260;

    console.log(t('stats_chapters', { count: chapters }));
    console.log(t('stats_words', { count: words.toLocaleString('en-US'), readtime: formatDuration(readMinutes) }));

    const imagesDir = path.join(epubDir, 'images');
    let imgCount = 0, imgSize = 0;
    if (fs.existsSync(imagesDir)) {
      for (const f of fs.readdirSync(imagesDir)) {
        const full = path.join(imagesDir, f);
        if (fs.statSync(full).isFile() && isImageFile(f)) {
          imgCount++; try { imgSize += fs.statSync(full).size; } catch (_) {}
        }
      }
    }
    console.log(t('stats_images', { count: imgCount, size: formatBytes(imgSize) }));

    const audioDir = path.join(epubDir, 'audiovideo');
    let audCount = 0, audSize = 0;
    if (fs.existsSync(audioDir)) {
      for (const f of fs.readdirSync(audioDir)) {
        const full = path.join(audioDir, f);
        if (fs.statSync(full).isFile()) { audCount++; try { audSize += fs.statSync(full).size; } catch (_) {} }
      }
    }
    if (audCount > 0) console.log(t('stats_audio', { count: audCount, size: formatBytes(audSize) }));

    Object.assign(result, { chapters, words, images: imgCount, audio: audCount });
  }

  // Last build
  const buildsDir = path.join(cwd, 'builds');
  if (fs.existsSync(buildsDir)) {
    const builds = fs.readdirSync(buildsDir).filter(f => f.endsWith('.epub'));
    if (builds.length > 0) {
      const sorted = builds.map(f => {
        const full = path.join(buildsDir, f);
        try { return { f, mtime: fs.statSync(full).mtime, size: fs.statSync(full).size }; }
        catch (_) { return null; }
      }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
      if (sorted.length > 0) {
        const b = sorted[0];
        const dateStr = b.mtime.toISOString().slice(0, 10);
        console.log(t('stats_last_build', {
          file: b.f, size: formatBytes(b.size), date: dateStr,
        }));
        result.lastBuild = { file: b.f, size: b.size, date: dateStr };
      }
    } else {
      console.log(t('stats_no_build'));
    }
  } else {
    console.log(t('stats_no_build'));
  }
  console.log('');

  emitJson(result);
  closeRL();
}

// ─── preview ──────────────────────────────────────────────────────────
const PREVIEW_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPUB Preview</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;font-family:system-ui,-apple-system,sans-serif;background:#1a1a1a;color:#eee}
#toolbar{height:44px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#252525;border-bottom:1px solid #333}
#viewer{height:calc(100% - 44px);position:relative}
button{background:#3a3a3a;color:#eee;border:1px solid #444;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:13px}
button:hover{background:#4a4a4a}
button:disabled{opacity:.4;cursor:default}
#title{flex:1;font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#loc{font-size:12px;color:#888}
#toc{position:absolute;top:0;left:0;bottom:0;width:280px;background:#252525;overflow-y:auto;transform:translateX(-100%);transition:transform .2s;z-index:100;border-right:1px solid #333}
#toc.open{transform:translateX(0)}
#toc ul{list-style:none;padding:8px;margin:0}
#toc li{padding:6px 8px;cursor:pointer;border-radius:4px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#toc li:hover{background:#3a3a3a}
#error{padding:20px;color:#f88;line-height:1.5}
</style>
</head>
<body>
<div id="toolbar">
<button id="tocBtn">TOC</button>
<button id="prevBtn">Prev</button>
<button id="nextBtn">Next</button>
<span id="title">Loading...</span>
<span id="loc"></span>
</div>
<div id="toc"><ul id="tocList"></ul></div>
<div id="viewer"></div>
<div id="error" style="display:none"></div>
<script src="/assets/epub.min.js"></script>
<script>
var book, rendition;
function showError(msg){
  document.getElementById('error').style.display='block';
  document.getElementById('error').textContent=msg;
}
function init() {
  if (typeof ePub === 'undefined') {
    showError('epub.js failed to load. Run "node epubcreator.js update config" to fetch preview assets.');
    return;
  }
  try {
    book = ePub('/book.epub');
    rendition = book.renderTo('viewer', {width:'100%',height:'100%',spread:'auto'});
    rendition.display();
    book.loaded.metadata.then(function(m){
      document.getElementById('title').textContent = m.title || 'Untitled';
    }).catch(function(){});
    book.loaded.navigation.then(function(nav){
      var list = document.getElementById('tocList');
      function add(items, depth){
        items.forEach(function(it){
          var li = document.createElement('li');
          li.textContent = (it.label || '').trim() || '(untitled)';
          li.style.paddingLeft = (8 + depth*12) + 'px';
          li.onclick = function(){
            rendition.display(it.href);
            document.getElementById('toc').classList.remove('open');
          };
          list.appendChild(li);
          if (it.subitems && it.subitems.length) add(it.subitems, depth+1);
        });
      }
      add(nav.toc || [], 0);
    }).catch(function(){});
    rendition.on('relocated', function(loc){
      var pct = loc.start.percentage || 0;
      document.getElementById('loc').textContent = (pct*100).toFixed(1) + '%';
      if (loc.start.cfi) try { localStorage.setItem('epub-pos', loc.start.cfi); } catch(e){}
    });
    var saved = null;
    try { saved = localStorage.getItem('epub-pos'); } catch(e){}
    if (saved) rendition.display(saved);
  } catch (err) {
    showError('Error loading EPUB: ' + err.message);
  }
}
document.getElementById('tocBtn').onclick = function(){
  document.getElementById('toc').classList.toggle('open');
};
document.getElementById('prevBtn').onclick = function(){ rendition && rendition.prev(); };
document.getElementById('nextBtn').onclick = function(){ rendition && rendition.next(); };
document.addEventListener('keydown', function(e){
  if (e.key === 'ArrowLeft') rendition && rendition.prev();
  if (e.key === 'ArrowRight') rendition && rendition.next();
});
try {
  var es = new EventSource('/reload');
  es.onmessage = function(e){
    if (e.data === 'rebuild') {
      if (rendition) { try { rendition.destroy(); } catch(x){} }
      document.getElementById('tocList').innerHTML = '';
      document.getElementById('error').style.display = 'none';
      setTimeout(init, 100);
    }
  };
} catch(e){}
init();
</script>
</body>
</html>`;

function findEpubJsPath() {
  const candidates = [
    path.join(process.cwd(), TOOL_DIR, 'preview', 'epub.min.js'),
    path.join(process.cwd(), TOOL_DIR, 'preview', 'epub.js'),
    path.join(process.cwd(), 'node_modules', 'epubjs', 'dist', 'epub.min.js'),
    path.join(process.cwd(), 'node_modules', 'epubjs', 'dist', 'epub.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function cmdPreview(argv) {
  let port = 8080;
  let host = '127.0.0.1';
  let watch = false;
  let shouldOpen = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--watch' || arg === '-w') watch = true;
    else if (arg === '--no-open') shouldOpen = false;
    else if (arg === '--port' && i + 1 < argv.length) { port = parseInt(argv[i+1]); i++; }
    else if (arg.startsWith('--port=')) { port = parseInt(arg.slice(7)); }
    else if (arg === '--host' && i + 1 < argv.length) { host = argv[i+1]; i++; }
    else if (arg.startsWith('--host=')) { host = arg.slice(7); }
  }

  const cwd = process.cwd();
  const buildsDir = path.join(cwd, 'builds');
  if (!fs.existsSync(buildsDir)) {
    logI18n('preview_no_epub', {}, 'error');
    closeRL();
    return;
  }
  let files = fs.readdirSync(buildsDir).filter(f => f.endsWith('.epub'));
  if (files.length === 0) {
    logI18n('preview_no_epub', {}, 'error');
    closeRL();
    return;
  }

  const epubPath = path.join(buildsDir, files.sort().pop());
  const epubJsPath = findEpubJsPath();

  if (!epubJsPath) {
    logI18n('preview_no_epubjs', {}, 'warn');
  }

  // SSE reload clients
  const sseClients = new Set();

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PREVIEW_HTML);
      return;
    }

    if (url === '/book.epub') {
      try {
        const stat = fs.statSync(epubPath);
        res.writeHead(200, {
          'Content-Type': 'application/epub+zip',
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        });
        const stream = fs.createReadStream(epubPath);
        stream.pipe(res);
        stream.on('error', () => { try { res.end(); } catch(_){} });
      } catch (err) {
        res.writeHead(500);
        res.end('Error reading EPUB: ' + err.message);
      }
      return;
    }

    if (url === '/assets/epub.min.js' || url === '/assets/epub.js') {
      if (!epubJsPath) {
        res.writeHead(404, { 'Content-Type': 'text/javascript' });
        res.end('// epub.js not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      fs.createReadStream(epubJsPath).pipe(res);
      return;
    }

    if (url === '/reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logI18n('preview_port_in_use', { port }, 'error');
      } else {
        log(`Server error: ${err.message}`, 'error');
      }
      resolve();
    });

    server.listen(port, host, () => {
      const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
      logI18n('preview_start', { host: displayHost, port }, 'success');
      if (host === '0.0.0.0') log(`Also reachable from LAN devices at http://<your-ip>:${port}/`, 'info');

      if (shouldOpen && !OPTS.quiet && !OPTS.json) {
        if (isTermux) {
          try {
            logI18n('preview_termux_open', {}, 'info');
            execSync(`termux-open-url "http://${displayHost}:${port}/"`, { stdio: 'ignore' });
          } catch (_) {
            logI18n('preview_open_hint', { host: displayHost, port }, 'info');
          }
        } else {
          logI18n('preview_open_hint', { host: displayHost, port }, 'info');
        }
      }

      const stopServer = () => {
        try { server.close(); } catch (_) {}
        for (const res of sseClients) { try { res.end(); } catch (_) {} }
        sseClients.clear();
        if (_activeDebugStop === stopServer) _activeDebugStop = null;
        logI18n('preview_stopped', {}, 'info');
        resolve();
      };
      _activeDebugStop = stopServer;

      if (watch) {
        logI18n('preview_watching', {}, 'info');
        const settings = loadSettings();
        const debounceDelay = parseInt(settings.watch_delay) || 500;
        const cfg = safeParseConfig();
        const type = (cfg && cfg.type) ? cfg.type.toLowerCase() : 'textbook';

        const rebuild = async () => {
          try {
            const archiver = require('archiver');
            if (isComicType(type)) {
              await buildEpub(archiver);
            } else {
              const marked = require('marked');
              await convertAllMd(path.join(cwd, 'Markdowns'), path.join(cwd, 'EPUB'), true, marked);
              await buildEpub(archiver);
            }
            logI18n('preview_rebuilt', {}, 'success');
            for (const res of sseClients) {
              try { res.write('data: rebuild\n\n'); } catch (_) {}
            }
          } catch (err) {
            log(`Rebuild failed: ${err.message}`, 'error');
          }
        };

        let timer = null;
        const trigger = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(rebuild, debounceDelay);
        };

        const watchDir = isComicType(type)
          ? path.join(cwd, 'EPUB', 'images', 'pages')
          : path.join(cwd, 'Markdowns');

        let watcher = null;
        try {
          if (fs.existsSync(watchDir)) {
            watcher = fs.watch(watchDir, { recursive: true }, () => trigger());
          }
        } catch (_) {
          if (fs.existsSync(watchDir)) {
            try { watcher = fs.watch(watchDir, () => trigger()); } catch (_) {}
          }
        }

        const oldStop = stopServer;
        const newStop = () => {
          if (timer) clearTimeout(timer);
          if (watcher) { try { watcher.close(); } catch (_) {} }
          oldStop();
        };
        _activeDebugStop = newStop;
      }

      // Handle Ctrl+C
      const sigHandler = () => {
        if (_activeDebugStop) _activeDebugStop();
        else stopServer();
      };
      process.once('SIGINT', sigHandler);
    });
  });
}

// ─── help & menu ──────────────────────────────────────────────────────
function printHelp() {
  const helpText = `
epubcreator - CLI for compiling directory to EPUB  (v${VERSION})

Usage:
  node epubcreator.js [command] [subcommand] [options]

  (no args)
    Open interactive menu.

  createdir [textbook|comic|manga]
    Create directory structure. Interactive prompt when type is omitted.
    textbook     Default, reflowable book
    comic        LTR fixed-layout comic
    manga        RTL fixed-layout manga

  convertch [subcommand] [path] [options]
  conv         Alias for convertch.
    md2xhtml     (default)   Convert .md to .xhtml, reads Markdowns/
    xhtml2md                 Convert .xhtml to .md
    docx2md                  Convert .docx to .md, split by heading ##
    img2xhtml                Generate .xhtml from images, comic/manga mode

    Options for convertch / xhtml2md / docx2md:
      --force, -f            Overwrite existing files
      --all                  Force overwrite all (convertch md2xhtml only)
      --output <path>        (docx2md, split, merge only) Output path

    Options for img2xhtml:
      --force, -f            Regenerate all XHTML
      --regen-ord            Regenerate ord.txt (asks confirmation)
      --fit=<mode>           contain | cover | width | height | none

  split <path> [--output dir] [--force]
    Split .md file by heading ##.

  merge <path> [--output file] [--force]
    Merge .md files into one (reverse of split).

  build
    Build EPUB from current directory.

  debug
    Watch changes, auto convert and build.

  import [--force] [--output dir]
    Import .epub file from current directory.

  stats
    Show statistics for the current book (chapters, words, pages, size).

  preview [--port 8080] [--host 127.0.0.1] [--watch] [--no-open]
    Start local HTTP server to preview the built EPUB in a browser.
    --watch rebuilds automatically when source files change.
    --host 0.0.0.0 makes it reachable from other devices on your LAN.

  update <module|config> [--force]
    module                   Download/update node_modules from repository
    config                   Download/update .epubcreator from config branch

  settings
    Interactive tool settings.

  validate
    Validate latest EPUB in builds/ with epubcheck.

  help, --help
    Show this help.

  --version, -v
    Show version.

Global flags (available for any command):
  --quiet, -q      Only show errors
  --verbose        Show additional detail
  --json           Emit JSON result to stdout (suppresses non-error logs)
  --dry-run, -n    Show what would be done without writing files

Directory structure (textbook):
  ./
  |-- config.txt          <- book metadata (required), type: textbook
  |-- ord.txt             <- chapter order list (optional)
  |-- Docs/               <- source .docx files (for docx2md)
  |-- Markdowns/          <- source .md files (for convertch)
  |-- EPUB/
  |   |-- images/
  |   |   |-- cover.png   <- REQUIRED
  |   |-- audiovideo/     <- optional
  |   |-- bab1.xhtml      <- chapters (any name, in EPUB/ root)
  |-- builds/
      |-- [folder-name].epub

Directory structure (comic/manga):
  ./
  |-- config.txt          <- type: comic | manga, reading_direction: ltr | rtl
  |-- ord.txt             <- optional: ordered list with * / ! / | alt
  |-- EPUB/
  |   |-- images/
  |   |   |-- cover.jpg   <- REQUIRED
  |   |   |-- pages/
  |   |       |-- ch1/    <- optional chapter grouping
  |   |       |   |-- 0001.jpg
  |   |       |   |-- 0002.jpg
  |   |       |-- ch2/
  |   |           |-- 0001.jpg
  |   |-- xhtmls/         <- auto-generated by "convertch img2xhtml"
  |   |-- styles/         <- optional custom CSS
  |   |-- about.xhtml     <- back-matter (reflowable) optional
  |   |-- audiovideo/     <- optional
  |-- builds/
      |-- [folder-name].epub

Note: make sure main dependencies are installed:
  npm install archiver@5.3.0 marked@4.0.0 turndown@7.2.4 sanitize-html
For DOCX feature:  npm install mammoth@1.6.0 (optional)
For import feature: npm install adm-zip@0.5.10 xml2js@0.5.0 (optional)
For preview: npm install epubjs (optional) OR update config to fetch bundled epub.min.js
For validation: install epubcheck (https://github.com/w3c/epubcheck)
  Or run "node epubcreator.js update module" to download automatically.

Termux notes:
  - pkg install nodejs-lts tar openjdk-17
  - Recursive fs.watch is not supported on Android; debug mode watches top-level dir only.
  - preview: browser opens via termux-open-url; access http://127.0.0.1:<port>/
`;
  console.log(helpText);
}

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
  console.log(`    ${c.bold}p${c.reset}  Preview (browser)`);
  console.log(`    ${c.bold}t${c.reset}  Stats`);
  console.log(`    ${c.bold}i${c.reset}  Import EPUB`);
  console.log(`    ${c.bold}s${c.reset}  Settings`);
  console.log(`    ${c.bold}u${c.reset}  Update (module / config)`);
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
      await cmdSplit([(p || '').trim() || 'Markdowns']);
      break;
    }
    case '9': {
      const p = await question(`  ${c.gray}Path to .md file or directory [Markdowns]:${c.reset} `);
      await cmdMerge([(p || '').trim() || 'Markdowns']);
      break;
    }
    case 'b': await cmdBuild(archiver); break;
    case 'v': await cmdValidate(); break;
    case 'p': await cmdPreview([]); break;
    case 't': await cmdStats([]); break;
    case 'i': await cmdImport([]); break;
    case 's': await cmdSettings(); break;
    case 'u': {
      const p = await question(`  ${c.gray}Update: [m]odule / [c]onfig?${c.reset} `);
      const ans = (p || '').trim().toLowerCase();
      if (ans === 'm' || ans === 'module') await cmdUpdateModule(false);
      else if (ans === 'c' || ans === 'config') await cmdUpdateConfig(false);
      else log('Cancelled.', 'warn');
      break;
    }
    case 'h': printHelp(); break;
    default:
      log(`Unknown option: "${choice}". Type "h" for help.`, 'warn');
  }
}

async function runDebugFallback(deps) {
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
        process.stdin.removeListener('data', handler);
        if (_activeDebugStop) _activeDebugStop();
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
  try { process.stdin.setRawMode(false); } catch (_) {}
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
}

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
      if (choice === 'd') await runDebugFallback(deps);
      else await handleMenuChoice(choice, deps);
    } catch (err) {
      log(`Error: ${err.message}`, 'error');
    }
    console.log('');
    await pauseBeforeMenu(3);
  }
}

async function runMenuTUI(deps) {
  TUI.init(deps);
  if (!TUI.enter()) {
    try { rl.close(); } catch (_) {}
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return await runMenuFallback(deps);
  }
  await new Promise(resolve => { TUI.onExit = resolve; });
}

// ─── Main ─────────────────────────────────────────────────────────────
function parseGlobalFlags(args) {
  const filtered = [];
  for (const arg of args) {
    if (arg === '--quiet' || arg === '-q') OPTS.quiet = true;
    else if (arg === '--verbose') OPTS.verbose = true;
    else if (arg === '--json') { OPTS.json = true; OPTS.quiet = true; }
    else if (arg === '--dry-run' || arg === '-n') OPTS.dryRun = true;
    else filtered.push(arg);
  }
  return filtered;
}

async function cmdBuild(archiver) {
  await buildEpub(archiver);
  closeRL();
}

async function main() {
  loadSettings();

  const rawArgs = process.argv.slice(2);
  const args = parseGlobalFlags(rawArgs);
  const command = args[0];

  if (command === '--version' || command === '-v') {
    if (OPTS.json) emitJson({ version: VERSION });
    else console.log(`epubcreator v${VERSION}`);
    try { rl.close(); } catch (_) {}
    return;
  }
  if (command === 'help' || command === '--help') {
    printHelp();
    try { rl.close(); } catch (_) {}
    return;
  }

  if (!command) {
    interactiveMode = true;
    let result = tryCheckDependencies();
    if (!result.ok) {
      if (OPTS.json || OPTS.quiet) {
        printMissingDeps(result.missing);
        process.exit(1);
      }
      log('Dependencies missing. Downloading pre-built node_modules...', 'info');
      const ok = await doUpdateModule(false);
      if (!ok) { printMissingDeps(result.missing); process.exit(1); }
      result = tryCheckDependencies();
      if (!result.ok) { printMissingDeps(result.missing); process.exit(1); }
    }

    const deps = result.deps;
    TUI.cols = process.stdout.columns || 80;
    TUI.rows = process.stdout.rows || 24;

    if (TUI.canUse()) await runMenuTUI(deps);
    else {
      await runMenuFallback(deps);
      try { rl.close(); } catch (_) {}
    }
    return;
  }

  if (command === 'createdir') { await cmdCreateDir(args.slice(1)); return; }
  if (command === 'update') {
    const sub = args[1];
    const force = args.includes('--force') || args.includes('-f');
    if (sub === 'module') { await cmdUpdateModule(force); return; }
    if (sub === 'config') { await cmdUpdateConfig(force); return; }
    if (sub) {
      const suggestion = suggestCommand(sub);
      logI18n('update_unknown_sub', { sub }, 'error');
      if (suggestion && suggestion.startsWith('update ')) {
        log(t('maybe_you_mean', { suggestion: `node epubcreator.js ${suggestion}` }), 'info');
      }
    }
    log(t('update_usage'), 'error');
    try { rl.close(); } catch (_) {}
    return;
  }
  if (command === 'import') { await cmdImport(args.slice(1)); return; }
  if (command === 'settings') { await cmdSettings(); return; }
  if (command === 'validate') { await cmdValidate(); return; }
  if (command === 'stats') { await cmdStats(args.slice(1)); return; }
  if (command === 'preview') { await cmdPreview(args.slice(1)); return; }

  const depResult = tryCheckDependencies();
  if (!depResult.ok) { printMissingDeps(depResult.missing); process.exit(1); }
  const { archiver, marked, TurndownService } = depResult.deps;

  if (command === 'convertch' || command === 'conv') {
    const sub = args[1] || 'md2xhtml';
    const rest = args.slice(2);

    if (sub === 'img2xhtml') { await cmdImg2Xhtml(rest); return; }

    if (sub === 'md2xhtml' || (sub !== 'xhtml2md' && sub !== 'docx2md')) {
      const argPath = (sub === 'md2xhtml') ? rest[0] : args[1];
      const force = rest.includes('--force') || rest.includes('-f');
      const forceAll = rest.includes('--all');
      await cmdConvertCh(argPath, force, marked, forceAll);
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

  if (command === 'convertchx') { await cmdConvertX(args[1], TurndownService); return; }
  if (command === 'split') { await cmdSplit(args.slice(1)); return; }
  if (command === 'merge') { await cmdMerge(args.slice(1)); return; }
  if (command === 'build') { await cmdBuild(archiver); return; }
  if (command === 'debug') { await cmdDebug(archiver, marked); return; }

  logI18n('unknown_command', { cmd: command }, 'error');
  const suggestion = suggestCommand(command);
  if (suggestion) log(t('maybe_you_mean', { suggestion: `node epubcreator.js ${suggestion}` }), 'info');
  logI18n('usage_hint', {}, 'info');
  try { rl.close(); } catch (_) {}
}

main().catch((err) => {
  console.error(`${c.red}[!!]${c.reset} Error: ${err.message}`);
  try { rl.close(); } catch (_) {}
  if (TUI.active) {
    try { process.stdout.write('\x1b[?25h\x1b[?1049l'); } catch (_) {}
  }
});