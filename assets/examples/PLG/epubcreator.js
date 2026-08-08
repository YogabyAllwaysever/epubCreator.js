#!/usr/bin/env node
/**
 * epubcreator.js — Node CLI untuk kompilasi direktori ke EPUB
 *
 * Versi: 2.6.0
 *
 *  Copyright (C) 2026 YogabyAllwaysever.
 *
 * Cara pakai:
 *   node epubcreator.js createconfig        → buat config.txt template
 *   node epubcreator.js createchapter       → buat file bab .xhtml template (di EPUB/)
 *   node epubcreator.js createdir           → buat struktur direktori dan file template
 *   node epubcreator.js convertch           → ubah file .md menjadi .xhtml (default)
 *   node epubcreator.js convertch xhtml2md  → ubah file .xhtml menjadi .md
 *   node epubcreator.js convertch docx2md   → ubah file .docx menjadi .md (pecah berdasarkan ##)
 *   node epubcreator.js conv ...            → alias untuk convertch
 *   node epubcreator.js build               → build EPUB dari direktori saat ini
 *   node epubcreator.js lang-id             → ubah bahasa ke Indonesia
 *   node epubcreator.js lang-en             → ubah bahasa ke English (US)
 *   node epubcreator.js --version           → tampilkan versi
 *
 * Fitur ord.txt (opsional):
 *   - File di root buku, daftar urutan bab (satu baris satu nama file .xhtml)
 *   - Jika ada, urutan mengikuti daftar tersebut (file harus di root EPUB/)
 *   - Jika tidak ada, urutkan otomatis berdasarkan nama file (natural sort)
 */

const VERSION = '2.6.1';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─── Konfigurasi bahasa ──────────────────────────────────────────────────
const CONFIG_FILE = '.epubcreator.txt';
let currentLang = 'id'; // default

