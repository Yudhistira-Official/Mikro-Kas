//! Maintenance database: integrity check, vacuum, reindex.
//!
//! Fungsi diagnostik untuk owner/admin menjaga kesehatan database.

use crate::db::DbState;
use tauri::State;

/// Jalankan maintenance database lengkap.
///
/// Returns: String hasil operasi
///
/// Side effects:
/// - PRAGMA integrity_check
/// - VACUUM (compact database file)
/// - REINDEX (rebuild all indexes)
#[tauri::command]
pub fn maintenance_database(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut hasil = Vec::new();

    match conn.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0)) {
        Ok(res) => hasil.push(format!("Integrity check: {}", res)),
        Err(e) => hasil.push(format!("Integrity check error: {}", e)),
    }

    match conn.execute_batch("VACUUM") {
        Ok(_) => hasil.push("VACUUM sukses".to_string()),
        Err(e) => hasil.push(format!("VACUUM error: {}", e)),
    }

    match conn.execute_batch("REINDEX") {
        Ok(_) => hasil.push("REINDEX sukses".to_string()),
        Err(e) => hasil.push(format!("REINDEX error: {}", e)),
    }

    Ok(hasil.join("; "))
}
