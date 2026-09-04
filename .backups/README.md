![epubcreator logo](assets/icons/icon-name-badge.png)  
📚 epubCreator

CLI tool for compiling a directory into an EPUB ebook

Version: 2.9.0

---

✨ Features

- 🏗️ Build EPUB from a structured directory
- 📝 Create config.txt template for book metadata
- 📂 Create directory structure with all necessary files
- 🔄 Convert Markdown (.md) to XHTML (.xhtml) and vice versa
- 📄 Convert DOCX (.docx) to Markdown (.md) with smart heading detection
- ✂️ **Split** Markdown files by headings (`##`) into multiple files
- 🔗 **Merge** multiple Markdown files into one (reverse of split)
- 📥 **Import existing EPUB** – extract chapters, metadata, cover, and media into the project structure
- 🔍 **Debug mode** – watch Markdowns/ for changes and auto-rebuild
- 📦 **Auto‑download dependencies** – fetch and extract pre‑built `node_modules` from the repository
- 🌍 Multilingual support (Indonesian & English)
- 📋 Chapter order control via optional ord.txt
- 🎨 Automatic cover, TOC, and metadata generation
- 📦 Zero-config build with sensible defaults
- ⚙️ Flexible input paths and force-overwrite options

---

📦 Installation

```bash
git clone https://github.com/yourusername/epubcreator.git
cd epubcreator
```

or download as ZIP

Main dependencies:

```bash
npm install archiver@5.3.0 marked@4.0.0 turndown@7.2.4
```

Optional dependencies:

· For DOCX conversion: npm install mammoth@1.6.0
· For EPUB import: npm install adm-zip@0.5.10 xml2js@0.5.0

Alternative: run node epubcreator.js updatemodule to download all dependencies automatically.

---

🚀 Usage

```bash
node epubcreator.js <command> [options]
```

Available Commands

