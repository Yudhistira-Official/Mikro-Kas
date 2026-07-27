use crate::db::DbState;
use chrono::{Datelike, Local};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
            return Err(format!(
                "Stok fisik untuk produk ID {} tidak boleh negatif",
                item.produk_id
            ));
        }
    }

    {
        let mut seen = HashSet::new();
        for item in &input.items {
            if !seen.insert(item.produk_id) {
                return Err(format!(
                    "Produk ID {} duplikat dalam satu dokumen",
                    item.produk_id
                ));
            }
        }
    }

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (prefix, digit_run, current, _reset_period, _last_reset_year, _last_reset_month):
        (String, i64, i64, String, i64, i64) = tx
        .query_row(
            "SELECT prefix, digit_run, current_number, reset_period, last_reset_year, last_reset_month FROM nomor_settings WHERE tipe = 'opname'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .map_err(|_| "Setting nomor opname tidak ditemukan".to_string())?;

    let now = Local::now();
    let year = now.year();
    let month = now.month() as i64;
    let next = current + 1;
    let kode = format!(
        "{}{}{:0width$}",
        prefix,
        now.format("%Y%m%d"),
        next,
        width = digit_run as usize
    );

    tx.execute(
        "UPDATE nomor_settings SET current_number = ?1, last_reset_year = ?2, last_reset_month = ?3 WHERE tipe = 'opname'",
        params![next, year, month],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO stock_opname (kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            kode,
            nama_toko,
            tanggal,
            petugas,
            input.penanggung_jawab,
            input.catatan
        ],
    )
    .map_err(|e| e.to_string())?;
    let opname_id = tx.last_insert_rowid();

    for item in &input.items {
        let (verified_stok, verified_nama, verified_sku, verified_satuan): (
            i64,
            String,
            String,
            String,
        ) = tx
            .query_row(
                "SELECT stok, nama, COALESCE(sku,''), satuan FROM produk WHERE id = ?1",
                params![item.produk_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|_| format!("Produk ID {} tidak ditemukan", item.produk_id))?;

        let selisih = item.stok_fisik - verified_stok;
        tx.execute(
            "INSERT INTO stock_opname_item (opname_id, produk_id, kode_barang, nama_barang, satuan, stok_sistem, stok_fisik, selisih, keterangan)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![opname_id, item.produk_id, verified_sku, verified_nama, verified_satuan, verified_stok, item.stok_fisik, selisih, item.keterangan],
        )
        .map_err(|e| e.to_string())?;

        if selisih != 0 {
            let alasan = format!("Stok opname {}: {}", kode, verified_nama);
            let stok_baru = item.stok_fisik;
            tx.execute(
                "UPDATE produk SET stok = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![stok_baru, item.produk_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO stock_adjustment (produk_id, selisih, stok_sebelum, stok_sesudah, alasan)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![item.produk_id, selisih, verified_stok, stok_baru, alasan],
            )
            .map_err(|e| e.to_string())?;
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
    let mut stmt = conn
        .prepare(
            "SELECT o.id, o.kode, o.nama_toko, o.tanggal, o.petugas, o.penanggung_jawab,
                    o.catatan, o.created_at,
                    COUNT(i.id) as jumlah_item,
                    COALESCE(SUM(CASE WHEN i.selisih < 0 THEN i.selisih ELSE 0 END), 0) as total_kurang,
                    COALESCE(SUM(CASE WHEN i.selisih > 0 THEN i.selisih ELSE 0 END), 0) as total_lebih
             FROM stock_opname o
             LEFT JOIN stock_opname_item i ON i.opname_id = o.id
             GROUP BY o.id
             ORDER BY o.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Detail opname: header + seluruh item
#[tauri::command]
pub fn get_stock_opname(state: State<DbState>, id: i64) -> Result<StockOpnameFull, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let header = conn
        .query_row(
            "SELECT id, kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan, created_at
             FROM stock_opname WHERE id = ?1",
            params![id],
            |row| {
                Ok(StockOpnameHeader {
                    id: row.get(0)?,
                    kode: row.get(1)?,
                    nama_toko: row.get(2)?,
                    tanggal: row.get(3)?,
                    petugas: row.get(4)?,
                    penanggung_jawab: row.get(5)?,
                    catatan: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
        .map_err(|_| format!("Opname ID {} tidak ditemukan", id))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, opname_id, produk_id, kode_barang, nama_barang, satuan,
                    stok_sistem, stok_fisik, selisih, keterangan
             FROM stock_opname_item WHERE opname_id = ?1
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(params![id], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    let items: Vec<StockOpnameItem> = items
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(StockOpnameFull { header, items })
}

/// Export opname ke file DOCX.
/// DOCX = OOXML ZIP berisi document.xml dengan tabel dan header.
#[tauri::command]
pub fn export_stock_opname_docx(
    state: State<DbState>,
    opname_id: i64,
    save_path: String,
) -> Result<(), String> {
    use std::io::Write;

    // Validasi save_path: harus .docx, tidak boleh path traversal
    let p = std::path::Path::new(&save_path);
    let file_name = p
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Nama file tidak valid".to_string())?;
    match p.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("docx") => {}
        _ => return Err("Nama file harus berakhiran .docx".into()),
    }
    if file_name.starts_with('.')
        || file_name.contains("..")
        || file_name.contains(['/', '\\'])
        || file_name.chars().any(char::is_control)
        || p.components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Nama atau path file tidak valid".into());
    }

    // Ambil data
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let header = conn
        .query_row(
            "SELECT kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan
         FROM stock_opname WHERE id = ?1",
            params![opname_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(|_| format!("Opname ID {} tidak ditemukan", opname_id))?;
    let (kode, nama_toko, tanggal, petugas, penanggung_jawab, catatan) = header;

    type ItemRow = (String, String, String, i64, i64, i64, String);
    let items: Vec<ItemRow> = {
        let mut stmt = conn.prepare(
            "SELECT kode_barang, nama_barang, satuan, stok_sistem, stok_fisik, selisih, keterangan
             FROM stock_opname_item WHERE opname_id = ?1 ORDER BY id ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![opname_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    drop(conn);

    // Hitung ringkasan
    let jumlah_item = items.len();
    let total_kurang: i64 = items.iter().filter(|i| i.5 < 0).map(|i| i.5.abs()).sum();
    let total_lebih: i64 = items.iter().filter(|i| i.5 > 0).map(|i| i.5).sum();

    fn escape_xml(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    // Build document.xml
    let mut doc_body = String::new();
    doc_body.push_str(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>"#);

    // Title
    doc_body.push_str(&format!(
        r#"<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="32"/></w:rPr><w:t>FORM STOK OPNAME</w:t></w:r></w:p>"#
    ));
    doc_body.push_str(r#"<w:p><w:r><w:br/></w:r></w:p>"#);

    // Header info
    let info_lines = vec![
        format!("Kode      : {}", kode),
        format!("Nama Toko : {}", nama_toko),
        format!("Tanggal   : {}", tanggal),
        format!("Petugas   : {}", petugas),
        format!("Penanggung Jawab: {}", penanggung_jawab),
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
    let headers = [
        "No",
        "Kode Barang",
        "Nama Barang",
        "Satuan",
        "Stok Sistem",
        "Stok Fisik",
        "Selisih",
        "Keterangan",
    ];
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
        let selisih_str = if item.5 > 0 {
            format!("+{}", item.5)
        } else {
            item.5.to_string()
        };
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

    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:t>Dibuat oleh (Kasir/Petugas): {}</w:t></w:r></w:p>"#,
        escape_xml(&petugas)
    ));
    doc_body
        .push_str(r#"<w:p><w:r><w:t>Tanda Tangan: _________________________</w:t></w:r></w:p>"#);
    doc_body.push_str(r#"<w:p><w:r><w:br/></w:r></w:p>"#);
    doc_body.push_str(&format!(
        r#"<w:p><w:r><w:t>Mengetahui (Supervisor/Manager): {}</w:t></w:r></w:p>"#,
        escape_xml(&penanggung_jawab)
    ));
    doc_body
        .push_str(r#"<w:p><w:r><w:t>Tanda Tangan: _________________________</w:t></w:r></w:p>"#);

    doc_body.push_str(r#"</w:body></w:document>"#);

    // Tulis atomik: ZIP selesai di file sementara sebelum mengganti file tujuan.
    let temp_path = format!("{}.tmp", save_path);
    let file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("Gagal membuat file sementara: {}", e))?;
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

    zip.finish()
        .map_err(|e| format!("Gagal finalize DOCX: {}", e))?;

    std::fs::rename(&temp_path, &save_path)
        .map_err(|e| format!("Gagal menyimpan file final: {}", e))?;

    Ok(())
}
