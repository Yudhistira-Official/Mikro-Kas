//! Tukar tambah: trade-in barang lama untuk potongan barang baru.
//!
//! Mendukung multi-item: menukar banyak barang lama dengan banyak barang baru sekaligus.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Data header tukar tambah.
#[derive(Debug, Serialize)]
pub struct TukarTambah {
    pub id: i64,
    pub transaksi_id: i64,
    pub customer_id: Option<i64>,
    pub deskripsi_barang_lama: String,
    pub kondisi: Option<String>,
    pub nilai_tukar: i64, // Menyimpan total_tukar
    pub produk_baru_id: Option<i64>,
    pub harga_produk_baru: i64, // Menyimpan total_baru
    pub qty_produk_baru: i64,
    pub selisih_bayar: i64,
    pub catatan: Option<String>,
    pub created_at: String,
}

/// Data detail item tukar tambah.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TukarTambahItem {
    pub id: Option<i64>,
    pub tipe: String, // 'lama' | 'baru'
    pub produk_id: Option<i64>,
    pub nama_produk: String,
    pub qty: i64,
    pub harga_satuan: i64,
    pub subtotal: i64,
    pub nilai_tukar_satuan: i64,
    pub kondisi: Option<String>,
}

/// Input untuk membuat transaksi tukar tambah multi-item.
#[derive(Debug, Deserialize)]
pub struct TukarTambahInput {
    pub transaksi_id: i64,
    pub customer_id: Option<i64>,
    pub total_tukar: i64,
    pub total_baru: i64,
    pub catatan: Option<String>,
    pub items: Vec<TukarTambahItem>,
}

/// Buat record tukar tambah dengan validasi aturan bisnis:
/// 1. Nilai tukar >= harga item yang dibeli sebelumnya
/// 2. Harga produk baru >= total pembelian sebelumnya
///
/// Returns: id tukar_tambah baru
#[tauri::command]
pub fn create_tukar_tambah(state: State<DbState>, input: TukarTambahInput) -> Result<i64, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Validasi: Muat transaksi asal
    let (trx_total, trx_tipe): (i64, String) = tx
        .query_row(
            "SELECT total, tipe FROM transaksi WHERE id = ?1",
            params![input.transaksi_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Transaksi asal tidak ditemukan".to_string())?;

    if trx_tipe != "penjualan" {
        return Err("Tukar tambah hanya bisa dilakukan dari riwayat penjualan".into());
    }

    // Rule 2: Total penukaran tidak boleh berjumlah kurang dari pembelian pelanggan sebelumnya
    if input.total_baru < trx_total {
        return Err(format!(
            "Total harga barang baru ({}) tidak boleh kurang dari total pembelian sebelumnya ({})",
            input.total_baru, trx_total
        ));
    }

    // Validasi per item lama
    let old_items = input.items.iter().filter(|i| i.tipe == "lama");
    for item in old_items {
        let original_price: i64 = tx.query_row(
            "SELECT harga_satuan FROM transaksi_item WHERE transaksi_id = ?1 AND produk_id = ?2",
            params![input.transaksi_id, item.produk_id],
            |row| row.get(0),
        ).map_err(|_| format!("Produk '{}' tidak ditemukan di transaksi pembelian sebelumnya", item.nama_produk))?;

        if item.nilai_tukar_satuan < original_price {
            return Err(format!(
                "Nilai tukar '{}' ({}) tidak boleh kurang dari harga beli sebelumnya ({})",
                item.nama_produk, item.nilai_tukar_satuan, original_price
            ));
        }
    }

    let selisih_bayar = (input.total_baru - input.total_tukar).max(0);

    // Buat ringkasan deskripsi barang lama untuk kolom warisan
    let old_names: Vec<String> = input
        .items
        .iter()
        .filter(|i| i.tipe == "lama")
        .map(|i| format!("{} (x{})", i.nama_produk, i.qty))
        .collect();
    let deskripsi_summary = if old_names.is_empty() {
        "Tidak ada barang lama".to_string()
    } else {
        old_names.join(", ")
    };

    // Ambil produk baru pertama sebagai data fallback
    let first_new_product = input.items.iter().find(|i| i.tipe == "baru");
    let fallback_new_id = first_new_product.and_then(|p| p.produk_id);
    let fallback_new_qty = first_new_product.map(|p| p.qty).unwrap_or(1);
    let fallback_kondisi = input
        .items
        .iter()
        .find(|i| i.tipe == "lama")
        .and_then(|i| i.kondisi.clone());

    tx.execute(
        "INSERT INTO tukar_tambah
         (transaksi_id, customer_id, deskripsi_barang_lama, kondisi, nilai_tukar, produk_baru_id, harga_produk_baru, qty_produk_baru, total_tukar, total_baru, selisih_bayar, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            input.transaksi_id,
            input.customer_id,
            deskripsi_summary,
            fallback_kondisi,
            input.total_tukar,
            fallback_new_id,
            input.total_baru,
            fallback_new_qty,
            input.total_tukar,
            input.total_baru,
            selisih_bayar,
            input.catatan
        ],
    )
    .map_err(|e| e.to_string())?;

    let tt_id = tx.last_insert_rowid();

    // Insert items
    for item in &input.items {
        tx.execute(
            "INSERT INTO tukar_tambah_item (tukar_tambah_id, tipe, produk_id, nama_produk, qty, harga_satuan, subtotal, nilai_tukar_satuan, kondisi)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                tt_id,
                item.tipe,
                item.produk_id,
                item.nama_produk,
                item.qty,
                item.harga_satuan,
                item.subtotal,
                item.nilai_tukar_satuan,
                item.kondisi
            ]
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(tt_id)
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
                    nilai_tukar, produk_baru_id, harga_produk_baru, qty_produk_baru, selisih_bayar, catatan, created_at
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
                qty_produk_baru: row.get(8)?,
                selisih_bayar: row.get(9)?,
                catatan: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
