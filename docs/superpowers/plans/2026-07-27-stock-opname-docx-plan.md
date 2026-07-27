# Stock Opname DOCX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-page mass stock input with two-tab opname dokumen system and DOCX export.

**Architecture:** Two new tables (`stock_opname` header, `stock_opname_item` detail); `stock_opname_cmd.rs` with CRUD + export; `037_stock_opname.sql` migration; rewrite `StockOpname.jsx` as two-tab page (Opname Baru + Riwayat).

**Tech Stack:** Rust `zip` crate (add to Cargo.toml); OOXML generation via raw XML + ZIP; Tauri IPC commands; `tauri-plugin-dialog` for save path; `PageKit` component patterns.

## Global Constraints

- All SQL must use `IF NOT EXISTS` / `INSERT OR IGNORE` — migrations idempotent
- All `#[tauri::command]` return `Result<T, String>`
- DOCX generation: minimal valid OOXML ZIP; no additional DOCX framework crates beyond `zip`
- Product data snapshot at opname time (produk_id, kode_barang, nama_barang, satuan, stok_sistem)
- Stock adjustment only for items with selisih ≠ 0
- Every Rust command registered in `lib.rs` invoke_handler
- `npm run build` + `cargo test` + `cargo build` must pass after every task

---

### Task 1: Migration + `ensure_column` for stock_opname tables

**Files:**
- Create: `src-tauri/migrations/037_stock_opname.sql`
- Modify: `src-tauri/src/db.rs` (add ensure_column calls + migration include)

**Interfaces:**
- Consumes: `rusqlite::Connection`
- Produces: tables `stock_opname` and `stock_opname_item` with correct schema

- [ ] **Step 1: Write migration 037**

```sql
-- Migration 037: Stock opname header + detail tables
-- Header: metadata dokumen opname
-- Detail: snapshot per produk + stok fisik hasil hitung
CREATE TABLE IF NOT EXISTS stock_opname (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT UNIQUE NOT NULL,
  nama_toko TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  petugas TEXT NOT NULL,
  penanggung_jawab TEXT NOT NULL DEFAULT '',
  catatan TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_opname_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opname_id INTEGER NOT NULL REFERENCES stock_opname(id) ON DELETE CASCADE,
  produk_id INTEGER NOT NULL,
  kode_barang TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT '',
  stok_sistem INTEGER NOT NULL,
  stok_fisik INTEGER NOT NULL,
  selisih INTEGER NOT NULL,
  keterangan TEXT NOT NULL DEFAULT ''
);

-- Nomor setting untuk dokumen opname
INSERT OR IGNORE INTO nomor_settings (tipe, prefix, digit_run, current_number, reset_period, last_reset_year, last_reset_month)
VALUES ('opname', 'OPG', 3, 0, 'none', 0, 0);
```

- [ ] **Step 2: Integrate migration in db.rs**

In `src-tauri/src/db.rs`, add after the last existing `ensure_column` block / before the maintenance call:
```rust
match conn.execute_batch(include_str!("../migrations/037_stock_opname.sql")) {
    Ok(_) => eprintln!("DB_INIT: Migrasi 037 sukses"),
    Err(e) => eprintln!("DB_INIT: Migrasi 037 gagal/sudah pernah: {e}"),
}
```

- [ ] **Step 3: Run to verify**

Run: `cargo build`
Expected: compiles; on next app launch, tables created.

---

### Task 2: Backend — `stock_opname_cmd.rs` create + list + get

