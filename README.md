# 📚 epubCreator

CLI tool for compiling a directory into an EPUB ebook

Version: 3.1.0-BETA

---

## ✨ Features

- 🏗️ Build EPUB from a structured directory
- 📂 Create directory structure with all necessary files (including tool config & language files)
- 📖 **Three book types** – `textbook` (reflowable), `comic` (fixed‑layout LTR), `manga` (fixed‑layout RTL)
- 🖼️ **Image → XHTML generation** – auto‑generate page XHTML from comic/manga images
- ↔️ **Auto double‑spread detection** – detects wide landscape images and marks them as `page-spread-center`
- 🔄 Convert Markdown (.md) to XHTML (.xhtml) and vice versa
- 📄 Convert DOCX (.docx) to Markdown (.md) with smart heading detection
- ✂️ **Split** Markdown files by headings (`##`) into multiple files
- 🔗 **Merge** multiple Markdown files into one (reverse of split)
- 📥 **Import existing EPUB** – extract chapters, metadata, cover, and media into the project structure (auto‑detects comic/manga fixed‑layout)
- 🔍 **Debug mode** – watch `Markdowns/` (textbook) or `EPUB/images/pages/` (comic/manga) and auto‑rebuild
- 📦 **Auto‑download dependencies** – fetch and extract pre‑built `node_modules` from the repository
- ⚙️ **Tool settings** – interactive configuration (language, watch delay, auto‑build, overwrite policy, default type)
- 🌍 Multilingual support (Indonesian & English) – language files stored separately for easy updates
- 📋 Chapter/page order control via optional `ord.txt` (with extended format for comic/manga)
- 🎨 Automatic cover, TOC, and metadata generation
- 📦 Zero-config build with sensible defaults
- ⚙️ Flexible input paths and force-overwrite options

---

## 📦 Installation

```bash
git clone https://github.com/YogabyAllwaysever/epubcreator.js.git
cd epubcreator.js
```

or download as ZIP.

The tool itself is self‑contained – you only need Node.js. Dependencies and configuration files are downloaded automatically when you run `createdir`.

**Main dependencies** (auto‑downloaded via `updatemodule`):
- archiver@5.3.0
- marked@4.0.0
- turndown@7.2.4

**Optional dependencies** (for extra features):
- mammoth@1.6.0 – DOCX conversion
- adm-zip@0.5.10 & xml2js@0.5.0 – EPUB import

If you prefer to install manually:
```bash
npm install archiver@5.3.0 marked@4.0.0 turndown@7.2.4
# and optional:
npm install mammoth@1.6.0 adm-zip@0.5.10 xml2js@0.5.0
```

Or run `node epubcreator.js updatemodule` to download everything automatically.

---

## 🚀 Usage

```bash
node epubcreator.js <command> [options]
```

### Available Commands

- **createdir [type]**  
  Create full directory structure, config files, and download `.epubcreator/`.  
  `type` can be `textbook` (default), `comic`, or `manga`.  
  If omitted, you'll be prompted interactively.  
  For comic/manga you'll also be asked about chapter grouping and reading direction.

- **convertch [path] [options]**  
  Convert `.md` files to `.xhtml` (default: scans `Markdowns/` or given path).

- **convertch img2xhtml [--regen-ord] [--force]**  
  Generate `.xhtml` page files from images in `EPUB/images/pages/` (comic/manga mode).  
  Auto‑creates/updates `ord.txt`.

- **convertch xhtml2md [path]**  
  Convert `.xhtml` files to `.md` (scans `EPUB/` or given path).

- **convertch docx2md [path] [options]**  
  Convert `.docx` files to `.md` (scans `Docs/` or given path; split by `##`).

- **conv ...**  
  Alias for `convertch` (same subcommands and options).

- **split <path> [options]**  
  Split a Markdown file (or all `.md` files in a directory) by heading level 2 (`##`) into multiple files.

- **merge <path> [options]**  
  Merge multiple Markdown files into one (reverse of `split`).

- **build**  
  Build EPUB from current directory.  
  Auto‑detects `type` from `config.txt` (`textbook` → reflowable, `comic`/`manga` → fixed‑layout).