// ─── Pesan terjemahan ────────────────────────────────────────────────────
const messages = {
  id: {
    // Pesan umum
    lang_changed: 'Bahasa diubah ke {lang}.',
    lang_prompt: 'Pilih Bahasa:',
    lang_choice_1: '[1] 🇮🇩 Indonesian',
    lang_choice_2: '[2] 🇺🇸 English (US)',
    lang_enter: 'Masukkan angka (1/2): ',
    lang_invalid: 'Pilihan tidak valid. Silakan pilih 1 atau 2.',
    lang_saved: 'Bahasa disimpan ke {file}.',

    // Error dependensi
    missing_dep: '❌ Modul "{mod}" (v{version}) tidak ditemukan. Install dengan:\n  npm install {mod}@{version}\n',
    marked_old: '❌ Versi "marked" terlalu tua. Install ulang dengan:\n  npm install marked@4.0.0\n',

    // Log umum
    cancelled: 'Dibatalkan.',
    file_exists: '{file} sudah ada. Timpa? (y/n) ',
    overwritten: '{file} ditimpa.',
    not_modified: '{file} tidak diubah.',
    created: '{file} dibuat.',
    dir_created: 'Struktur direktori dibuat di {dirs}',
    ready: '✅ Direktori dan file template siap.',

    // createchapter
    enter_filename: 'Nama file bab (misal: bab1.xhtml): ',
    filename_empty: 'Nama file tidak boleh kosong.',
    enter_title: 'Judul bab: ',
    chapter_created: 'Bab berhasil dibuat: {path}',

    // convertch (MD→XHTML)
    markdowns_not_found: 'Direktori Markdowns/ tidak ditemukan. Buat dengan "node epubcreator.js createdir"',
    path_not_found: 'Path tidak ditemukan: {path}',
    must_be_md: 'File harus berekstensi .md',
    no_md_found: 'Tidak ditemukan file .md di direktori tersebut.',
    md_count: 'Ditemukan {count} file .md.',
    xhtml_exists: '{count} file .xhtml sudah ada. (Y) Timpa semua, (N) Copy semua ke Markdowns, (C) Cancel: ',
    convert_cancelled: 'Konversi dibatalkan.',
    copy_md: '📋 Copy {file} ke {dest}',
    md_already_exists: 'ℹ️  {file} sudah ada di Markdowns, skip copy.',
    copy_done: 'Selesai: {count} file .md dicopy ke Markdowns/.',
    skip_file: 'Lewati {file}',
    convert_success: '✅ Berhasil mengonversi: {file}',
    convert_fail: 'Gagal mengurai Markdown {file}: {error}',
    convert_summary: 'Selesai: {success} dari {total} file berhasil dikonversi.',
    invalid_path: 'Path bukan file atau direktori yang valid.',
    xhtml_already_exists: '{file} sudah ada. (Y) Timpa, (N) Copy ke Markdowns, (C) Cancel: ',

    // convertch xhtml2md (dulu convertchx)
    epub_not_found: 'Direktori EPUB/ tidak ditemukan.',
    must_be_xhtml: 'File harus berekstensi .xhtml',
    skip_cover: 'Melewati file {file} (dikecualikan)',
    no_xhtml_found: 'Tidak ditemukan file .xhtml yang valid di direktori tersebut.',
    xhtml_count: 'Ditemukan {count} file .xhtml.',
    convertx_success: '✅ Berhasil mengonversi: {file}',
    convertx_fail: 'Gagal konversi {file}: {error}',
    convertx_summary: 'Selesai: {success} dari {total} file berhasil dikonversi.',

    // convertch docx2md
    docx_no_files: 'Tidak ditemukan file .docx.',
    docx_processing: '📄 Memproses: {file}',
    docx_no_images: 'ℹ️ Ekstraksi gambar dari DOCX belum didukung; gambar akan diabaikan.',
    docx_heading_mode_warn: '⚠️ Mode ukuran font untuk heading belum stabil; disarankan menggunakan style Word.',

    // build
    config_not_found: 'config.txt tidak ditemukan! Jalankan: node epubcreator.js createconfig',
    epub_dir_not_found: 'Direktori EPUB/ tidak ditemukan!',
    title_missing: 'config.txt harus memiliki "title"',
    author_missing: 'config.txt harus memiliki "author"',
    no_chapters: 'Tidak ada bab (file .xhtml) di EPUB/ (kecuali cover/toc/nav)',
    chapters_found: 'Ditemukan {count} bab.',
    cover_missing: '⚠️  Tidak ada cover.png di EPUB/images/ — cover akan tanpa gambar.',
    cover_found: 'Cover: {file}',
    media_summary: 'Gambar: {images} | Audio/Video: {audio}',
    epub_built: '✅ EPUB berhasil dibuat: {path} ({size} KB)',
    zip_error: 'Gagal membuat ZIP: {error}',
    warning_ord_not_found: 'Peringatan: file "{file}" di ord.txt tidak ditemukan di EPUB/',

    // command unknown
    unknown_command: 'Perintah tidak dikenal: {cmd}',
    usage_hint: 'Gunakan: createconfig | createchapter | createdir | convertch | convertchx | build | lang-id | lang-en | --version',

    // Help
    help_title: '📚 epubcreator — CLI untuk kompilasi direktori ke EPUB  (v{version})',
    help_commands: `
  node epubcreator.js createconfig        Buat config.txt template
  node epubcreator.js createchapter       Buat file bab .xhtml template
  node epubcreator.js createdir           Buat struktur direktori dan file template
  node epubcreator.js convertch           Ubah .md → .xhtml (default, cari di Markdowns/)
  node epubcreator.js convertch xhtml2md  Ubah .xhtml → .md
  node epubcreator.js convertch docx2md   Ubah .docx → .md (pecah berdasarkan ##)
  node epubcreator.js conv ...            Alias untuk convertch
  node epubcreator.js build               Build EPUB dari direktori saat ini
  node epubcreator.js lang-id             Ubah bahasa ke Indonesia
  node epubcreator.js lang-en             Ubah bahasa ke English (US)
  node epubcreator.js --version           Tampilkan versi`,
    help_structure: `
Struktur direktori:
  ./
  ├── config.txt          ← metadata buku (wajib)
  ├── ord.txt             ← daftar urutan bab (opsional)
  ├── Docs/               ← tempat file .docx sumber (untuk docx2md)
  ├── Markdowns/          ← tempat file .md sumber (untuk convertch)
  ├── EPUB/
  │   ├── images/
  │   │   └── cover.png   ← WAJIB
  │   ├── audiovideo/     ← opsional
  │   ├── bab1.xhtml      ← bab-bab (nama bebas, di root EPUB/)
  │   └── ...
  └── builds/
      └── [nama-folder].epub   ← hasil build`,
    help_deps: `
Catatan: pastikan sudah install dependensi utama:
  npm install archiver@5.3.0 marked@4.0.0 turndown@7.2.4
Untuk fitur DOCX:  npm install mammoth@1.6.0 (opsional)`,
  },

  en: {
    // Common
    lang_changed: 'Language changed to {lang}.',
    lang_prompt: 'Choose Language:',
    lang_choice_1: '[1] 🇮🇩 Indonesian',
    lang_choice_2: '[2] 🇺🇸 English (US)',
    lang_enter: 'Enter number (1/2): ',
    lang_invalid: 'Invalid choice. Please enter 1 or 2.',
    lang_saved: 'Language saved to {file}.',

    // Dependency errors
    missing_dep: '❌ Module "{mod}" (v{version}) not found. Install with:\n  npm install {mod}@{version}\n',
    marked_old: '❌ "marked" version is too old. Reinstall with:\n  npm install marked@4.0.0\n',

    // Common logs
    cancelled: 'Cancelled.',
    file_exists: '{file} already exists. Overwrite? (y/n) ',
    overwritten: '{file} overwritten.',
    not_modified: '{file} unchanged.',
    created: '{file} created.',
    dir_created: 'Directory structure created at {dirs}',
    ready: '✅ Directory and template files ready.',

    // createchapter
    enter_filename: 'Chapter filename (e.g. bab1.xhtml): ',
    filename_empty: 'Filename cannot be empty.',
    enter_title: 'Chapter title: ',
    chapter_created: 'Chapter created: {path}',

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
    docx_heading_mode_warn: '⚠️ Font size based heading mode is unstable; using Word styles is recommended.',

    // build
    config_not_found: 'config.txt not found! Run: node epubcreator.js createconfig',
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

    // command unknown
    unknown_command: 'Unknown command: {cmd}',
    usage_hint: 'Use: createconfig | createchapter | createdir | convertch | convertchx | build | lang-id | lang-en | --version',

    // Help
    help_title: '📚 epubcreator — CLI for compiling directory to EPUB  (v{version})',
    help_commands: `
  node epubcreator.js createconfig        Create config.txt template
  node epubcreator.js createchapter       Create chapter .xhtml template file
  node epubcreator.js createdir           Create directory structure and template files
  node epubcreator.js convertch           Convert .md → .xhtml (default, looks in Markdowns/)
  node epubcreator.js convertch xhtml2md  Convert .xhtml → .md
  node epubcreator.js convertch docx2md   Convert .docx → .md (split by ##)
  node epubcreator.js conv ...            Alias for convertch
  node epubcreator.js build               Build EPUB from current directory
  node epubcreator.js lang-id             Switch language to Indonesian
  node epubcreator.js lang-en             Switch language to English (US)
  node epubcreator.js --version           Show version`,
    help_structure: `
Directory structure:
  ./
  ├── config.txt          ← book metadata (required)
  ├── ord.txt             ← chapter order list (optional)
  ├── Docs/               ← source .docx files (for docx2md)
  ├── Markdowns/          ← source .md files (for convertch)
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
For DOCX feature:  npm install mammoth@1.6.0 (optional)`,
  }
};

