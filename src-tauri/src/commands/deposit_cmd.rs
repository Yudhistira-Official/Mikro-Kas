//! Deposit customer: saldo prabayar, top-up, pemakaian, dan log.
//!
//! Deposit digunakan untuk customer yang sering transaksi agar pembayaran cepat.
//! Semua mutasi saldo wajib tercatat di deposit_log.

use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

/// Saldo deposit customer.
#[derive(Debug, Serialize)]
pub struct Deposit {
    pub id: i64,
    pub customer_id: i64,
    pub saldo: i64,
    pub updated_at: String,
}

/// Log mutasi deposit.
#[derive(Debug, Serialize)]
pub struct DepositLog {
    pub id: i64,
    pub deposit_id: i64,
    pub tipe: String,
    pub nominal: i64,
    pub saldo_sebelum: i64,
    pub saldo_sesudah: i64,
    pub transaksi_id: Option<i64>,
    pub keterangan: Option<String>,
    pub created_at: String,
}

/// Ambil atau buat deposit customer jika belum ada.
///
/// Parameters:
/// - `customer_id`: id customer
///
/// Returns: Deposit
///
/// Side effects:
/// - Insert row deposit saldo=0 jika belum ada
#[tauri::command]
pub fn get_or_create_deposit(state: State<DbState>, customer_id: i64) -> Result<Deposit, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO deposit (customer_id, saldo) VALUES (?1, 0)",
        params![customer_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, customer_id, saldo, updated_at FROM deposit WHERE customer_id = ?1",
        params![customer_id],
        |row| {
            Ok(Deposit {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                saldo: row.get(2)?,
                updated_at: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Tambah saldo deposit customer.
///
/// Parameters:
/// - `customer_id`: id customer
/// - `nominal`: nilai top-up
/// - `keterangan`: catatan opsional
///
/// Returns: saldo baru
///
/// Side effects:
/// - Update deposit.saldo
/// - Insert deposit_log tipe='topup'
#[tauri::command]
pub fn top_up_deposit(
    state: State<DbState>,
    customer_id: i64,
    nominal: i64,
    keterangan: Option<String>,
) -> Result<i64, String> {
    if nominal <= 0 {
        return Err("Nominal top-up harus lebih dari 0".to_string());
    }

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR IGNORE INTO deposit (customer_id, saldo) VALUES (?1, 0)",
        params![customer_id],
    )
    .map_err(|e| e.to_string())?;

    let (deposit_id, saldo_sebelum): (i64, i64) = tx
        .query_row(
            "SELECT id, saldo FROM deposit WHERE customer_id = ?1",
            params![customer_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let saldo_sesudah = saldo_sebelum + nominal;
    tx.execute(
        "UPDATE deposit SET saldo = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![saldo_sesudah, deposit_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO deposit_log (deposit_id, tipe, nominal, saldo_sebelum, saldo_sesudah, keterangan)
         VALUES (?1, 'topup', ?2, ?3, ?4, ?5)",
        params![deposit_id, nominal, saldo_sebelum, saldo_sesudah, keterangan],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(saldo_sesudah)
}

/// Gunakan saldo deposit untuk pembayaran.
///
/// Parameters:
/// - `customer_id`: id customer
/// - `nominal`: nilai pemakaian
/// - `transaksi_id`: transaksi terkait, opsional
///
/// Returns: saldo baru
///
/// Side effects:
/// - Kurangi deposit.saldo
/// - Insert deposit_log tipe='usage'
#[tauri::command]
pub fn gunakan_deposit(
    state: State<DbState>,
    customer_id: i64,
    nominal: i64,
    transaksi_id: Option<i64>,
    keterangan: Option<String>,
) -> Result<i64, String> {
    if nominal <= 0 {
        return Err("Nominal penggunaan harus lebih dari 0".to_string());
    }

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let (deposit_id, saldo_sebelum): (i64, i64) = tx
        .query_row(
            "SELECT id, saldo FROM deposit WHERE customer_id = ?1",
            params![customer_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Deposit customer {} tidak ditemukan", customer_id))?;

    if nominal > saldo_sebelum {
        return Err(format!(
            "Saldo deposit tidak cukup: saldo={} diminta={}",
            saldo_sebelum, nominal
        ));
    }

    let saldo_sesudah = saldo_sebelum - nominal;
    tx.execute(
        "UPDATE deposit SET saldo = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![saldo_sesudah, deposit_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO deposit_log (deposit_id, tipe, nominal, saldo_sebelum, saldo_sesudah, transaksi_id, keterangan)
         VALUES (?1, 'usage', ?2, ?3, ?4, ?5, ?6)",
        params![deposit_id, -nominal, saldo_sebelum, saldo_sesudah, transaksi_id, keterangan],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(saldo_sesudah)
}

/// Ambil log mutasi deposit per customer.
///
/// Parameters:
/// - `customer_id`: id customer
///
/// Returns: Vec<DepositLog> terbaru dahulu
#[tauri::command]
pub fn list_deposit_log(
    state: State<DbState>,
    customer_id: i64,
) -> Result<Vec<DepositLog>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT dl.id, dl.deposit_id, dl.tipe, dl.nominal, dl.saldo_sebelum,
                    dl.saldo_sesudah, dl.transaksi_id, dl.keterangan, dl.created_at
             FROM deposit_log dl
             JOIN deposit d ON d.id = dl.deposit_id
             WHERE d.customer_id = ?1
             ORDER BY dl.id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![customer_id], |row| {
            Ok(DepositLog {
                id: row.get(0)?,
                deposit_id: row.get(1)?,
                tipe: row.get(2)?,
                nominal: row.get(3)?,
                saldo_sebelum: row.get(4)?,
                saldo_sesudah: row.get(5)?,
                transaksi_id: row.get(6)?,
                keterangan: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
