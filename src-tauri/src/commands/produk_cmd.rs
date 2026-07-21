//! Commands Produk — CRUD produk + stok.
//! Gap KasGo Phase 1 menambah stock adjustment dengan audit trail.
use crate::db::DbState;
use crate::models::produk::{Produk, ProdukInput};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

const PRODUK_SELECT: &str =
    "SELECT p.id, p.kategori_id, k.nama, p.supplier_id, s.nama, p.nama, p.sku, p.satuan,
                p.harga_beli, p.harga_jual, p.stok, p.stok_minimum,
                p.foto_path, COALESCE(p.harga_diskon,0), p.diskon_berlaku_sampai,
                p.is_active, p.satuan_multi, p.created_at, p.updated_at
         FROM produk p
         LEFT JOIN kategori k ON k.id = p.kategori_id
         LEFT JOIN supplier s ON s.id = p.supplier_id";

fn map_produk(row: &rusqlite::Row<'_>) -> rusqlite::Result<Produk> {
    Ok(Produk {
        id: row.get(0)?,
        kategori_id: row.get(1)?,
        kategori_nama: row.get(2)?,
        supplier_id: row.get(3)?,
        supplier_nama: row.get(4)?,
        nama: row.get(5)?,
        sku: row.get(6)?,
        satuan: row.get(7)?,
        harga_beli: row.get(8)?,
        harga_jual: row.get(9)?,
        stok: row.get(10)?,
        stok_minimum: row.get(11)?,
        foto_path: row.get(12)?,
        harga_diskon: row.get(13)?,
        diskon_berlaku_sampai: row.get(14)?,
        is_active: row.get::<_, i64>(15)? != 0,
        satuan_multi: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

#[tauri::command]
pub fn list_produk(
    state: State<DbState>,
    search: Option<String>,
    kategori_id: Option<i64>,
    only_active: Option<bool>,
) -> Result<Vec<Produk>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(PRODUK_SELECT);
    sql.push_str(" WHERE 1=1");
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 0;

    if only_active.unwrap_or(true) {
        param_idx += 1;
        sql.push_str(&format!(" AND p.is_active = ?{}", param_idx));
        param_values.push(Box::new(1i64));
    }
    if let Some(ref s) = search {
        param_idx += 1;
        sql.push_str(&format!(" AND p.nama LIKE ?{}", param_idx));
        param_values.push(Box::new(format!("%{}%", s)));
    }
    if let Some(kid) = kategori_id {
        param_idx += 1;
        sql.push_str(&format!(" AND p.kategori_id = ?{}", param_idx));
        param_values.push(Box::new(kid));
    }

    sql.push_str(" ORDER BY p.nama ASC");

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), map_produk)
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_produk(state: State<DbState>, id: i64) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{} WHERE p.id = ?1", PRODUK_SELECT),
        params![id],
        map_produk,
    )
    .map_err(|e| format!("Produk tidak ditemukan: {}", e))
}

#[tauri::command]
pub fn create_produk(state: State<DbState>, input: ProdukInput) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO produk (kategori_id, supplier_id, nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum, foto_path, satuan_multi, harga_diskon, diskon_berlaku_sampai)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            input.kategori_id,
            input.supplier_id,
            input.nama,
            input.sku,
            input.satuan.unwrap_or_else(|| "pcs".to_string()),
            input.harga_beli.unwrap_or(0),
            input.harga_jual,
            input.stok.unwrap_or(0),
            input.stok_minimum.unwrap_or(0),
            input.foto_path,
            input.satuan_multi,
            input.harga_diskon.unwrap_or(0).max(0),
            input.diskon_berlaku_sampai,
        ],
    )
    .map_err(|e| format!("Gagal simpan produk: {}", e))?;
    let id = conn.last_insert_rowid();
    let produk = conn
        .query_row(
            &format!("{} WHERE p.id = ?1", PRODUK_SELECT),
            params![id],
            map_produk,
        )
        .map_err(|e| format!("Gagal mengambil produk baru: {}", e))?;
    Ok(produk)
}