// ─── Fungsi terjemahan ──────────────────────────────────────────────────
function t(key, params = {}) {
  let str = messages[currentLang]?.[key] || messages.id[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`{${k}}`, 'g'), v);
  }
  return str;
}

// ─── Fungsi log dengan terjemahan ──────────────────────────────────────
function logI18n(key, params = {}, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  const msg = t(key, params);
  console.log(`${icons[type] || ''} ${msg}`);
}

// ─── Load atau tanya bahasa ────────────────────────────────────────────
function loadOrAskLanguage() {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const match = content.match(/^language\s*=\s*(id|en)\b/m);
      if (match) return match[1];
    } catch (_) { /* ignore */ }
  }
  // Tidak ada atau tidak valid → tanya interaktif
  return askLanguageInteractive();
}

function askLanguageInteractive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(t('lang_prompt'));
    console.log(t('lang_choice_1'));
    console.log(t('lang_choice_2'));
    rl.question(t('lang_enter'), (answer) => {
      rl.close();
      let lang = 'id';
      if (answer.trim() === '2') {
        lang = 'en';
      } else if (answer.trim() === '1') {
        lang = 'id';
      } else {
        console.log(t('lang_invalid'));
        // default id
      }
      // Simpan ke file
      const configPath = path.join(process.cwd(), CONFIG_FILE);
      fs.writeFileSync(configPath, `language=${lang}`, 'utf8');
      console.log(t('lang_saved', { file: CONFIG_FILE }));
      resolve(lang);
    });
  });
}

