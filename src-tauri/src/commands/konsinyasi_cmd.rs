//! Konsinyasi masuk/keluar skeleton.
//!
//! Phase 4 mencatat header konsinyasi minimal tanpa mutasi stok penuh.
//! Detail settlement dan mutasi stok aman ditambahkan setelah flow UI final.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Header konsinyasi masuk dari supplier.
#[derive(Debug, Serialize)]
pub struct KonsinyasiMasuk {
    pub id: i64,
    pub nomor: String,
    pub tanggal: String,
    pub supplier_id: Option<i64>,
    pub total_item: i64,
    pub status: String,
    pub catatan: Option<String>,
    pub created_at: String,
}

/// Header konsinyasi keluar ke reseller/penerima.
#[derive(Debug, Serialize)]
pub struct KonsinyasiKeluar {
    pub id: i64,
    pub nomor: String,
    pub tanggal: String,
    pub penerima_nama: String,
    pub penerima_telepon: Option<String>,
    pub total_item: i64,
    pub status: String,
    pub catatan: Option<String>,
    pub created_at: String,
}

/// Input konsinyasi masuk minimal.
#[derive(Debug, Deserialize)]
pub struct KonsinyasiMasukInput {
    pub nomor: String,
    pub tanggal: String,
    pub supplier_id: Option<i64>,
    pub total_item: Option<i64>,
    pub catatan: Option<String>,
}

/// Input konsinyasi keluar minimal.
#[derive(Debug, Deserialize)]
pub struct KonsinyasiKeluarInput {
    pub nomor: String,
    pub tanggal: String,
    pub penerima_nama: String,
    pub penerima_telepon: Option<String>,
    pub total_item: Option<i64>,
    pub catatan: Option<String>,
}

/// Buat header konsinyasi masuk.
///
/// Returns: id konsinyasi_masuk baru
#[tauri::command]
pub fn create_konsinyasi_masuk(
    state: State<DbState>,
    input: KonsinyasiMasukInput,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO konsinyasi_masuk (nomor, tanggal, supplier_id, total_item, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.nomor,
            input.tanggal,
            input.supplier_id,
            input.total_item.unwrap_or(0),
            input.catatan
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Ambil daftar konsinyasi masuk terbaru.
///
/// Returns: Vec<KonsinyasiMasuk>
#[tauri::command]
pub fn list_konsinyasi_masuk(state: State<DbState>) -> Result<Vec<KonsinyasiMasuk>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nomor, tanggal, supplier_id, total_item, status, catatan, created_at
             FROM konsinyasi_masuk ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(KonsinyasiMasuk {
                id: row.get(0)?,
                nomor: row.get(1)?,
                tanggal: row.get(2)?,
                supplier_id: row.get(3)?,
                total_item: row.get(4)?,
                status: row.get(5)?,
                catatan: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Buat header konsinyasi keluar.
///
/// Returns: id konsinyasi_keluar baru
#[tauri::command]
pub fn create_konsinyasi_keluar(
    state: State<DbState>,
    input: KonsinyasiKeluarInput,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO konsinyasi_keluar (nomor, tanggal, penerima_nama, penerima_telepon, total_item, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            input.nomor,
            input.tanggal,
            input.penerima_nama,
            input.penerima_telepon,
            input.total_item.unwrap_or(0),
            input.catatan
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Ambil daftar konsinyasi keluar terbaru.
///
/// Returns: Vec<KonsinyasiKeluar>
#[tauri::command]
pub fn list_konsinyasi_keluar(state: State<DbState>) -> Result<Vec<KonsinyasiKeluar>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nomor, tanggal, penerima_nama, penerima_telepon, total_item, status, catatan, created_at
             FROM konsinyasi_keluar ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(KonsinyasiKeluar {
                id: row.get(0)?,
                nomor: row.get(1)?,
                tanggal: row.get(2)?,
                penerima_nama: row.get(3)?,
                penerima_telepon: row.get(4)?,
                total_item: row.get(5)?,
                status: row.get(6)?,
                catatan: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}