#[tauri::command]
pub fn update_produk(state: State<DbState>, id: i64, input: ProdukInput) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE produk SET kategori_id=?1, supplier_id=?2, nama=?3, sku=?4, satuan=?5,
         harga_beli=?6, harga_jual=?7, stok=?8, stok_minimum=?9, foto_path=?10,
         satuan_multi=?11, harga_diskon=?12, diskon_berlaku_sampai=?13, updated_at=datetime('now')
         WHERE id=?14",
        params![
            input.kategori_id,
            input.supplier_id,
            input.nama,
            input.sku,
            input.satuan.unwrap_or_else(|| "pcs".to_string()),
            input.harga_beli.unwrap_or(0),
            input.harga_jual,
            input.stok.unwrap_or(0),
            input.stok_minimum.unwrap_or(0),
            input.foto_path,
            input.satuan_multi,
            input.harga_diskon.unwrap_or(0).max(0),
            input.diskon_berlaku_sampai,
            id,
        ],
    )
    .map_err(|e| format!("Gagal update produk: {}", e))?;
    let produk = conn
        .query_row(
            &format!("{} WHERE p.id = ?1", PRODUK_SELECT),
            params![id],
            map_produk,
        )
        .map_err(|e| format!("Gagal mengambil produk: {}", e))?;
    Ok(produk)
}

#[tauri::command]
pub fn delete_produk(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // Soft delete — set is_active=0 biar histori transaksi tetap valid
    conn.execute(
        "UPDATE produk SET is_active = 0, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Gagal hapus produk: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_produk_low_stock(state: State<DbState>) -> Result<Vec<Produk>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "{} WHERE p.is_active = 1 AND p.stok < p.stok_minimum ORDER BY p.stok ASC",
            PRODUK_SELECT
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_produk).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ============================================================
// Gap KasGo Phase 1: Stock Adjustment + Audit Trail
// ============================================================

/// Satu baris audit trail penyesuaian stok manual.
#[derive(Debug, Serialize)]
pub struct StockAdjustment {
    pub id: i64,
    pub produk_id: i64,
    pub produk_nama: String,
    pub selisih: i64,
    pub stok_sebelum: i64,
    pub stok_sesudah: i64,
    pub alasan: String,
    pub created_at: String,
}

/// Input penyesuaian stok: produk target, stok baru hasil opname, dan alasan wajib.
/// Backend menghitung selisih dan mencatat audit trail dalam satu transaksi.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAdjustmentInput {
    pub produk_id: i64,
    pub stok_baru: i64,
    pub alasan: String,
}