- **debug**  
  Watch for changes and auto‑rebuild.  
  Textbook mode watches `Markdowns/`; comic/manga mode watches `EPUB/images/pages/`.

- **import [options]**  
  Import an existing `.epub` file from the current directory into the project structure.  
  Auto‑detects fixed‑layout EPUBs and imports them as comic/manga.

- **updatemodule [--force]**  
  Download/update `node_modules` from the repository (pre‑built bundle from `main` branch).

- **updateconfig [--force]**  
  Download/update `.epubcreator/` (tool settings & language files) from the `config` branch.

- **settings**  
  Interactive tool settings editor (language, watch delay, auto‑build, overwrite policy, default type).

- **validate**  
  Validate the latest built EPUB using `epubcheck` (requires `epubcheck` installed).

- **--version, -v**  
  Show version.

- **help, --help**  
  Show help message.

### Command Options

**Global options** (apply to most commands):
- `--force, -f` – Overwrite existing files without asking.

**Options for `convertch img2xhtml`:**
- `--regen-ord` – Regenerate `ord.txt` from scratch (asks for confirmation).
- `--force, -f` – Force regenerate all XHTML files.

**Options for `convertch docx2md`:**
- `--output <dir>` – Output directory (default: `Markdowns/fromdocx`).
- `--force, -f` – Overwrite existing files.
- `--no-images` – Suppress warning about unsupported image extraction (images are ignored anyway).
- `--nosplit, -n` – Do not split by headings; output a single `.md` per `.docx`.

**Options for `split`:**
- `--output <dir>` – Output directory (default: `Markdowns/split`).
- `--force, -f` – Overwrite existing files.

**Options for `merge`:**
- `--output <file>` – Output file path (default: `merged.md`).
- `--force, -f` – Overwrite existing file.

**Options for `import`:**
- `--force, -f` – Overwrite existing files.
- `--output <dir>` – Target directory (default: current directory).

**Options for `updatemodule` / `updateconfig`:**
- `--force, -f` – Skip confirmation and overwrite without asking.

---

## 📁 Directory Structure

### Textbook mode (`type: textbook`)

```
./
├── config.txt              ← Book metadata (required)
├── ord.txt                 ← Chapter order list (optional)
├── Docs/                   ← Source .docx files (for docx2md)
├── Markdowns/              ← Source .md files (for convertch)
├── .epubcreator/           ← Tool configuration & language files (auto‑downloaded)
│   ├── settings.txt        ← Tool settings (lang, watch_delay, auto_build, overwrite_policy, default_type)
│   └── lang/               ← Language files (en.txt, id.txt)
├── node_modules/           ← Dependencies (auto‑downloaded via updatemodule)
├── EPUB/
│   ├── images/
│   │   └── cover.png       ← REQUIRED
│   ├── audiovideo/         ← Optional
│   ├── bab1.xhtml          ← Chapters (any name, in EPUB/ root)
│   └── ...
└── builds/
    └── [folder-name].epub  ← Build result
```

### Comic / Manga mode (`type: comic` or `type: manga`)

```
./
├── config.txt              ← type: comic | manga, reading_direction: ltr | rtl
├── ord.txt                 ← Optional: ordered list with * / ! / | alt
├── .epubcreator/           ← Tool configuration & language files
├── node_modules/           ← Dependencies
├── EPUB/
│   ├── images/
│   │   ├── cover.jpg       ← REQUIRED
│   │   └── pages/
│   │       ├── ch1/        ← Optional chapter grouping
│   │       │   ├── 0001.jpg
│   │       │   └── 0002.jpg
│   │       └── ch2/
│   │           └── 0001.jpg
│   ├── xhtmls/             ← Auto-generated by "convertch img2xhtml"
│   │   ├── ch1/
│   │   │   ├── 0001.xhtml
│   │   │   └── 0002.xhtml
│   │   └── ch2/
│   │       └── 0001.xhtml
│   ├── about.xhtml         ← Back-matter (reflowable) optional
│   └── audiovideo/         ← Optional
└── builds/
    └── [folder-name].epub  ← Build result
```

