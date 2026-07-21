//! Commands Pesanan Customer — pre-order + DP.
//!
//! Scope minimal: simpan header pesanan, DP, sisa pembayaran, status.
//! Stok tidak dikurangi sampai transaksi penjualan dibuat di kasir.
use crate::db::DbState;
use crate::models::pesanan::{PesananCustomer, PesananCustomerInput};
use rusqlite::params;
use tauri::State;

const PESANAN_SELECT: &str = "SELECT p.id, p.customer_id, c.nama, p.nama_pemesan,
    p.total, p.dp, (p.total - p.dp) AS sisa, p.status, p.catatan, p.jatuh_tempo,
    p.created_at, p.updated_at
    FROM pesanan_customer p
    LEFT JOIN customer c ON c.id = p.customer_id";

fn map_pesanan(row: &rusqlite::Row<'_>) -> rusqlite::Result<PesananCustomer> {
    Ok(PesananCustomer {
        id: row.get(0)?,
        customer_id: row.get(1)?,
        customer_nama: row.get(2)?,
        nama_pemesan: row.get(3)?,
        total: row.get(4)?,
        dp: row.get(5)?,
        sisa: row.get(6)?,
        status: row.get(7)?,
        catatan: row.get(8)?,
        jatuh_tempo: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

#[tauri::command]
pub fn list_pesanan_customer(
    state: State<DbState>,
    status: Option<String>,
) -> Result<Vec<PesananCustomer>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(PESANAN_SELECT);
    let mut status_filter = status.unwrap_or_else(|| "open".to_string());
    if status_filter == "semua" {
        sql.push_str(" ORDER BY p.created_at DESC, p.id DESC");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], map_pesanan).map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
        return Ok(result);
    }
    if !matches!(status_filter.as_str(), "open" | "selesai" | "batal") {
        status_filter = "open".to_string();
    }
    sql.push_str(" WHERE p.status = ?1 ORDER BY p.created_at DESC, p.id DESC");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![status_filter], map_pesanan)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_pesanan_customer(
    state: State<DbState>,
    input: PesananCustomerInput,
) -> Result<PesananCustomer, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let nama = input.nama_pemesan.trim();
    if nama.is_empty() {
        return Err("Nama pemesan wajib diisi".into());
    }
    let total = input.total.max(0);
    let dp = input.dp.unwrap_or(0).max(0).min(total);
    conn.execute(
        "INSERT INTO pesanan_customer (customer_id, nama_pemesan, total, dp, catatan, jatuh_tempo)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![input.customer_id, nama, total, dp, input.catatan, input.jatuh_tempo],
    )
    .map_err(|e| format!("Gagal simpan pesanan: {e}"))?;
    let id = conn.last_insert_rowid();
    // MutexGuard dilepas sebelum membaca ulang pesanan lewat helper yang mengunci DB lagi.
    drop(conn);
    get_pesanan_customer(state, id)
}

#[tauri::command]
pub fn get_pesanan_customer(state: State<DbState>, id: i64) -> Result<PesananCustomer, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(&format!("{} WHERE p.id = ?1", PESANAN_SELECT), params![id], map_pesanan)
        .map_err(|_| "Pesanan tidak ditemukan".to_string())
}

#[tauri::command]
pub fn update_status_pesanan_customer(
    state: State<DbState>,
    id: i64,
    status: String,
) -> Result<(), String> {
    if !matches!(status.as_str(), "open" | "selesai" | "batal") {
        return Err("Status pesanan tidak valid".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE pesanan_customer SET status=?1, updated_at=datetime('now') WHERE id=?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_pesanan_customer(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pesanan_customer WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