/// Penyesuaian stok manual (opname/koreksi/rusak/hilang).
/// Mengupdate produk.stok dan mencatat baris audit trail dalam satu transaksi agar
/// selalu dapat ditelusuri kapan dan kenapa stok berubah di luar transaksi penjualan.
#[tauri::command]
pub fn adjust_stock(
    state: State<DbState>,
    input: StockAdjustmentInput,
) -> Result<StockAdjustment, String> {
    if input.alasan.trim().is_empty() {
        return Err("Alasan penyesuaian stok wajib diisi".into());
    }
    if input.stok_baru < 0 {
        return Err("Stok baru tidak boleh negatif".into());
    }
    let alasan = input.alasan.trim().to_string();
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (stok_sebelum, nama): (i64, String) = tx
        .query_row(
            "SELECT stok, nama FROM produk WHERE id = ?1",
            params![input.produk_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Produk ID {} tidak ditemukan", input.produk_id))?;

    let selisih = input.stok_baru - stok_sebelum;
    tx.execute(
        "UPDATE produk SET stok = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![input.stok_baru, input.produk_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO stock_adjustment (produk_id, selisih, stok_sebelum, stok_sesudah, alasan)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![input.produk_id, selisih, stok_sebelum, input.stok_baru, alasan.clone()],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;

    Ok(StockAdjustment {
        id,
        produk_id: input.produk_id,
        produk_nama: nama,
        selisih,
        stok_sebelum,
        stok_sesudah: input.stok_baru,
        alasan,
        created_at: chrono::Utc::now().naive_utc().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// Riwayat audit trail penyesuaian stok, diurutkan terbaru di atas.
#[tauri::command]
pub fn list_stock_adjustments(state: State<DbState>) -> Result<Vec<StockAdjustment>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT sa.id, sa.produk_id, p.nama, sa.selisih, sa.stok_sebelum, sa.stok_sesudah,
                    sa.alasan, sa.created_at
             FROM stock_adjustment sa
             JOIN produk p ON p.id = sa.produk_id
             ORDER BY sa.created_at DESC, sa.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StockAdjustment {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                produk_nama: row.get(2)?,
                selisih: row.get(3)?,
                stok_sebelum: row.get(4)?,
                stok_sesudah: row.get(5)?,
                alasan: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ============================================================
// Gap KasGo Phase 2: Import Produk CSV
// ============================================================

/// Ringkasan hasil import CSV produk.
/// `dibuat` berarti produk baru; `diupdate` berarti SKU yang sama ditimpa datanya.
#[derive(Debug, Serialize)]
pub struct ImportProdukResult {
    pub dibuat: i64,
    pub diupdate: i64,
    pub dilewati: i64,
    pub errors: Vec<String>,
}

/// Parse satu baris CSV kecil tanpa dependency eksternal.
/// Mendukung koma di dalam quote ganda dan escape quote standar (`""`).
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let mut cell = String::new();
    let mut chars = line.chars().peekable();
    let mut quoted = false;
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cell.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                cells.push(cell.trim().to_string());
                cell.clear();
            }
            _ => cell.push(ch),
        }
    }
    cells.push(cell.trim().to_string());
    cells
}

fn rupiah_int(value: Option<&String>) -> i64 {
    value
        .map(|v| v.chars().filter(|c| c.is_ascii_digit()).collect::<String>())
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0)
}

/// Import massal produk dari CSV lokal.
/// Format kolom: nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum.
/// Jika SKU sudah ada, data produk diupdate; jika SKU kosong, baris selalu menjadi produk baru.
#[tauri::command]
pub fn import_produk_csv(state: State<DbState>, csv_text: String) -> Result<ImportProdukResult, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut dibuat = 0;
    let mut diupdate = 0;
    let mut dilewati = 0;
    let mut errors = Vec::new();

    for (idx, raw_line) in csv_text.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim().trim_start_matches('\u{feff}');
        if line.is_empty() {
            continue;
        }
        if line_no == 1 && line.to_lowercase().contains("nama") && line.to_lowercase().contains("harga_jual") {
            continue;
        }
        let cells = parse_csv_line(line);
        let nama = cells.get(0).map(|v| v.trim()).unwrap_or("");
        if nama.is_empty() {
            dilewati += 1;
            errors.push(format!("Baris {line_no}: nama produk kosong"));
            continue;
        }
        let harga_jual = rupiah_int(cells.get(4));
        if harga_jual <= 0 {
            dilewati += 1;
            errors.push(format!("Baris {line_no}: harga_jual wajib > 0"));
            continue;
        }
        let sku = cells.get(1).map(|v| v.trim()).filter(|v| !v.is_empty());
        let satuan = cells.get(2).map(|v| v.trim()).filter(|v| !v.is_empty()).unwrap_or("pcs");
        let harga_beli = rupiah_int(cells.get(3));
        let stok = rupiah_int(cells.get(5));
        let stok_minimum = rupiah_int(cells.get(6));

        let existing_id = match sku {
            Some(code) => tx
                .query_row("SELECT id FROM produk WHERE sku = ?1", params![code], |row| row.get::<_, i64>(0))
                .ok(),
            None => None,
        };
        if let Some(id) = existing_id {
            tx.execute(
                "UPDATE produk SET nama=?1, satuan=?2, harga_beli=?3, harga_jual=?4, stok=?5,
                 stok_minimum=?6, is_active=1, updated_at=datetime('now') WHERE id=?7",
                params![nama, satuan, harga_beli, harga_jual, stok, stok_minimum, id],
            )
            .map_err(|e| format!("Baris {line_no}: gagal update produk: {e}"))?;
            diupdate += 1;
        } else {
            tx.execute(
                "INSERT INTO produk (nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum],
            )
            .map_err(|e| format!("Baris {line_no}: gagal buat produk: {e}"))?;
            dibuat += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(ImportProdukResult { dibuat, diupdate, dilewati, errors })
}

// ============================================================
// Gap KasGo Phase 2: Laporan Inventori & Nilai Stok
// ============================================================

#[derive(Debug, Serialize)]
pub struct RingkasanInventori {
    pub total_sku: i64,
    pub total_stok: i64,
    pub nilai_modal: i64,
    pub nilai_jual: i64,
    pub potensi_margin: i64,
}

#[derive(Debug, Serialize)]
pub struct LaporanInventoriRow {
    pub id: i64,
    pub nama: String,
    pub sku: Option<String>,
    pub satuan: String,
    pub stok: i64,
    pub stok_minimum: i64,
    pub harga_beli: i64,
    pub harga_jual: i64,
    pub nilai_modal: i64,
    pub nilai_jual: i64,
    pub margin: i64,
}

/// Ringkasan nilai stok dan margin potensial untuk seluruh inventori aktif.
#[tauri::command]
pub fn get_ringkasan_inventori(state: State<DbState>) -> Result<RingkasanInventori, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(stok), 0), COALESCE(SUM(harga_beli * stok), 0), COALESCE(SUM(harga_jual * stok), 0)
         FROM produk WHERE is_active = 1",
        [],
        |row| {
            let total_sku: i64 = row.get(0)?;
            let total_stok: i64 = row.get(1)?;
            let nilai_modal: i64 = row.get(2)?;
            let nilai_jual: i64 = row.get(3)?;
            Ok(RingkasanInventori { total_sku, total_stok, nilai_modal, nilai_jual, potensi_margin: nilai_jual - nilai_modal })
        },
    ).map_err(|e| e.to_string())
}