---

## 📝 Configuration Files

### `config.txt` – Book Metadata

**Textbook mode:**

```ini
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
contributors: 

# Judul tambahan (opsional), pisahkan dengan koma
extra_titles: 
```

**Comic / Manga mode:**

```ini
# Tipe buku: textbook | comic | manga
type: comic

# Arah baca: ltr | rtl
reading_direction: ltr

# Sifat spread: auto | none | landscape | both
spread: auto

# Fit mode gambar halaman: contain | cover | width | height | none
fit_mode: contain

title: Judul Komik
subtitle: 
volume: 
author: Nama Penulis
language: en
identifier: 
date: 
publisher: 
description: 
subjects: 
series_name: 
series_number: 
contributors: 
extra_titles: 
```

**DOCX heading mapping (optional, textbook):**

```ini
[docx-mapping]
heading1 = 24
heading2 = 18
heading3 = 14
```

### `.epubcreator/settings.txt` – Tool Settings

This file is automatically created when you run `createdir` or `settings`.

```ini
lang = en
watch_delay = 500
auto_build = false
overwrite_policy = ask
default_type = textbook
```

- **lang** – Interface language (`id` or `en`).
- **watch_delay** – Debounce delay (ms) for `debug` mode.
- **auto_build** – If `true`, automatically run `build` after a successful `convertch`.
- **overwrite_policy** – How to handle existing files: `ask`, `force`, or `skip`.
- **default_type** – Default type for `createdir` when run interactively (`textbook`, `comic`, or `manga`).

### `ord.txt` – Chapter / Page Order

**Textbook format:**

```txt
# Daftar urutan bab (satu baris satu .xhtml)
bab1.xhtml
bab2.xhtml
bab3.xhtml
```

**Comic / Manga format (extended):**

```txt
# Daftar urutan halaman (satu baris satu .xhtml, path relatif dari EPUB/xhtmls/)
# Format: [*|!]path [| alt-text]
#   *  = force page-spread-center (double spread)
#   !  = force single spread
#   (tanpa prefix) = auto-detect

ch1/0001.xhtml | Haruko masuk ke kafe
ch1/0002.xhtml | "Kamu ke mana?"
*ch2/0001.xhtml | Double spread opening
```

- `*` forces `page-spread-center`
- `!` forces a single spread (alternating based on reading direction)
- No prefix → auto-detects double-spread by image aspect ratio (> 1.4 = double)
- `| alt-text` provides a custom page title (used in TOC)

If `ord.txt` doesn't exist, chapters/pages are sorted naturally (numeric‑aware).

---

## 🔄 Conversion Details

### `convertch` — Markdown → XHTML

- Scans the `Markdowns/` directory (or a given path) for `.md` files.
- Extracts `## Heading` as chapter title.
- Converts Markdown to valid XHTML.
- Handles images, lists, tables, etc.
- Supports `--force` to overwrite existing files without prompts.

### `convertch img2xhtml` — Image → XHTML (comic/manga)

- Scans `EPUB/images/pages/` recursively for image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`).
- Generates matching `.xhtml` files in `EPUB/xhtmls/`, preserving subdirectory structure.
- Reads image dimensions (PNG, JPEG, GIF, WebP) to set viewport and fit mode.
- Only regenerates if the image is newer than the existing XHTML (or with `--force`).
- Auto-creates or updates `ord.txt`:
  - If missing → generates a fresh list.
  - If exists → appends new entries (asks for confirmation).
  - With `--regen-ord` → asks to regenerate from scratch.
- `fit_mode` from `config.txt` controls how images scale (`contain`, `cover`, `width`, `height`, `none`).

### `convertch xhtml2md` — XHTML → Markdown

- Scans the `EPUB/` directory (or a given path) for `.xhtml` files.
- Extracts `<title>` as chapter title.
- Converts XHTML back to Markdown.
- Excludes `cover.xhtml`, `toc.xhtml`, `nav.xhtml`.

### `convertch docx2md` — DOCX → Markdown

- Scans the `Docs/` directory (or a given path) for `.docx` files.
- Converts DOCX to HTML using `mammoth`.
- Detects headings by Word styles (`Heading 1`, `Heading 2`, `Heading 3`) or by font size if `[docx-mapping]` is configured in `config.txt`.
- Splits output into multiple `.md` files by `##` headings by default.
- Supports `--output`, `--force`, `--no-images`, and `--nosplit`.

