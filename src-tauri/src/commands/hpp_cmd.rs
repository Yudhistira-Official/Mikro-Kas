//! HPP (Harga Pokok Penjualan) calculation: FIFO & LIFO skeleton.
//!
//! Phase 4 mencatat batch stok masuk dan fungsi hitung HPP tanpa mutasi otomatis.
//! Mutasi qty_terpakai pada stok_batch aman ditambahkan setelah flow UI final.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Batch stok masuk untuk tracking HPP.
#[derive(Debug, Serialize)]
pub struct StokBatch {
    pub id: i64,
    pub produk_id: i64,
    pub gudang_id: Option<i64>,
    pub tgl_masuk: String,
    pub qty_masuk: i64,
    pub qty_terpakai: i64,
    pub qty_sisa: i64,
    pub harga_beli: i64,
    pub ref_tabel: Option<String>,
    pub ref_id: Option<i64>,
    pub created_at: String,
}

/// Input untuk menambah batch stok.
#[derive(Debug, Deserialize)]
pub struct StokBatchInput {
    pub produk_id: i64,
    pub gudang_id: Option<i64>,
    pub tgl_masuk: String,
    pub qty_masuk: i64,
    pub harga_beli: i64,
    pub ref_tabel: Option<String>,
    pub ref_id: Option<i64>,
}

/// Hasil perhitungan HPP.
#[derive(Debug, Serialize)]
pub struct HppResult {
    pub total_hpp: i64,
    pub qty_terpenuhi: i64,
    pub batches_used: Vec<i64>,
}

/// Tambah batch stok masuk.
///
/// Returns: id stok_batch baru
///
/// Side effects:
/// - Insert row stok_batch dengan qty_terpakai=0, qty_sisa=qty_masuk
#[tauri::command]
pub fn add_stok_batch(state: State<DbState>, input: StokBatchInput) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO stok_batch (produk_id, gudang_id, tgl_masuk, qty_masuk, qty_terpakai, qty_sisa, harga_beli, ref_tabel, ref_id)
         VALUES (?1, ?2, ?3, ?4, 0, ?4, ?5, ?6, ?7)",
        params![
            input.produk_id,
            input.gudang_id,
            input.tgl_masuk,
            input.qty_masuk,
            input.harga_beli,
            input.ref_tabel,
            input.ref_id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Hitung HPP dengan metode FIFO (First In First Out).
///
/// Parameters:
/// - `produk_id`: id produk
/// - `qty_jual`: jumlah qty yang dijual
/// - `gudang_id`: filter gudang, opsional
///
/// Returns: HppResult dengan total_hpp dan batch yang dipakai
///
/// Side effects:
/// - ponytail: no mutation qty_terpakai, hanya kalkulasi read-only untuk preview
#[tauri::command]
pub fn hitung_hpp_fifo(
    state: State<DbState>,
    produk_id: i64,
    qty_jual: i64,
    gudang_id: Option<i64>,
) -> Result<HppResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, qty_sisa, harga_beli FROM stok_batch
             WHERE produk_id = ?1 AND (?2 IS NULL OR gudang_id = ?2) AND qty_sisa > 0
             ORDER BY tgl_masuk ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut batches: Vec<(i64, i64, i64)> = stmt
        .query_map(params![produk_id, gudang_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut sisa = qty_jual;
    let mut total_hpp = 0i64;
    let mut used = Vec::new();

    for (batch_id, qty_sisa, harga_beli) in &mut batches {
        if sisa == 0 {
            break;
        }
        let ambil = (*qty_sisa).min(sisa);
        total_hpp += ambil * (*harga_beli);
        sisa -= ambil;
        used.push(*batch_id);
    }

    Ok(HppResult {
        total_hpp,
        qty_terpenuhi: qty_jual - sisa,
        batches_used: used,
    })
}

/// Hitung HPP dengan metode LIFO (Last In First Out).
///
/// Parameters:
/// - `produk_id`: id produk
/// - `qty_jual`: jumlah qty yang dijual
/// - `gudang_id`: filter gudang, opsional
///
/// Returns: HppResult dengan total_hpp dan batch yang dipakai
///
/// Side effects:
/// - ponytail: no mutation qty_terpakai, hanya kalkulasi read-only untuk preview
#[tauri::command]
pub fn hitung_hpp_lifo(
    state: State<DbState>,
    produk_id: i64,
    qty_jual: i64,
    gudang_id: Option<i64>,
) -> Result<HppResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, qty_sisa, harga_beli FROM stok_batch
             WHERE produk_id = ?1 AND (?2 IS NULL OR gudang_id = ?2) AND qty_sisa > 0
             ORDER BY tgl_masuk DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;

    let mut batches: Vec<(i64, i64, i64)> = stmt
        .query_map(params![produk_id, gudang_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut sisa = qty_jual;
    let mut total_hpp = 0i64;
    let mut used = Vec::new();

    for (batch_id, qty_sisa, harga_beli) in &mut batches {
        if sisa == 0 {
            break;
        }
        let ambil = (*qty_sisa).min(sisa);
        total_hpp += ambil * (*harga_beli);
        sisa -= ambil;
        used.push(*batch_id);
    }

    Ok(HppResult {
        total_hpp,
        qty_terpenuhi: qty_jual - sisa,
        batches_used: used,
    })
}