**Files:**
- Create: `src-tauri/src/commands/stock_opname_cmd.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add `pub mod stock_opname_cmd;`)
- Modify: `src-tauri/src/lib.rs` (register commands)

**Interfaces:**
- Consumes: `DbState`, `generate_nomor("opname")`, `adjust_stock` pattern
- Produces:
  - `create_stock_opname(input: CreateStockOpnameInput) -> Result<StockOpnameHeader, String>`
  - `list_stock_opname() -> Result<Vec<StockOpnameRow>, String>`
  - `get_stock_opname(id: i64) -> Result<StockOpnameFull, String>`

- [ ] **Step 1: Write the command file**

```rust
use crate::db::DbState;
use chrono::Local;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize)]
pub struct StockOpnameHeader {
    pub id: i64,
    pub kode: String,
    pub nama_toko: String,
    pub tanggal: String,
    pub petugas: String,
    pub penanggung_jawab: String,
    pub catatan: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct StockOpnameRow {
    pub id: i64,
    pub kode: String,
    pub nama_toko: String,
    pub tanggal: String,
    pub petugas: String,
    pub penanggung_jawab: String,
    pub catatan: String,
    pub created_at: String,
    pub jumlah_item: i64,
    pub total_selisih_kurang: i64,
    pub total_selisih_lebih: i64,
}

#[derive(Debug, Serialize)]
pub struct StockOpnameItem {
    pub id: i64,
    pub opname_id: i64,
    pub produk_id: i64,
    pub kode_barang: String,
    pub nama_barang: String,
    pub satuan: String,
    pub stok_sistem: i64,
    pub stok_fisik: i64,
    pub selisih: i64,
    pub keterangan: String,
}

#[derive(Debug, Serialize)]
pub struct StockOpnameFull {
    pub header: StockOpnameHeader,
    pub items: Vec<StockOpnameItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockOpnameItemInput {
    pub produk_id: i64,
    pub kode_barang: String,
    pub nama_barang: String,
    pub satuan: String,
    pub stok_sistem: i64,
    pub stok_fisik: i64,
    pub keterangan: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStockOpnameInput {
    pub nama_toko: String,
    pub tanggal: String,
    pub petugas: String,
    pub penanggung_jawab: String,
    pub catatan: String,
    pub items: Vec<StockOpnameItemInput>,
}

/// Buat dokumen opname baru: header + item snapshot + penyesuaian stok.
/// Semua dalam satu transaksi.
#[tauri::command]
pub fn create_stock_opname(
    state: State<DbState>,
    input: CreateStockOpnameInput,
) -> Result<StockOpnameHeader, String> {
    // Validasi
    let nama_toko = input.nama_toko.trim().to_string();
    if nama_toko.is_empty() {
        return Err("Nama toko wajib diisi".into());
    }
    let tanggal = input.tanggal.trim().to_string();
    if tanggal.is_empty() {
        return Err("Tanggal wajib diisi".into());
    }
    let petugas = input.petugas.trim().to_string();
    if petugas.is_empty() {
        return Err("Petugas wajib diisi".into());
    }
    if input.items.is_empty() {
        return Err("Minimal satu item wajib diisi".into());
    }
    for item in &input.items {
        if item.stok_fisik < 0 {
            return Err(format!("Stok fisik {} tidak boleh negatif", item.nama_barang));
        }
    }

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Generate kode
    let (prefix, digit_run, _current, _reset_period, _ly, _lm): (String, i64, i64, String, i64, i64) = tx.query_row(
        "SELECT prefix, digit_run, current_number, reset_period, last_reset_year, last_reset_month FROM nomor_settings WHERE tipe = 'opname'",
        [],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?
        ))
    ).map_err(|_| "Setting nomor opname tidak ditemukan".to_string())?;

    let now = Local::now();
    let year = now.year();
    let month = now.month() as i64;
    let next = _current + 1;

    let kode = format!("{}{}{:0width$}", prefix, now.format("%Y%m%d"), next, width = digit_run as usize);

    tx.execute(
        "UPDATE nomor_settings SET current_number = ?1, last_reset_year = ?2, last_reset_month = ?3 WHERE tipe = 'opname'",
        params![next, year, month],
    ).map_err(|e| e.to_string())?;

    // Simpan header
    tx.execute(
        "INSERT INTO stock_opname (kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![kode, nama_toko, tanggal, petugas, input.penanggung_jawab, input.catatan],
    ).map_err(|e| e.to_string())?;
    let opname_id = tx.last_insert_rowid();