// ─── Cek dependensi (setelah bahasa) ──────────────────────────────────
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

  // return required modules for later use
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

// ─── Ekstrak judul dari Markdown (hanya heading level 2) ──────────────
function extractTitleFromMd(content) {
  const match = content.match(/^##\s+(.+)$/m);
  if (match) return match[1].trim();
  return null;
}

// ─── Cari file .md secara rekursif ────────────────────────────────────
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

// ─── Cari file .xhtml secara rekursif (kecuali cover/toc/nav) ────────
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

// ─── Renderer XHTML untuk marked ──────────────────────────────────────
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

// ─── Baca mapping DOCX dari config ─────────────────────────────────
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

// ─── Sesuaikan heading berdasarkan mapping ──────────────────────────
function adjustHeadings(html, mapping) {
  // Jika tidak ada mapping, gunakan class style dari Word
  if (!mapping) {
    // Ganti class heading1/2/3 menjadi h1/h2/h3
    html = html.replace(/<p\s+class="heading1"[^>]*>/gi, '<h1>');
    html = html.replace(/<p\s+class="heading2"[^>]*>/gi, '<h2>');
    html = html.replace(/<p\s+class="heading3"[^>]*>/gi, '<h3>');
    // Penutup: ubah </p> menjadi </h1/h2/h3> secara kasar, tapi kita biarkan turndown menangani.
    return html;
  }

  // Mode ukuran: parsing style font-size
  const thresholds = [
    { level: 1, size: mapping.heading1 || 24 },
    { level: 2, size: mapping.heading2 || 18 },
    { level: 3, size: mapping.heading3 || 14 }
  ].sort((a, b) => b.size - a.size);

  // Kita gunakan regex untuk mengganti <p> yang memiliki style font-size
  const pRegex = /<p\s+([^>]*style="[^"]*font-size:(\d+)pt[^"]*"[^>]*)>/gi;
  let modified = html;
  let match;
  while ((match = pRegex.exec(html)) !== null) {
    const full = match[0];
    const size = parseInt(match[2]);
    let level = 0;
    for (const th of thresholds) {
      if (size >= th.size) { level = th.level; break; }
    }
    if (level > 0) {
      // Ganti tag pembuka
      modified = modified.replace(full, `<h${level}>`);
      // Kita tidak bisa ganti penutup dengan akurat, jadi biarkan saja.
    }
  }

  logI18n('docx_heading_mode_warn', {}, 'warn');
  return modified;
}

// ─── Command: createconfig ─────────────────────────────────────────────
async function cmdCreateConfig() {
  const configPath = path.join(process.cwd(), 'config.txt');
  if (fs.existsSync(configPath)) {
    const answer = await question(t('file_exists', { file: 'config.txt' }));
    if (answer.toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      rl.close();
      return;
    }
  }

  const template = `# ============================================================
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

  fs.writeFileSync(configPath, template, 'utf8');
  logI18n('created', { file: configPath }, 'success');
  rl.close();
}

// ─── Command: createchapter ────────────────────────────────────────────
async function cmdCreateChapter() {
  const epubDir = path.join(process.cwd(), 'EPUB');
  ensureDir(epubDir);

  const filename = await question(t('enter_filename'));
  if (!filename || !filename.trim()) {
    logI18n('filename_empty', {}, 'error');
    rl.close();
    return;
  }

  const filepath = path.join(epubDir, filename.trim());
  if (fs.existsSync(filepath)) {
    const overwrite = await question(t('file_exists', { file: filename.trim() }));
    if (overwrite.toLowerCase() !== 'y') {
      logI18n('cancelled', {}, 'warn');
      rl.close();
      return;
    }
  }

  const title = await question(t('enter_title')) || path.basename(filename, path.extname(filename));

  const template = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(title)}</title>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <p>Tulis konten bab di sini…</p>
</body>
</html>
`;

  fs.writeFileSync(filepath, template, 'utf8');
  logI18n('chapter_created', { path: filepath }, 'success');
  rl.close();
}

// ─── Command: createdir ────────────────────────────────────────────────
async function cmdCreateDir() {
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

  const dirs = [epubDir, markdownsDir, docsDir].join(', ');
  logI18n('dir_created', { dirs }, 'info');

  // Buat config.txt
  if (fs.existsSync(configPath)) {
    const ans = await question(t('file_exists', { file: 'config.txt' }));
    if (ans.toLowerCase() === 'y') {
      const template = `# ============================================================
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
      fs.writeFileSync(configPath, template, 'utf8');
      logI18n('overwritten', { file: 'config.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'config.txt' }, 'warn');
    }
  } else {
    const template = `# ============================================================
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
    fs.writeFileSync(configPath, template, 'utf8');
    logI18n('created', { file: 'config.txt' }, 'success');
  }

  // Buat ord.txt
  if (fs.existsSync(ordPath)) {
    const ans = await question(t('file_exists', { file: 'ord.txt' }));
    if (ans.toLowerCase() === 'y') {
      fs.writeFileSync(ordPath, '# Daftar urutan bab (satu baris satu .xhtml)\n', 'utf8');
      logI18n('overwritten', { file: 'ord.txt' }, 'success');
    } else {
      logI18n('not_modified', { file: 'ord.txt' }, 'warn');
    }
  } else {
    fs.writeFileSync(ordPath, '# Daftar urutan bab (satu baris satu .xhtml)\n', 'utf8');
    logI18n('created', { file: 'ord.txt' }, 'success');
  }

  logI18n('ready', {}, 'success');
  rl.close();
}

// ─── Konversi satu file .md → .xhtml ─────────────────────────────────
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

// ─── Command: MD → XHTML (perilaku lama convertch) ────────────────────
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
    rl.close();
    return;
  }

  logI18n('invalid_path', {}, 'error');
  rl.close();
}