### `split` — Split Markdown by Headings

- Splits a `.md` file (or all `.md` files in a directory) into separate files at each level‑2 heading (`##`).
- Each part is saved as `[basename]-pN.md`.
- Supports `--output` and `--force`.

### `merge` — Merge Markdown Files

- Merges all `.md` files found in a directory (or a single file) into one output file.
- Files are combined in natural (numeric‑aware) order.
- Supports `--output` and `--force`.

---

## 📖 Comic / Manga Workflow

1. **Create the project:**
   ```bash
   node epubcreator.js createdir comic
   # or
   node epubcreator.js createdir manga
   ```

2. **Place your page images** in `EPUB/images/pages/` (optionally grouped in `ch1/`, `ch2/`, …).  
   Place the cover at `EPUB/images/cover.jpg`.

3. **Generate XHTML pages:**
   ```bash
   node epubcreator.js convertch img2xhtml
   ```
   This creates `EPUB/xhtmls/` and populates `ord.txt`.

4. **Edit `config.txt`** – set title, author, reading direction, spread mode, etc.

5. **Edit `ord.txt`** if needed – add `*` for double spreads, `!` for singles, `| alt-text` for page titles.

6. **Build:**
   ```bash
   node epubcreator.js build
   ```

The builder will:
- Auto‑sync XHTML from images (silent).
- Detect double‑spreads by aspect ratio (or respect `*`/`!` in `ord.txt`).
- Generate a fixed‑layout OPF (`rendition:layout: prepaginated`, `rendition:spread`).
- Produce nested TOC if chapter folders are used.
- Include any back‑matter XHTML (reflowable) from `EPUB/` root.

---

## 🔍 Debug Mode (watch & auto-rebuild)

**Textbook mode** – watches `Markdowns/`:
1. Converts all `.md` files to `.xhtml` (force overwrite)
2. Builds the EPUB

**Comic / Manga mode** – watches `EPUB/images/pages/`:
1. Syncs XHTML from images
2. Builds the EPUB

Usage:

```bash
node epubcreator.js debug
```

- Runs until you press `Ctrl+C`.
- Uses a debounce delay from `.epubcreator/settings.txt` (default: 500ms).

---

## 📥 Import Existing EPUB

The `import` command extracts an existing `.epub` file into the project structure:

1. Scans the current directory for `.epub` files.
2. If multiple are found, prompts you to choose one.
3. Detects the book type from OPF metadata:
   - `rendition:layout: prepaginated` → **comic/manga** import
   - otherwise → **textbook** import
4. Extracts:
   - **Metadata** – title, author, language, identifier, date, publisher, description, subjects, series info, contributors.
   - **Chapters/Pages** – all XHTML files in the spine.
   - **Cover image** – saved to `EPUB/images/`.
   - **Other images** – saved to `EPUB/images/`.
   - **Audio/Video** – saved to `EPUB/audiovideo/`.
5. Generates `config.txt` and `ord.txt` automatically.
6. For comic/manga: page images are extracted to `EPUB/images/pages/`, XHTML is regenerated, and `ord.txt` reflects the original spine order.

Example:

```bash
node epubcreator.js import
node epubcreator.js import --force --output ./my_book
```

---

## ⚡ Auto‑Download Dependencies (`updatemodule`)

Downloads a pre‑built tarball from the `main` branch and extracts `node_modules`.

```bash
node epubcreator.js updatemodule
node epubcreator.js updatemodule --force
```

---

## 🔄 Update Tool Configuration (`updateconfig`)

Downloads the latest `.epubcreator/` folder (settings & language files) from the `config` branch.