    // Simpan item + adjust stok
    for item in &input.items {
        let selisih = item.stok_fisik - item.stok_sistem;
        tx.execute(
            "INSERT INTO stock_opname_item (opname_id, produk_id, kode_barang, nama_barang, satuan, stok_sistem, stok_fisik, selisih, keterangan)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![opname_id, item.produk_id, item.kode_barang, item.nama_barang, item.satuan, item.stok_sistem, item.stok_fisik, selisih, item.keterangan],
        ).map_err(|e| e.to_string())?;

        if selisih != 0 {
            let alasan = format!("Stok opname {}: {}", kode, item.nama_barang);
            let stok_baru = item.stok_fisik;
            tx.execute(
                "UPDATE produk SET stok = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![stok_baru, item.produk_id],
            ).map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO stock_adjustment (produk_id, selisih, stok_sebelum, stok_sesudah, alasan)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![item.produk_id, selisih, item.stok_sistem, stok_baru, alasan],
            ).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(StockOpnameHeader {
        id: opname_id,
        kode,
        nama_toko,
        tanggal,
        petugas,
        penanggung_jawab: input.penanggung_jawab,
        catatan: input.catatan,
        created_at: now.format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// Daftar riwayat opname beserta ringkasan
#[tauri::command]
pub fn list_stock_opname(state: State<DbState>) -> Result<Vec<StockOpnameRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT o.id, o.kode, o.nama_toko, o.tanggal, o.petugas, o.penanggung_jawab,
                o.catatan, o.created_at,
                COUNT(i.id) as jumlah_item,
                COALESCE(SUM(CASE WHEN i.selisih < 0 THEN i.selisih ELSE 0 END), 0) as total_kurang,
                COALESCE(SUM(CASE WHEN i.selisih > 0 THEN i.selisih ELSE 0 END), 0) as total_lebih
         FROM stock_opname o
         LEFT JOIN stock_opname_item i ON i.opname_id = o.id
         GROUP BY o.id
         ORDER BY o.created_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(StockOpnameRow {
            id: row.get(0)?,
            kode: row.get(1)?,
            nama_toko: row.get(2)?,
            tanggal: row.get(3)?,
            petugas: row.get(4)?,
            penanggung_jawab: row.get(5)?,
            catatan: row.get(6)?,
            created_at: row.get(7)?,
            jumlah_item: row.get(8)?,
            total_selisih_kurang: row.get(9)?,
            total_selisih_lebih: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Detail opname: header + seluruh item
#[tauri::command]
pub fn get_stock_opname(state: State<DbState>, id: i64) -> Result<StockOpnameFull, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let header = conn.query_row(
        "SELECT id, kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan, created_at
         FROM stock_opname WHERE id = ?1",
        params![id],
        |row| Ok(StockOpnameHeader {
            id: row.get(0)?,
            kode: row.get(1)?,
            nama_toko: row.get(2)?,
            tanggal: row.get(3)?,
            petugas: row.get(4)?,
            penanggung_jawab: row.get(5)?,
            catatan: row.get(6)?,
            created_at: row.get(7)?,
        })
    ).map_err(|_| format!("Opname ID {} tidak ditemukan", id))?;

    let mut stmt = conn.prepare(
        "SELECT id, opname_id, produk_id, kode_barang, nama_barang, satuan,
                stok_sistem, stok_fisik, selisih, keterangan
         FROM stock_opname_item WHERE opname_id = ?1
         ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map(params![id], |row| {
        Ok(StockOpnameItem {
            id: row.get(0)?,
            opname_id: row.get(1)?,
            produk_id: row.get(2)?,
            kode_barang: row.get(3)?,
            nama_barang: row.get(4)?,
            satuan: row.get(5)?,
            stok_sistem: row.get(6)?,
            stok_fisik: row.get(7)?,
            selisih: row.get(8)?,
            keterangan: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    let items: Vec<StockOpnameItem> = items.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(StockOpnameFull { header, items })
}
```

- [ ] **Step 2: Add module declaration**

In `src-tauri/src/commands/mod.rs`:
```rust
pub mod stock_opname_cmd;
```

Add in alphabetical order.

- [ ] **Step 3: Register commands in lib.rs**

In the invoke_handler, add three lines:
```rust
commands::stock_opname_cmd::create_stock_opname,
commands::stock_opname_cmd::list_stock_opname,
commands::stock_opname_cmd::get_stock_opname,
```

- [ ] **Step 4: Verify compile**

Run: `cargo build`
Expected: compiles without errors
---

### Task 3: Add `zip` crate + `export_stock_opname_docx` command

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `zip` dependency)
- Modify: `src-tauri/src/commands/stock_opname_cmd.rs` (add export function)

**Interfaces:**
- Consumes: `get_stock_opname`, `zip::ZipWriter`
- Produces: `export_stock_opname_docx(opname_id: i64, save_path: String) -> Result<(), String>`

- [ ] **Step 1: Add `zip` crate**

In `src-tauri/Cargo.toml`, add:
```toml
zip = "2"
```

- [ ] **Step 2: Write DOCX generation function**

Append to `stock_opname_cmd.rs`:

```rust
/// Export opname ke file DOCX draft.
/// DOCX = OOXML ZIP berisi document.xml dengan tabel dan header.
#[tauri::command]
pub fn export_stock_opname_docx(
    state: State<DbState>,
    opname_id: i64,
    save_path: String,
) -> Result<(), String> {
    use std::io::Write;

    // Ambil data
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let header = conn.query_row(
        "SELECT kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan
         FROM stock_opname WHERE id = ?1",
        params![opname_id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    ).map_err(|_| format!("Opname ID {} tidak ditemukan", opname_id))?;
    let (kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan) = header;

    let mut stmt = conn.prepare(
        "SELECT kode_barang, nama_barang, satuan, stok_sistem, stok_fisik, selisih, keterangan
         FROM stock_opname_item WHERE opname_id = ?1 ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;

    type ItemRow = (String, String, String, i64, i64, i64, String);
    let items: Vec<ItemRow> = stmt.query_map(params![opname_id], |row| {
        Ok((
            row.get(0)?, row.get(1)?, row.get(2)?,
            row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?
        ))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    drop(conn);

    // Hitung ringkasan
    let jumlah_item = items.len();
    let total_kurang: i64 = items.iter().filter(|i| i.5 < 0).map(|i| i.5.abs()).sum();
    let total_lebih: i64 = items.iter().filter(|i| i.5 > 0).map(|i| i.5).sum();

    // Build document.xml
    let mut doc_body = String::new();
    doc_body.push_str(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>"#);

    // Title
    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:rPr><w:jc w:val="center"/><w:sz w:val="32"/></w:rPr><w:t>FORM STOK OPNAME</w:t></w:r></w:p>"#
    ));
    doc_body.push_str(r#"<w:p><w:r><w:br/></w:r></w:p>"#);

    // Header info
    let info_lines = vec![
        format!("Kode      : {}", escape_xml(&kode)),
        format!("Nama Toko : {}", escape_xml(&nama_toko)),
        format!("Tanggal   : {}", escape_xml(&tanggal)),
        format!("Petugas   : {}", escape_xml(&petugas)),
        format!("Penanggung Jawab: {}", escape_xml(&penanggung_jawab)),
    ];
    for line in &info_lines {
        doc_body.push_str(&format!(
            r#"<w:p><w:r><w:t>{}</w:t></w:r></w:p>"#,
            escape_xml(line)
        ));
    }
    doc_body.push_str(r#"<w:p><w:r><w:br/></w:r></w:p>"#);

    // Table
    doc_body.push_str(r#"<w:tbl><w:tblPr><w:tblW w:w="9500" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>"#);

    // Header row
    doc_body.push_str(r#"<w:tr><w:trPr><w:tblHeader w:val="1"/></w:trPr>"#);
    let headers = ["No", "Kode Barang", "Nama Barang", "Satuan", "Stok Sistem", "Stok Fisik", "Selisih", "Keterangan"];
    let widths = ["400", "1200", "2200", "800", "1200", "1200", "1000", "1500"];
    for (i, h) in headers.iter().enumerate() {
        doc_body.push_str(&format!(
            r#"<w:tc><w:tcPr><w:tcW w:w="{}" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>{}</w:t></w:r></w:p></w:tc>"#,
            widths[i], escape_xml(h)
        ));
    }
    doc_body.push_str(r#"</w:tr>"#);

    // Data rows
    for (idx, item) in items.iter().enumerate() {
        let no = idx + 1;
        let selisih_str = if item.5 > 0 { format!("+{}", item.5) } else { item.5.to_string() };
        doc_body.push_str(r#"<w:tr>"#);
        let vals = [
            no.to_string(),
            item.0.clone(),
            item.1.clone(),
            item.2.clone(),
            item.3.to_string(),
            item.4.to_string(),
            selisih_str,
            item.6.clone(),
        ];
        for (i, v) in vals.iter().enumerate() {
            doc_body.push_str(&format!(
                r#"<w:tc><w:tcPr><w:tcW w:w="{}" w:type="dxa"/></w:tcPr><w:p><w:r><w:sz w:val="18"/><w:t>{}</w:t></w:r></w:p></w:tc>"#,
                widths[i], escape_xml(v)
            ));
        }
        doc_body.push_str(r#"</w:tr>"#);
    }

    doc_body.push_str(r#"</w:tbl>"#);
    doc_body.push_str(r#"<w:p><w:r><w:br/></w:r></w:p>"#);

    // Summary
    let summary = format!(
        "Ringkasan: {} item. Selisih kurang: {}, Selisih lebih: {}",
        jumlah_item, total_kurang, total_lebih
    );
    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>{}</w:t></w:r></w:p>"#,
        escape_xml(&summary)
    ));

    if !catatan.is_empty() {
        doc_body.push_str(&format!(
            r#"<w:p><w:r><w:t>Catatan: {}</w:t></w:r></w:p>"#,
            escape_xml(&catatan)
        ));
    }

    doc_body.push_str(r#"<w:p><w:r><w:br/></w:r></w:p>"#);

    // Tanda tangan
    let ttd_petugas = if petugas.is_empty() { "_______________" } else { &petugas };
    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:t>Dibuat oleh (Kasir/Petugas):</w:t></w:r></w:p>"#
    ));
    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:t>{}</w:t></w:r></w:p>"#,
        escape_xml(ttd_petugas)
    ));
    doc_body.push_str(r#"<w:p><w:r><w:br/></w:r></w:p>"#);
    let ttd_pj = if penanggung_jawab.is_empty() { "_______________" } else { &penanggung_jawab };
    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:t>Mengetahui (Supervisor/Manager):</w:t></w:r></w:p>"#
    ));
    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:t>{}</w:t></w:r></w:p>"#,
        escape_xml(ttd_pj)
    ));

    doc_body.push_str(r#"</w:body></w:document>"#);

    fn escape_xml(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    // Build OOXML ZIP
    let file = std::fs::File::create(&save_path)
        .map_err(|e| format!("Gagal membuat file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // [Content_Types].xml
    let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#;
    zip.start_file("[Content_Types].xml", opts.clone())
        .map_err(|e| format!("Gagal buat [Content_Types].xml: {}", e))?;
    zip.write_all(content_types.as_bytes())
        .map_err(|e| format!("Gagal tulis [Content_Types].xml: {}", e))?;

    // _rels/.rels
    let rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#;
    zip.start_file("_rels/.rels", opts.clone())
        .map_err(|e| format!("Gagal buat _rels/.rels: {}", e))?;
    zip.write_all(rels.as_bytes())
        .map_err(|e| format!("Gagal tulis _rels/.rels: {}", e))?;

    // word/_rels/document.xml.rels
    let doc_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>"#;
    zip.start_file("word/_rels/document.xml.rels", opts.clone())
        .map_err(|e| format!("Gagal buat word/_rels/document.xml.rels: {}", e))?;
    zip.write_all(doc_rels.as_bytes())
        .map_err(|e| format!("Gagal tulis word/_rels/document.xml.rels: {}", e))?;

    // word/styles.xml (minimal)
    let styles = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>"#;
    zip.start_file("word/styles.xml", opts.clone())
        .map_err(|e| format!("Gagal buat word/styles.xml: {}", e))?;
    zip.write_all(styles.as_bytes())
        .map_err(|e| format!("Gagal tulis word/styles.xml: {}", e))?;

    // word/document.xml
    zip.start_file("word/document.xml", opts)
        .map_err(|e| format!("Gagal buat word/document.xml: {}", e))?;
    zip.write_all(doc_body.as_bytes())
        .map_err(|e| format!("Gagal tulis word/document.xml: {}", e))?;

    zip.finish().map_err(|e| format!("Gagal finalize DOCX: {}", e))?;

    Ok(())
}
```

- [ ] **Step 3: Register the new command in lib.rs**

Add:
```rust
commands::stock_opname_cmd::export_stock_opname_docx,
```

- [ ] **Step 4: Verify compile**

Run: `cargo build`
Expected: `zip` crate downloads and compiles; project compiles without errors.
---

### Task 4: Frontend — rewrite StockOpname.jsx with two tabs

**Files:**
- Modify: `src/components/PageKit.jsx` (add index param to DataTable render)
- Modify: `src/pages/StockOpname.jsx` (full rewrite)

**Interfaces:**
- Consumes: `create_stock_opname`, `list_stock_opname`, `get_stock_opname`, `export_stock_opname_docx`, `get_toko`, `list_produk`, `invoke`, `save` dialog
- Produces: rendered two-tab page

- [ ] **Step 1: Update DataTable render signature**

In `src/components/PageKit.jsx`, change the cell renderer call from:
```jsx
{column.render ? column.render(row) : row[column.key] ?? "-"}
```
to:
```jsx
{column.render ? column.render(row, index) : row[column.key] ?? "-"}
```

- [ ] **Step 2: Write the new StockOpname.jsx**

```jsx
// ============================================================
// StockOpname.jsx — Opname Baru + Riwayat (PageKit).
// Tab 1: Form header + tabel input stok fisik inline.
// Tab 2: Riwayat dokumen + detail + export DOCX.
// ============================================================
import { useEffect, useState, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge,
  useSearchFilter, rupiah,
} from "../components/PageKit";

export default function StockOpname() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("baru"); // "baru" | "riwayat"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ── Tab Baru ── */
  const [form, setForm] = useState({ namaToko: "", tanggal: "", petugas: "", penanggungJawab: "", catatan: "" });
  const [produkList, setProdukList] = useState([]);
  // fisikMap[produkId] = { fisik: number|null, keterangan: string }
  const [fisikMap, setFisikMap] = useState({});

  const loadAwal = useCallback(async () => {
    try {
      setLoading(true);
      const [toko, produk] = await Promise.all([
        invoke("get_toko"),
        invoke("list_produk", { onlyActive: true }),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      setForm({
        namaToko: toko?.nama_toko || "",
        tanggal: today,
        petugas: "",
        penanggungJawab: "",
        catatan: "",
      });
      setProdukList(produk);
    } catch (e) { addToast(`Gagal muat data: ${e}`, "error"); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void loadAwal(); }, [loadAwal]);

  const updateFisik = (produkId, fisik) => {
    setFisikMap((prev) => {
      const curr = prev[produkId] || { fisik: null, keterangan: "" };
      return { ...prev, [produkId]: { ...curr, fisik } };
    });
  };
  const updateKeterangan = (produkId, keterangan) => {
    setFisikMap((prev) => {
      const curr = prev[produkId] || { fisik: null, keterangan: "" };
      return { ...prev, [produkId]: { ...curr, keterangan } };
    });
  };

  const allSelisihList = produkList
    .filter((p) => fisikMap[p.id]?.fisik !== null && fisikMap[p.id]?.fisik !== undefined && fisikMap[p.id]?.fisik !== "")
    .map((p) => {
      const fisik = parseInt(fisikMap[p.id].fisik, 10);
      return { id: p.id, nama: p.nama, sku: p.sku, satuan: p.satuan, stok: p.stok, fisik, selisih: Number.isFinite(fisik) ? fisik - p.stok : 0 };
    });
  const selisihMasuk = allSelisihList.filter((x) => x.selisih > 0).reduce((s, x) => s + x.selisih, 0);
  const selisihKeluar = allSelisihList.filter((x) => x.selisih < 0).reduce((s, x) => s + Math.abs(x.selisih), 0);
  const berubah = allSelisihList.filter((x) => x.selisih !== 0).length;
  const totalInput = allSelisihList.length;

  const simpanOpname = async () => {
    if (!form.namaToko.trim()) return addToast("Nama toko wajib diisi", "error");
    if (!form.tanggal.trim()) return addToast("Tanggal wajib diisi", "error");
    if (!form.petugas.trim()) return addToast("Petugas wajib diisi", "error");
    if (totalInput === 0) return addToast("Input stok fisik minimal satu produk", "info");

    setSaving(true);
    try {
      const items = allSelisihList.map((x) => ({
        produkId: x.id,
        kodeBarang: x.sku || "",
        namaBarang: x.nama,
        satuan: x.satuan || "",
        stokSistem: x.stok,
        stokFisik: x.fisik,
        keterangan: fisikMap[x.id]?.keterangan || "",
      }));

      await invoke("create_stock_opname", {
        input: {
          namaToko: form.namaToko,
          tanggal: form.tanggal,
          petugas: form.petugas,
          penanggungJawab: form.penanggungJawab,
          catatan: form.catatan,
          items,
        },
      });

      addToast("Opname berhasil disimpan", "success");
      setFisikMap({});
      const refreshed = await invoke("list_produk", { onlyActive: true });
      setProdukList(refreshed);
    } catch (e) { addToast(`Gagal simpan: ${e}`, "error"); }
    finally { setSaving(false); }
  };

  const { query, setQuery, filtered } = useSearchFilter(
    produkList,
    (p) => `${p.nama || ""} ${p.sku || ""}`
  );

  const columnsBaru = [
    { key: "no", label: "No", width: 40, align: "center",
      render: (_, idx) => idx + 1,
    },
    { key: "kode", label: "Kode Barang", render: (p) => <span className="text-label-md">{p.sku || "—"}</span> },
    { key: "nama", label: "Nama Barang", render: (p) => <b>{p.nama}</b> },
    { key: "satuan", label: "Satuan", render: (p) => p.satuan || "—", align: "center" },
    { key: "sistem", label: "Stok Sistem", align: "center", render: (p) => p.stok },
    { key: "fisik", label: "Stok Fisik", align: "center",
      render: (p) => {
        const val = fisikMap[p.id]?.fisik !== undefined ? fisikMap[p.id].fisik : "";
        return (
          <input
            className="input-field"
            style={{ width: 72, textAlign: "center" }}
            type="number"
            inputMode="numeric"
            value={val}
            onChange={(e) => updateFisik(p.id, e.target.value.replace(/\D/g, ""))}
            placeholder="0"
          />
        );
      },
    },
    { key: "selisih", label: "Selisih", align: "center",
      render: (p) => {
        const val = fisikMap[p.id]?.fisik;
        if (val === undefined || val === null || val === "") return "—";
        const fisik = parseInt(val, 10);
        if (!Number.isFinite(fisik)) return "—";
        const selisih = fisik - p.stok;
        if (selisih === 0) return <StatusBadge label="0" tone="neutral" />;
        return <StatusBadge label={`${selisih > 0 ? "+" : ""}${selisih}`} tone={selisih > 0 ? "success" : "danger"} />;
      },
    },
    { key: "keterangan", label: "Keterangan",
      render: (p) => (
        <input
          className="input-field"
          style={{ width: 140 }}
          value={fisikMap[p.id]?.keterangan || ""}
          onChange={(e) => updateKeterangan(p.id, e.target.value)}
          placeholder="Rusak/hilang..."
        />
      ),
    },
  ];

  /* ── Tab Riwayat ── */
  const [riwayat, setRiwayat] = useState([]);
  const [detailModal, setDetailModal] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  const loadRiwayat = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke("list_stock_opname");
      setRiwayat(data);
    } catch (e) { addToast(`Gagal muat riwayat: ${e}`, "error"); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { if (tab === "riwayat") void loadRiwayat(); }, [tab, loadRiwayat]);

  const openDetail = async (id) => {
    try {
      const full = await invoke("get_stock_opname", { id });
      setDetailModal(full.header);
      setDetailItems(full.items);
    } catch (e) { addToast(`Gagal muat detail: ${e}`, "error"); }
  };

  const exportDocx = async (id, kode) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: `${kode}.docx`,
        filters: [{ name: "Word Document", extensions: ["docx"] }],
      });
      if (!path) return;
      await invoke("export_stock_opname_docx", { opnameId: id, savePath: path });
      addToast("DOCX berhasil disimpan", "success");
    } catch (e) { addToast(`Gagal export: ${e}`, "error"); }
  };

  const columnsRiwayat = [
    { key: "kode", label: "Kode", render: (r) => <b>{r.kode}</b> },
    { key: "tanggal", label: "Tanggal" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "petugas", label: "Petugas" },
    { key: "jumlah", label: "Item", align: "center", render: (r) => r.jumlah_item },
    { key: "kurang", label: "Selisih (-)", align: "center",
      render: (r) => r.total_selisih_kurang !== 0 ? <StatusBadge label={String(r.total_selisih_kurang)} tone="danger" /> : "—",
    },
    { key: "lebih", label: "Selisih (+)", align: "center",
      render: (r) => r.total_selisih_lebih !== 0 ? <StatusBadge label={`+${r.total_selisih_lebih}`} tone="success" /> : "—",
    },
    { key: "aksi", label: "Aksi",
      render: (r) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn-secondary" onClick={() => openDetail(r.id)}>
            Detail
          </button>
          <button type="button" className="btn-primary" onClick={() => exportDocx(r.id, r.kode)}>
            Export DOCX
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="STOK"
      title="Stock Opname"
      description="Buat opname stok fisik baru atau lihat riwayat opname yang sudah tersimpan."
    >
      {/* Tab switcher */}
      <div className="tab-bar" style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid var(--color-border)" }}>
        {["baru", "riwayat"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "10px 16px", cursor: "pointer",
              background: tab === t ? "var(--color-bg-active)" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
              fontWeight: tab === t ? 600 : 400, marginBottom: -2,
              color: tab === t ? "var(--color-primary)" : "var(--color-text-secondary)",
            }}
          >
            {t === "baru" ? "Opname Baru" : "Riwayat"}
          </button>
        ))}
      </div>

      {tab === "baru" && (
        <>
          {/* Form header */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <label className="input-label" style={{ flex: "1 1 200px" }}>
              Nama Toko / Cabang
              <input className="input-field" value={form.namaToko} onChange={(e) => setForm((f) => ({ ...f, namaToko: e.target.value }))} />
            </label>
            <label className="input-label" style={{ flex: "1 1 150px" }}>
              Hari / Tanggal
              <input className="input-field" type="date" value={form.tanggal} onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))} />
            </label>
            <label className="input-label" style={{ flex: "1 1 180px" }}>
              Nama Petugas / Kasir
              <input className="input-field" value={form.petugas} onChange={(e) => setForm((f) => ({ ...f, petugas: e.target.value }))} placeholder="Nama pemeriksa" />
            </label>
            <label className="input-label" style={{ flex: "1 1 180px" }}>
              Penanggung Jawab
              <input className="input-field" value={form.penanggungJawab} onChange={(e) => setForm((f) => ({ ...f, penanggungJawab: e.target.value }))} placeholder="Nama kepala toko" />
            </label>
            <label className="input-label" style={{ flex: "1 1 100%" }}>
              Catatan
              <input className="input-field" value={form.catatan} onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))} placeholder="Opsional" />
            </label>
          </div>

          <InfoNote>
            Input stok fisik per produk. Selisih dihitung otomatis (Fisik − Sistem). Hanya baris dengan selisih ≠ 0 yang menyesuaikan stok.
          </InfoNote>

          <DataPanel
            searchValue={query}
            onSearch={setQuery}
            searchPlaceholder="Cari kode/nama barang..."
            loading={loading}
            isEmpty={!loading && filtered.length === 0}
            emptyIcon="inventory"
            emptyTitle="Tidak ada produk"
            emptyHint="Aktifkan produk terlebih dulu."
          >
            <DataTable columns={columnsBaru} rows={filtered} rowKey={(p) => p.id} />
          </DataPanel>

          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" onClick={simpanOpname} disabled={saving || totalInput === 0}>
              {saving ? "Menyimpan..." : `Simpan Opname (${totalInput} item)`}
            </button>
            <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
              {berubah > 0 ? `${berubah} item berubah · +${selisihMasuk} / -${selisihKeluar}` : "Belum ada perubahan"}
            </span>
          </div>
        </>
      )}

      {tab === "riwayat" && (
        <DataPanel
          onRefresh={loadRiwayat}
          loading={loading}
          isEmpty={!loading && riwayat.length === 0}
          emptyIcon="history"
          emptyTitle="Belum ada opname"
          emptyHint="Buat opname baru di tab Opname Baru."
        >
          <DataTable columns={columnsRiwayat} rows={riwayat} rowKey={(r) => r.id} />
        </DataPanel>
      )}

      {/* Detail modal */}
      {detailModal && (
        <FormModal
          title={`Detail Opname: ${detailModal.kode}`}
          description={`${detailModal.nama_toko} · ${detailModal.tanggal} · ${detailModal.petugas}`}
          onClose={() => { setDetailModal(null); setDetailItems([]); }}
          submitLabel="Tutup"
          onSubmit={() => { setDetailModal(null); setDetailItems([]); }}
        >
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Kode</th>
                  <th>Nama</th>
                  <th>Sat</th>
                  <th>Sistem</th>
                  <th>Fisik</th>
                  <th>Selisih</th>
                  <th>Ket</th>
                </tr>
              </thead>
              <tbody>
                {detailItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td>{item.kode_barang}</td>
                    <td><b>{item.nama_barang}</b></td>
                    <td className="text-label-md">{item.satuan}</td>
                    <td style={{ textAlign: "center" }}>{item.stok_sistem}</td>
                    <td style={{ textAlign: "center" }}>{item.stok_fisik}</td>
                    <td style={{ textAlign: "center" }}>
                      {item.selisih !== 0 ? (
                        <StatusBadge label={String(item.selisih)} tone={item.selisih > 0 ? "success" : "danger"} />
                      ) : "0"}
                    </td>
                    <td className="text-label-md">{item.keterangan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailModal.catatan && (
              <p className="text-label-md" style={{ marginTop: 8, color: "var(--color-text-secondary)" }}>
                Catatan: {detailModal.catatan}
              </p>
            )}
          </div>
        </FormModal>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`, `cargo build`
Expected: frontend and backend compile without errors.


