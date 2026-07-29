//! Point loyalty system: setting, saldo, dan penukaran point customer.
//!
//! Customer mendapat point dari setiap pembelian sesuai konfigurasi point_setting.
//! Point bisa ditukar dengan diskon nominal saat checkout.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Konfigurasi sistem point loyalty (singleton id=1).
#[derive(Debug, Serialize)]
pub struct PointSetting {
    pub id: i64,
    pub rupiah_per_point: i64,
    pub point_per_rupiah: f64,
    pub min_transaksi_dapat_point: i64,
    pub berlaku_sampai: Option<String>,
    pub is_active: i64,
}

/// Input untuk update konfigurasi point.
#[derive(Debug, Deserialize)]
pub struct PointSettingInput {
    pub rupiah_per_point: i64,
    pub point_per_rupiah: f64,
    pub min_transaksi_dapat_point: i64,
    pub berlaku_sampai: Option<String>,
    pub is_active: Option<i64>,
}

/// Saldo point customer.
#[derive(Debug, Serialize)]
pub struct SaldoPoint {
    pub customer_id: i64,
    pub customer_nama: String,
    pub saldo_point: i64,
}

/// Ambil setting point (singleton).
///
/// Returns: PointSetting dengan id=1
#[tauri::command]
pub fn get_point_setting(state: State<DbState>) -> Result<PointSetting, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, rupiah_per_point, point_per_rupiah, min_transaksi_dapat_point, berlaku_sampai, is_active
         FROM point_setting WHERE id = 1",
        [],
        |row| {
            Ok(PointSetting {
                id: row.get(0)?,
                rupiah_per_point: row.get(1)?,
                point_per_rupiah: row.get(2)?,
                min_transaksi_dapat_point: row.get(3)?,
                berlaku_sampai: row.get(4)?,
                is_active: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Update konfigurasi point setting.
///
/// Parameters:
/// - `input`: PointSettingInput
///
/// Returns: true jika sukses
///
/// Side effects: update baris id=1 di point_setting
#[tauri::command]
pub fn update_point_setting(
    state: State<DbState>,
    input: PointSettingInput,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE point_setting
         SET rupiah_per_point = ?1, point_per_rupiah = ?2,
             min_transaksi_dapat_point = ?3, berlaku_sampai = ?4,
             is_active = COALESCE(?5, is_active)
         WHERE id = 1",
        params![
            input.rupiah_per_point,
            input.point_per_rupiah,
            input.min_transaksi_dapat_point,
            input.berlaku_sampai,
            input.is_active
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Ambil saldo point customer.
///
/// Parameters:
/// - `customer_id`: id customer
///
/// Returns: SaldoPoint dengan total point dari point_log
#[tauri::command]
pub fn get_saldo_point(state: State<DbState>, customer_id: i64) -> Result<SaldoPoint, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Hitung saldo dari log: earn + adjust positif = tambah, redeem + expire = kurang
    let (nama, saldo): (String, i64) = conn
        .query_row(
            "SELECT c.nama,
                    COALESCE((
                        SELECT saldo_sesudah FROM point_log
                        WHERE customer_id = ?1
                        ORDER BY id DESC LIMIT 1
                    ), 0) AS saldo
             FROM customer c WHERE c.id = ?1",
            params![customer_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Customer ID {} tidak ditemukan", customer_id))?;

    Ok(SaldoPoint {
        customer_id,
        customer_nama: nama,
        saldo_point: saldo,
    })
}

/// Tukarkan point customer menjadi diskon nominal.
///
/// Parameters:
/// - `customer_id`: id customer
/// - `jumlah_point`: point yang akan ditukar
/// - `transaksi_id`: id transaksi terkait (opsional)
///
/// Returns: nilai diskon dalam Rupiah
///
/// Side effects:
/// - Catat point_log dengan tipe='redeem'
/// - Saldo point berkurang
#[tauri::command]
pub fn tukar_point(
    state: State<DbState>,
    customer_id: i64,
    jumlah_point: i64,
    transaksi_id: Option<i64>,
) -> Result<i64, String> {
    if jumlah_point <= 0 { return Err("Jumlah point harus lebih besar dari 0".into()); }
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Ambil saldo point saat ini
    let saldo_sekarang: i64 = tx
        .query_row(
            "SELECT COALESCE((SELECT saldo_sesudah FROM point_log WHERE customer_id = ?1 ORDER BY id DESC LIMIT 1), 0)",
            params![customer_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if jumlah_point > saldo_sekarang {
        return Err(format!(
            "Point tidak cukup: saldo={} diminta={}",
            saldo_sekarang, jumlah_point
        ));
    }

    // Hitung nilai Rupiah dari point yang ditukar
    let rupiah_per_point: i64 = tx
        .query_row(
            "SELECT rupiah_per_point FROM point_setting WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let nilai_diskon = jumlah_point.checked_mul(rupiah_per_point).ok_or("Nilai diskon melebihi batas angka")?;
    let saldo_sesudah = saldo_sekarang.checked_sub(jumlah_point).ok_or("Saldo point tidak mencukupi untuk dikurangi")?;

    tx.execute(
        "INSERT INTO point_log (customer_id, transaksi_id, tipe, point, saldo_sebelum, saldo_sesudah, keterangan)
         VALUES (?1, ?2, 'redeem', ?3, ?4, ?5, 'Penukaran point')",
        params![customer_id, transaksi_id, -jumlah_point, saldo_sekarang, saldo_sesudah],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(nilai_diskon)
}