```bash
node epubcreator.js updateconfig
node epubcreator.js updateconfig --force
```

---

## ⚙️ Interactive Settings (`settings`)

```bash
node epubcreator.js settings
```

Edit `lang`, `watch_delay`, `auto_build`, `overwrite_policy`, `default_type`.  
Press `Enter` to keep, type a new value to change, `save` to save, `cancel` to abort.

---

## 🏗️ Build Process

The `build` command:

1. Reads `config.txt` for metadata and `type`.
2. Branches based on type:
   - **Textbook** → collects chapters from `EPUB/` (respects `ord.txt`).
   - **Comic/Manga** → syncs XHTML from images, collects pages via `ord.txt`, detects spreads.
3. Detects cover image (`cover.*` in `EPUB/images/`).
4. Generates:
   - `volume.opf` – EPUB package file (with `rendition:*` metadata for comic/manga)
   - `toc.xhtml` – Table of Contents (nested for comic chapters)
   - `cover.xhtml` – Cover page
   - `META-INF/container.xml`
5. Packages everything into `builds/[folder-name].epub`.

---

## 🌍 Language Support

- Default language is English (`en`).
- Change via `settings` or by editing `.epubcreator/settings.txt`.
- Language files live in `.epubcreator/lang/`.
- Falls back to built‑in English strings if a file is missing.

---

## 💡 Examples

### 1. Start a new textbook project

```bash
node epubcreator.js createdir
# or force mode
node epubcreator.js createdir textbook
```

### 2. Start a new comic project (LTR)

```bash
node epubcreator.js createdir comic
```

### 3. Start a new manga project (RTL)

```bash
node epubcreator.js createdir manga
```

### 4. Convert Markdown to XHTML

```bash
node epubcreator.js convertch
node epubcreator.js convertch ./my_markdown
node epubcreator.js convertch --force
```

### 5. Generate comic pages from images

```bash
node epubcreator.js convertch img2xhtml
node epubcreator.js convertch img2xhtml --regen-ord
node epubcreator.js convertch img2xhtml --force
```

### 6. Convert DOCX to Markdown

```bash
node epubcreator.js convertch docx2md
node epubcreator.js convertch docx2md ./MyDocs --output ./MyMarkdowns
node epubcreator.js conv docx2md -f
node epubcreator.js convertch docx2md --nosplit
```

### 7. Split a Markdown file

```bash
node epubcreator.js split Markdowns/
node epubcreator.js split chapter.md --output ./split_parts --force
```

### 8. Merge Markdown files

```bash
node epubcreator.js merge Markdowns/
node epubcreator.js merge ./split_parts --output full.md --force
```

### 9. Import an existing EPUB

```bash
node epubcreator.js import
node epubcreator.js import --force --output ./imported_book
```

### 10. Build the EPUB

```bash
node epubcreator.js build
# Output: builds/[folder-name].epub
```

### 11. Convert XHTML back to Markdown

```bash
node epubcreator.js convertch xhtml2md
node epubcreator.js conv xhtml2md ./EPUB/custom
```

### 12. Download dependencies automatically

```bash
node epubcreator.js updatemodule
```

### 13. Update tool configuration

```bash
node epubcreator.js updateconfig
```

### 14. Change tool settings interactively

```bash
node epubcreator.js settings
```

### 15. Debug / auto-rebuild

```bash
node epubcreator.js debug
```

---

## 📦 Dependencies

- `archiver` (5.3.0) – ZIP packaging
- `marked` (4.0.0) – Markdown parsing
- `turndown` (7.2.4) – XHTML to Markdown conversion
- `mammoth` (1.6.0) – DOCX to HTML conversion (optional)
- `adm-zip` (0.5.10) – EPUB import (optional)
- `xml2js` (0.5.0) – OPF parsing for import (optional)

All dependencies can be installed manually via `npm install` or automatically via `updatemodule`.

---

## 📜 License

MIT Copyright (C) 2026 YogabyAllwaysever

---

## ⭐ Support

If you find this tool useful, please give it a ⭐ on GitHub!

---

Happy EPUB-creating! 📚✨