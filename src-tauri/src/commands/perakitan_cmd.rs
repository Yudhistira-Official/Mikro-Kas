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
    pub kode_bom: Option<String>,
    pub keterangan: Option<String>,
    pub is_active: i64,
    pub created_at: String,
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
    pub keterangan: Option<String>,
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
        "INSERT INTO bom (produk_id, kode_bom, keterangan) VALUES (?1, ?2, ?3)",
        params![input.produk_id, input.kode_bom, input.keterangan],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Ambil daftar BOM aktif.
///
/// Returns: Vec<Bom>
#[tauri::command]
pub fn list_bom(state: State<DbState>) -> Result<Vec<Bom>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, produk_id, kode_bom, keterangan, is_active, created_at
             FROM bom WHERE is_active = 1 ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Bom {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                kode_bom: row.get(2)?,
                keterangan: row.get(3)?,
                is_active: row.get(4)?,
                created_at: row.get(5)?,
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
