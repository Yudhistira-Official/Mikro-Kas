use rusqlite::params;
use serde::Serialize;
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct Serial { pub id: i64, pub produk_id: i64, pub serial_number: String, pub gudang_id: i64, pub status: String, pub transaksi_id: Option<i64>, pub created_at: String }

#[tauri::command]
pub fn list_serial(state: State<DbState>, produk_id: i64) -> Result<Vec<Serial>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, produk_id, serial_number, gudang_id, status, transaksi_id, created_at FROM serial WHERE produk_id=?1 ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![produk_id], |row| Ok(Serial { id: row.get(0)?, produk_id: row.get(1)?, serial_number: row.get(2)?, gudang_id: row.get(3)?, status: row.get(4)?, transaksi_id: row.get(5)?, created_at: row.get(6)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_serial(state: State<DbState>, produk_id: i64, serial_number: String, gudang_id: i64) -> Result<i64, String> {
    if serial_number.trim().is_empty() { return Err("Serial number tidak boleh kosong".into()); }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO serial (produk_id, serial_number, gudang_id) VALUES (?1, ?2, ?3)", params![produk_id, serial_number.trim(), gudang_id]).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_serial_status(state: State<DbState>, id: i64, status: String, transaksi_id: Option<i64>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE serial SET status=?1, transaksi_id=?2 WHERE id=?3", params![status, transaksi_id, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_serial(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM serial WHERE id=?1 AND status='ready'", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}