· createconfig
Create config.txt template
· createchapter
Create a chapter .xhtml template file
· createdir
Create directory structure and template files
· convertch [path] [options]
Convert .md files to .xhtml (default; scans Markdowns/ or given path)
· convertch xhtml2md [path]
Convert .xhtml files to .md (scans EPUB/ or given path)
· convertch docx2md [path] [options]
Convert .docx files to .md (scans Docs/ or given path; split by ##)
· conv ...
Alias for convertch (same subcommands and options)
· split <path> [options]
Split a Markdown file into multiple files by heading level 2 (##)
· merge <path> [options]
Merge multiple Markdown files into one (reverse of split)
· build
Build EPUB from current directory
· debug
Watch Markdowns/ for changes; auto-convert .md → .xhtml and rebuild on every change
· import [options]
Import an existing .epub file from the current directory into the project structure
· updatemodule [--force]
Download/update node_modules from the repository (pre‑built bundle)
· lang-id
Switch language to Indonesian
· lang-en
Switch language to English (US)
· --version, -v
Show version
· help, --help
Show help message

Options for convertch (MD → XHTML):

· --force, -f – Overwrite existing .xhtml files without asking.

Options for convertch docx2md:

· --force, -f – Overwrite existing .md files without asking.
· --output <dir> – Output directory (default: Markdowns/fromdocx).
· --no-images – Suppress warning about unsupported image extraction (currently images are ignored anyway).
· --nosplit, -n – Do not split by headings; output a single .md file per .docx.

Options for split:

· --output <dir> – Output directory (default: Markdowns/split).
· --force, -f – Overwrite existing files without asking.

Options for merge:

· --output <file> – Output file path (default: merged.md).
· --force, -f – Overwrite existing file without asking.

Options for import:

· --force, -f – Overwrite existing files without asking.
· --output <dir> – Target directory (default: current directory).

Options for updatemodule:

· --force, -f – Skip confirmation and overwrite existing node_modules.

---

📁 Directory Structure

```
./
├── config.txt              ← Book metadata (required)
├── ord.txt                 ← Chapter order list (optional)
├── Docs/                   ← Source .docx files (for docx2md)
├── Markdowns/              ← Source .md files (for convertch)
├── EPUB/
│   ├── images/
│   │   └── cover.png       ← REQUIRED
│   ├── audiovideo/         ← Optional
│   ├── bab1.xhtml          ← Chapters (any name, in EPUB/ root)
│   └── ...
└── builds/
    └── [folder-name].epub  ← Build result
```

---

📝 Configuration (config.txt)

```ini
# ============================================================
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
```

---

📄 Order File (ord.txt)

Optional file to specify chapter order. Each line contains a .xhtml filename:

```txt
# Daftar urutan bab (satu baris satu .xhtml)
bab1.xhtml
bab2.xhtml
bab3.xhtml
```

If ord.txt doesn't exist, chapters are sorted naturally (numeric-aware).

---

🔄 Conversion Details

convertch — Markdown → XHTML

· Scans the Markdowns/ directory (or a given path) for .md files.
· Extracts ## Heading as chapter title.
· Converts Markdown to valid XHTML.
· Handles images, lists, tables, etc.
· Supports --force to overwrite existing files without prompts.

convertch xhtml2md — XHTML → Markdown

· Scans the EPUB/ directory (or a given path) for .xhtml files.
· Extracts <title> as chapter title.
· Converts XHTML back to Markdown.
· Excludes cover.xhtml, toc.xhtml, nav.xhtml.

convertch docx2md — DOCX → Markdown

· Scans the Docs/ directory (or a given path) for .docx files.
· Converts DOCX to HTML using mammoth.
· Detects headings by Word styles (Heading 1, 2, 3) or by font size if [docx-mapping] is configured.
· Splits output into multiple .md files by ## headings by default.
· Supports --output, --force, --no-images, and --nosplit (to produce a single .md per .docx).

split — Split Markdown by Headings

· Splits a .md file (or all .md files in a directory) into separate files at each level-2 heading (##).
· Each part is saved as [basename]-pN.md where N is the part number.
· If no heading is found, the entire content is saved as one file.
· Supports --output and --force.

merge — Merge Markdown Files

· Merges all .md files found in a directory (or a single file) into one output file.
· Files are combined in natural (numeric-aware) order.
· Useful to reverse the split operation or to combine chapter files.
· Supports --output and --force.

---

🔍 Debug Mode (watch & auto-rebuild)

The debug command watches the Markdowns/ directory for any changes (add, modify, delete) and automatically:

1. Converts all .md files to .xhtml (force overwrite)
2. Builds the EPUB

This is useful for iterative writing: edit your .md files, save, and the EPUB is rebuilt automatically.

Usage:

```bash
node epubcreator.js debug
```

· Runs until you press Ctrl+C.
· Uses a 500ms debounce to avoid excessive rebuilds during rapid edits.
· Works on the current directory.

---

📥 Import Existing EPUB

The import command extracts an existing .epub file into the project structure:

1. Scans the current directory (or --output) for .epub files.
2. If multiple are found, prompts you to choose one.
3. Extracts:
   · Metadata – title, author, language, identifier, date, publisher, description, subjects, series info, contributors.
   · Chapters – all XHTML files listed in the spine (saved to EPUB/).
   · Cover image – if found, saved to EPUB/images/.
   · Other images – saved to EPUB/images/.
   · Audio/Video – saved to EPUB/audiovideo/.
4. Generates config.txt and ord.txt automatically based on extracted data.
5. Existing files are skipped unless --force is used.

Example:

```bash
# Import the only .epub in the current directory
node epubcreator.js import

# Force overwrite and specify output directory
node epubcreator.js import --force --output ./my_book
```

After import, you can:

· Edit config.txt to adjust metadata.
· Edit the XHTML files in EPUB/ if needed.
· Run node epubcreator.js convertch xhtml2md to convert chapters to Markdown for easier editing.
· Run node epubcreator.js build to rebuild the EPUB.

---

⚡ Auto‑Download Dependencies (updatemodule)

The updatemodule command simplifies dependency management:

· Downloads a pre‑built tarball from the repository.
· Extracts the node_modules folder directly into your project.
· Avoids manual npm install steps and version mismatches.

Usage:

```bash
# Download and extract (prompts if node_modules already exists)
node epubcreator.js updatemodule

# Force overwrite without confirmation
node epubcreator.js updatemodule --force
```

This is especially useful when you want a quick setup or when npm install fails due to network or platform issues.

---

🏗️ Build Process

The build command:

1. Reads config.txt for metadata.
2. Collects chapters from EPUB/ (respects ord.txt if exists).
3. Detects cover image (cover.png in EPUB/images/).
4. Generates:
   · volume.opf — EPUB package file
   · toc.xhtml — Table of Contents
   · cover.xhtml — Cover page
   · META-INF/container.xml
5. Packages everything into builds/[folder-name].epub.

---

🌍 Language Support

The tool supports Indonesian (id) and English (en).

· On first run, you will be prompted to choose your preferred language.
· The choice is saved in .epubcreator.txt in the current directory.
· Switch anytime with lang-id or lang-en.

---

💡 Examples

1. Start a new book project

```bash
node epubcreator.js createdir
```

This creates:

· config.txt, ord.txt
· EPUB/ with images/ and audiovideo/
· Markdowns/
· Docs/

2. Create a chapter

```bash
node epubcreator.js createchapter
# Enter filename: bab1.xhtml
# Enter chapter title: Pengantar
```

3. Convert Markdown to XHTML

```bash
# Default: scans Markdowns/
node epubcreator.js convertch

# Specify a different directory or file
node epubcreator.js convertch ./my_markdown

# Force overwrite
node epubcreator.js convertch --force
```

4. Convert DOCX to Markdown

```bash
# Scan Docs/ (default)
node epubcreator.js convertch docx2md

# Custom input and output
node epubcreator.js convertch docx2md ./MyDocs --output ./MyMarkdowns

# Force overwrite
node epubcreator.js conv docx2md -f

# Output a single .md file per .docx (no split)
node epubcreator.js convertch docx2md --nosplit
```

5. Split a Markdown file

```bash
# Split all .md files in Markdowns/
node epubcreator.js split Markdowns/

# Split a single file and save to custom directory
node epubcreator.js split chapter.md --output ./split_parts --force
```

6. Merge Markdown files

```bash
# Merge all .md files in Markdowns/ into merged.md
node epubcreator.js merge Markdowns/

# Merge with custom output and force overwrite
node epubcreator.js merge ./split_parts --output full.md --force
```

7. Import an existing EPUB

```bash
# Import the first .epub found
node epubcreator.js import

# Choose from multiple .epub files
node epubcreator.js import

# Force overwrite and specify output
node epubcreator.js import --force --output ./imported_book
```

8. Build the EPUB

```bash
node epubcreator.js build
# Output: builds/[folder-name].epub
```

9. Convert XHTML back to Markdown

```bash
node epubcreator.js convertch xhtml2md
# or using the alias
node epubcreator.js conv xhtml2md ./EPUB/custom
```

10. Download dependencies automatically

```bash
node epubcreator.js updatemodule
```

11. Debug / auto-rebuild

```bash
# Watch Markdowns/ and rebuild on every change
node epubcreator.js debug
```

---

📦 Dependencies

· archiver (5.3.0) — ZIP packaging
· marked (4.0.0) — Markdown parsing
· turndown (7.2.4) — XHTML to Markdown conversion
· mammoth (1.6.0) — DOCX to HTML conversion (optional)
· adm-zip (0.5.10) — EPUB import (optional)
· xml2js (0.5.0) — OPF parsing for import (optional)

All dependencies can be installed manually via npm install or automatically via updatemodule.

---

📜 License

MIT Copyright (C) 2026 YogabyAllwaysever

---

⭐ Support

If you find this tool useful, please give it a ⭐ on GitHub!

---

Happy EPUB-creating! 📚✨