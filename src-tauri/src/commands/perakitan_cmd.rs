//! Perakitan & BOM (Bill of Materials) skeleton.
//!
//! Phase 4 mencatat header perakitan + BOM tanpa mutasi stok otomatis.
//! Mutasi stok aman ditambahkan setelah flow UI final.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Header BOM (resep produk).
#[derive(Debug, Serialize)]
pub struct Bom {
    pub id: i64,
    pub produk_id: i64,
    pub produk_nama: String,
    pub produk_sku: Option<String>,
    pub kode_bom: Option<String>,
    pub yield_qty: i64,
    pub gudang_id: Option<i64>,
    pub gudang_nama: Option<String>,
    pub keterangan: Option<String>,
    pub catatan: Option<String>,
    pub is_active: i64,
    pub total_hpp: i64,
    pub items: Vec<BomItem>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct BomItem {
    pub id: i64,
    pub komponen_id: i64,
    pub kode_bahan: Option<String>,
    pub nama_bahan: String,
    pub qty_per_unit: f64,
    pub satuan: Option<String>,
    pub estimasi_hpp: i64,
}

/// Header perakitan produksi.
#[derive(Debug, Serialize)]
pub struct Perakitan {
    pub id: i64,
    pub nomor: String,
    pub tanggal: String,
    pub bom_id: i64,
    pub produk_id: i64,
    pub qty_produksi: i64,
    pub total_biaya_bahan: i64,
    pub total_biaya_tambahan: i64,
    pub total_hpp: i64,
    pub gudang_id: Option<i64>,
    pub catatan: Option<String>,
    pub created_at: String,
}

/// Input BOM minimal.
#[derive(Debug, Deserialize)]
pub struct BomInput {
    pub produk_id: i64,
    pub kode_bom: Option<String>,
    pub yield_qty: Option<i64>,
    pub gudang_id: Option<i64>,
    pub keterangan: Option<String>,
    pub catatan: Option<String>,
    pub items: Option<Vec<BomItemInput>>,
}

#[derive(Debug, Deserialize)]
pub struct BomItemInput {
    pub komponen_id: i64,
    pub qty_per_unit: f64,
    pub satuan: Option<String>,
}

/// Input perakitan minimal.
#[derive(Debug, Deserialize)]
pub struct PerakitanInput {
    pub nomor: String,
    pub tanggal: String,
    pub bom_id: i64,
    pub produk_id: i64,
    pub qty_produksi: i64,
    pub total_biaya_bahan: Option<i64>,
    pub total_biaya_tambahan: Option<i64>,
    pub gudang_id: Option<i64>,
    pub catatan: Option<String>,
}

/// Buat BOM baru.
///
/// Returns: id bom baru
#[tauri::command]
pub fn create_bom(state: State<DbState>, input: BomInput) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO bom (produk_id, kode_bom, yield_qty, gudang_id, keterangan, catatan) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![input.produk_id, input.kode_bom, input.yield_qty.unwrap_or(1).max(1), input.gudang_id, input.keterangan, input.catatan],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    // Insert items if provided
    if let Some(items) = &input.items {
        for item in items {
            conn.execute(
                "INSERT OR IGNORE INTO bom_item (bom_id, komponen_id, qty_per_unit, satuan) VALUES (?1, ?2, ?3, ?4)",
                params![id, item.komponen_id, item.qty_per_unit, item.satuan],
            ).ok();
        }
    }
    Ok(id)
}

/// Ambil daftar BOM aktif beserta item komponen.
#[tauri::command]
pub fn list_bom(state: State<DbState>) -> Result<Vec<Bom>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT b.id, b.produk_id, p.nama, p.sku, b.kode_bom, b.yield_qty, b.gudang_id, g.nama, b.keterangan, b.catatan, b.is_active, b.created_at, COALESCE((SELECT SUM(ROUND(bi.qty_per_unit * pr.harga_beli)) FROM bom_item bi JOIN produk pr ON pr.id = bi.komponen_id WHERE bi.bom_id = b.id), 0) FROM bom b JOIN produk p ON p.id = b.produk_id LEFT JOIN gudang g ON g.id = b.gudang_id WHERE b.is_active = 1 ORDER BY b.id DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Bom {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                produk_nama: row.get(2)?,
                produk_sku: row.get(3)?,
                kode_bom: row.get(4)?,
                yield_qty: row.get(5)?,
                gudang_id: row.get(6)?,
                gudang_nama: row.get(7)?,
                keterangan: row.get(8)?,
                catatan: row.get(9)?,
                is_active: row.get(10)?,
                total_hpp: row.get(11)?,
                items: Vec::new(),
                created_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Proses perakitan: insert header perakitan saja, no stock mutation yet.
///
/// Returns: id perakitan baru
///
/// Side effects:
/// - Insert row perakitan
/// - ponytail: stok komponen & produk jadi belum dimutasi, tambah setelah UI final
#[tauri::command]
pub fn proses_perakitan(state: State<DbState>, input: PerakitanInput) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let total_biaya_bahan = input.total_biaya_bahan.unwrap_or(0);
    let total_biaya_tambahan = input.total_biaya_tambahan.unwrap_or(0);
    let total_hpp = total_biaya_bahan + total_biaya_tambahan;

    conn.execute(
        "INSERT INTO perakitan (nomor, tanggal, bom_id, produk_id, qty_produksi, total_biaya_bahan, total_biaya_tambahan, total_hpp, gudang_id, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            input.nomor,
            input.tanggal,
            input.bom_id,
            input.produk_id,
            input.qty_produksi,
            total_biaya_bahan,
            total_biaya_tambahan,
            total_hpp,
            input.gudang_id,
            input.catatan
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}
