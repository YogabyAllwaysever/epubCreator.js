![epubcreator logo](assets/icons/icon-name.png)
📚 epubCreator

CLI tool for compiling a directory into an EPUB ebook

Version: 2.5.0

---

✨ Features

- 🏗️ Build EPUB from a structured directory
- 📝 Create config.txt template for book metadata
- 📂 Create directory structure with all necessary files
- 🔄 Convert Markdown (.md) to XHTML (.xhtml) and vice versa
- 🌍 Multilingual support (Indonesian & English)
- 📋 Chapter order control via optional ord.txt
- 🎨 Automatic cover, TOC, and metadata generation
- 📦 Zero-config build with sensible defaults

---

📦 Installation

```bash
git clone https://github.com/yourusername/epubcreator.git
cd epubcreator
```
or download as ZIP

Dependencies

```bash
npm install archiver@5.3.0 marked@4.0.0 turndown@7.2.4
```

---

🚀 Usage

```bash
node epubcreator.js <command> [options]
```

Available Commands

- createconfig
    Create config.txt template
- createchapter
    Create a chapter .xhtml template file
- createdir
    Create directory structure and template files
- convertch
    Convert .md files to .xhtml (valid XHTML output)
- convertchx
    Convert .xhtml files to .md (reverse)
- build
    Build EPUB from current directory
- lang-id
    Switch language to Indonesian
- lang-en
    Switch language to English (US)
- --version, -v
    Show version
- help, --help
    Show help message

---

📁 Directory Structure

```
./
├── config.txt              ← Book metadata (required)
├── ord.txt                 ← Chapter order list (optional)
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

- Scans the Markdowns/ directory (or specified path)
- Extracts ## Heading as chapter title
- Converts Markdown to valid XHTML
- Handles images, lists, tables, etc.

convertchx — XHTML → Markdown

- Scans the EPUB/ directory (or specified path)
- Extracts <title> as chapter title
- Converts XHTML back to Markdown
- Excludes cover.xhtml, toc.xhtml, nav.xhtml

---

🏗️ Build Process

The build command:

1. Reads config.txt for metadata
2. Collects chapters from EPUB/ (respects ord.txt if exists)
3. Detects cover image (cover.png in EPUB/images/)
4. Generates:
   - volume.opf — EPUB package file
   - toc.xhtml — Table of Contents
   - cover.xhtml — Cover page
   - META-INF/container.xml
5. Packages everything into builds/[folder-name].epub

---

🌍 Language Support

The tool supports Indonesian (id) and English (en).

- First run will ask for language preference
- Language is saved in .epubcreator.txt
- Switch anytime with lang-id or lang-en

---

💡 Examples

1. Start a new book project

```bash
node epubcreator.js createdir
```

This creates:

- config.txt
- ord.txt
- EPUB/ with images/ and audiovideo/
- Markdowns/

2. Create a chapter

```bash
node epubcreator.js createchapter
# Enter filename: bab1.xhtml
# Enter chapter title: Pengantar
```

3. Convert Markdown to XHTML

```bash
node epubcreator.js convertch
```

4. Build the EPUB

```bash
node epubcreator.js build
# Output: builds/[folder-name].epub
```

5. Convert XHTML back to Markdown

```bash
node epubcreator.js convertchx
```

---

📦 Dependencies

- archiver (5.3.0) — ZIP packaging
- marked (4.0.0) — Markdown parsing
- turndown (7.2.4) — XHTML to Markdown conversion

---

📜 License

MIT Copyright (C) 2026 YogabyAllwaysever

---

⭐ Support

If you find this tool useful, please give it a ⭐ on GitHub!

---

Happy EPUB-creating! 📚✨