// ─── Konversi satu file .xhtml → .md ─────────────────────────────────
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

// ─── Command: XHTML → MD (xhtml2md) ───────────────────────────────────
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

// ─── Command: DOCX → MD (docx2md) ──────────────────────────────────
async function cmdDocxToMd(argv) {
  // Parse argumen
  let input = './Docs';
  let output = './Markdowns/fromdocx';
  let force = false;
  let noImages = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force' || arg === '-f') force = true;
    else if (arg === '--no-images') noImages = true;
    else if (arg === '--output' && i + 1 < argv.length) {
      output = argv[i + 1];
      i++; // skip next
    } else if (!arg.startsWith('--')) {
      input = arg;
    }
  }

  // Cek mammoth
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch (_) {
    logI18n('missing_dep', { mod: 'mammoth', version: '1.6.0' }, 'error');
    log('Install dengan: npm install mammoth@1.6.0', 'info');
    rl.close();
    return;
  }

  // Baca mapping dari config
  const mapping = readDocxMapping();

  // Tentukan file .docx
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

  // Proses setiap file
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
      // Konversi ke HTML dengan mammoth
      const result = await mammoth.convertToHtml({ path: docxFile });
      let html = result.value;

      // Perbaiki heading berdasarkan mapping
      const modifiedHtml = adjustHeadings(html, mapping);

      // Konversi ke Markdown
      const TurndownService = require('turndown');
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
        strongDelimiter: '**',
      });
      let markdown = turndownService.turndown(modifiedHtml);

      // Pecah berdasarkan ##
      const parts = markdown.split(/(?=^##\s+)/m).filter(p => p.trim() !== '');
      if (parts.length === 0) {
        parts.push(markdown);
      }

      // Tulis file p-*.md
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

// ─── Command: build ────────────────────────────────────────────────────
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

  if (creator) metadata.push(`<dc:creator id="creator">${escapeXml(creator)}</dc:creator>`);

  for (const c of contributors) {
    const role = c.role || 'ctb';
    if (role === 'aut') {
      metadata.push(`<dc:creator id="creator">${escapeXml(c.name)}</dc:creator>`);
    } else {
      metadata.push(`<dc:contributor>${escapeXml(c.name)}</dc:contributor>`);
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

  metadata.push(`<meta property="dcterms:modified">${new Date().toISOString()}</meta>`);
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
<html xmlns="http://www.w3.org/1999/xhtml">
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
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100%" height="100%" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid meet"><image width="600" height="800" xlink:href="${escapeXml(href)}" alt="Cover" />
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

async function cmdBuild(archiver) {
  const cwd = process.cwd();
  const rootName = path.basename(cwd);

  const configPath = path.join(cwd, 'config.txt');
  if (!fs.existsSync(configPath)) {
    logI18n('config_not_found', {}, 'error');
    rl.close();
    return;
  }

  const epubDir = path.join(cwd, 'EPUB');
  if (!fs.existsSync(epubDir)) {
    logI18n('epub_dir_not_found', {}, 'error');
    rl.close();
    return;
  }

  const config = parseConfig(configPath);
  if (!config.title) {
    logI18n('title_missing', {}, 'error');
    rl.close();
    return;
  }
  if (!config.author) {
    logI18n('author_missing', {}, 'error');
    rl.close();
    return;
  }

  const ordPath = path.join(cwd, 'ord.txt');
  const chapters = collectChapters(epubDir, ordPath);
  if (chapters.length === 0) {
    logI18n('no_chapters', {}, 'error');
    rl.close();
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
      rl.close();
      resolve();
    });

    archive.on('error', (err) => {
      logI18n('zip_error', { error: err.message }, 'error');
      reject(err);
      rl.close();
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

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  // 1. Load/Setup bahasa (interaktif jika belum ada)
  currentLang = await loadOrAskLanguage();

  // 2. Perintah lang-* (tidak perlu cek dependensi)
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === 'lang-id' || command === 'lang-en') {
    const lang = command === 'lang-id' ? 'id' : 'en';
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    fs.writeFileSync(configPath, `language=${lang}`, 'utf8');
    const langName = lang === 'id' ? 'Indonesia' : 'English';
    console.log(t('lang_changed', { lang: langName }));
    rl.close();
    return;
  }

  // 3. Perintah --version / help (tanpa dependensi)
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

  // 4. Perintah convertch / conv (dengan sub-perintah)
  if (command === 'convertch' || command === 'conv') {
    // Cek dependensi dasar (selain mammoth)
    let deps;
    try {
      deps = checkDependencies();
    } catch (_) {
      process.exit(1);
    }
    const { marked, TurndownService } = deps;

    const sub = args[1] || 'md2xhtml'; // default sub-perintah
    const rest = args.slice(2);

    // Jika sub-perintah adalah 'md2xhtml' atau tidak dikenali, anggap md2xhtml
    if (sub === 'md2xhtml' || (sub !== 'xhtml2md' && sub !== 'docx2md')) {
      // Mode MD → XHTML
      const argPath = (sub === 'md2xhtml') ? rest[0] : args[1]; // jika sub tidak dikenali, arg pertama adalah path
      const force = rest.includes('--force') || rest.includes('-f');
      await cmdConvertCh(argPath, force, marked);
    } else if (sub === 'xhtml2md') {
      // Mode XHTML → MD
      const argPath = rest[0];
      await cmdConvertX(argPath, TurndownService);
    } else if (sub === 'docx2md') {
      // Mode DOCX → MD
      await cmdDocxToMd(rest);
    } else {
      logI18n('unknown_command', { cmd: sub }, 'error');
      logI18n('usage_hint', {}, 'info');
      rl.close();
    }
    return;
  }

  // 5. Perintah convertchx (alias untuk xhtml2md, untuk kompatibilitas)
  if (command === 'convertchx') {
    let deps;
    try {
      deps = checkDependencies();
    } catch (_) {
      process.exit(1);
    }
    const { TurndownService } = deps;
    const argPath = args[1];
    await cmdConvertX(argPath, TurndownService);
    return;
  }

  // 6. Perintah lain (butuh dependensi)
  let deps;
  try {
    deps = checkDependencies();
  } catch (_) {
    process.exit(1);
  }
  const { archiver, marked, TurndownService } = deps;

  switch (command) {
    case 'createconfig':
      await cmdCreateConfig();
      break;
    case 'createchapter':
      await cmdCreateChapter();
      break;
    case 'createdir':
      await cmdCreateDir();
      break;
    case 'build':
      await cmdBuild(archiver);
      break;
    default:
      logI18n('unknown_command', { cmd: command }, 'error');
      logI18n('usage_hint', {}, 'info');
      rl.close();
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  rl.close();
});