/// Daftar detail inventori beserta nilai modal, nilai jual, dan margin potensial.
#[tauri::command]
pub fn list_laporan_inventori(state: State<DbState>) -> Result<Vec<LaporanInventoriRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, nama, sku, satuan, stok, stok_minimum, harga_beli, harga_jual,
                (harga_beli * stok) AS nilai_modal, (harga_jual * stok) AS nilai_jual,
                ((harga_jual - harga_beli) * stok) AS margin
         FROM produk WHERE is_active = 1
         ORDER BY lower(nama) ASC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(LaporanInventoriRow {
            id: row.get(0)?,
            nama: row.get(1)?,
            sku: row.get(2)?,
            satuan: row.get(3)?,
            stok: row.get(4)?,
            stok_minimum: row.get(5)?,
            harga_beli: row.get(6)?,
            harga_jual: row.get(7)?,
            nilai_modal: row.get(8)?,
            nilai_jual: row.get(9)?,
            margin: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

// ============================================================
// Gap KasGo Phase 2: Foto Produk
// ============================================================

/// Simpan foto produk dari base64 (hasil picker frontend) ke storage app private.
/// Mengembalikan path absolut file gambar yang disimpan, untuk disimpan di produk.foto_path.
/// File disimpan di {app_data_dir}/product_photos/{produk_id}.jpg agar tidak hilang saat restart
/// dan tidak terkena scoped-storage Android.
#[tauri::command]
pub fn save_produk_foto(
    app: tauri::AppHandle,
    state: State<DbState>,
    produk_id: i64,
    foto_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(foto_base64.trim())
        .map_err(|e| format!("Base64 foto tidak valid: {e}"))?;
    if bytes.len() > 2_000_000 {
        return Err("Ukuran foto melebihi 2MB".into());
    }

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal akses app_data_dir: {e}"))?;
    let foto_dir = app_dir.join("product_photos");
    std::fs::create_dir_all(&foto_dir).map_err(|e| format!("Gagal buat dir foto: {e}"))?;
    let file_path = foto_dir.join(format!("{}.jpg", produk_id));
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Gagal simpan foto: {e}"))?;
    let path_str = file_path.to_string_lossy().to_string();

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE produk SET foto_path = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![&path_str, produk_id],
    )
    .map_err(|e| format!("Gagal update foto_path: {e}"))?;

    Ok(path_str)
}

/// Hapus foto produk: hapus file fisik dan set foto_path = NULL di DB.
#[tauri::command]
pub fn delete_produk_foto(state: State<DbState>, produk_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let old: Option<String> = conn
        .query_row(
            "SELECT foto_path FROM produk WHERE id = ?1",
            params![produk_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    if let Some(ref p) = old {
        let _ = std::fs::remove_file(p);
    }
    conn.execute(
        "UPDATE produk SET foto_path = NULL, updated_at = datetime('now') WHERE id = ?1",
        params![produk_id],
    )
    .map_err(|e| format!("Gagal hapus foto: {e}"))?;
    Ok(())
}
