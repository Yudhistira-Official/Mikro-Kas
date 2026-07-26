//! Tukar tambah: trade-in barang lama untuk potongan barang baru.
//!
//! Skeleton Phase 4 mencatat transaksi tukar tambah tanpa mutasi stok barang lama.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Data tukar tambah.
#[derive(Debug, Serialize)]
pub struct TukarTambah {
    pub id: i64,
    pub transaksi_id: i64,
    pub customer_id: Option<i64>,
    pub deskripsi_barang_lama: String,
    pub kondisi: Option<String>,
    pub nilai_tukar: i64,
    pub produk_baru_id: Option<i64>,
    pub harga_produk_baru: i64,
    pub selisih_bayar: i64,
    pub catatan: Option<String>,
    pub created_at: String,
}

/// Input untuk membuat tukar tambah.
#[derive(Debug, Deserialize)]
pub struct TukarTambahInput {
    pub transaksi_id: i64,
    pub customer_id: Option<i64>,
    pub deskripsi_barang_lama: String,
    pub kondisi: Option<String>,
    pub nilai_tukar: i64,
    pub produk_baru_id: Option<i64>,
    pub harga_produk_baru: i64,
    pub catatan: Option<String>,
}

/// Buat record tukar tambah.
///
/// Returns: id tukar_tambah baru
#[tauri::command]
pub fn create_tukar_tambah(
    state: State<DbState>,
    input: TukarTambahInput,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let selisih_bayar = (input.harga_produk_baru - input.nilai_tukar).max(0);

    conn.execute(
        "INSERT INTO tukar_tambah
         (transaksi_id, customer_id, deskripsi_barang_lama, kondisi, nilai_tukar, produk_baru_id, harga_produk_baru, selisih_bayar, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            input.transaksi_id,
            input.customer_id,
            input.deskripsi_barang_lama,
            input.kondisi,
            input.nilai_tukar,
            input.produk_baru_id,
            input.harga_produk_baru,
            selisih_bayar,
            input.catatan
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

/// Ambil daftar tukar tambah terbaru.
///
/// Returns: Vec<TukarTambah>
#[tauri::command]
pub fn list_tukar_tambah(state: State<DbState>) -> Result<Vec<TukarTambah>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, transaksi_id, customer_id, deskripsi_barang_lama, kondisi,
                    nilai_tukar, produk_baru_id, harga_produk_baru, selisih_bayar, catatan, created_at
             FROM tukar_tambah ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TukarTambah {
                id: row.get(0)?,
                transaksi_id: row.get(1)?,
                customer_id: row.get(2)?,
                deskripsi_barang_lama: row.get(3)?,
                kondisi: row.get(4)?,
                nilai_tukar: row.get(5)?,
                produk_baru_id: row.get(6)?,
                harga_produk_baru: row.get(7)?,
                selisih_bayar: row.get(8)?,
                catatan: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
