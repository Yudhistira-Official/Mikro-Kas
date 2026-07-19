use crate::db::DbState;
use crate::logger;
use crate::models::toko::{Toko, TokoInput};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_toko(state: State<DbState>) -> Result<Option<Toko>, String> {
    logger::log("COMMAND: get_toko dipanggil");
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nama_toko, qris_statis, created_at FROM toko WHERE id = 1")
        .map_err(|e| {
            logger::log(&format!("COMMAND: get_toko prepare error = {e}"));
            e.to_string()
        })?;
    let toko = stmt
        .query_row([], |row| {
            Ok(Toko {
                id: row.get(0)?,
                nama_toko: row.get(1)?,
                qris_statis: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .ok();
    logger::log(&format!(
        "COMMAND: get_toko selesai, toko_found = {:?}",
        toko.is_some()
    ));
    Ok(toko)
}

#[tauri::command]
pub fn save_toko(state: State<DbState>, input: TokoInput) -> Result<Toko, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO toko (id, nama_toko, qris_statis)
         VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET nama_toko=excluded.nama_toko, qris_statis=excluded.qris_statis",
        params![input.nama_toko, input.qris_statis],
    )
    .map_err(|e| e.to_string())?;
    // Return saved data
    let mut stmt = conn
        .prepare("SELECT id, nama_toko, qris_statis, created_at FROM toko WHERE id = 1")
        .map_err(|e| e.to_string())?;
    stmt.query_row([], |row| {
        Ok(Toko {
            id: row.get(0)?,
            nama_toko: row.get(1)?,
            qris_statis: row.get(2)?,
            created_at: row.get(3)?,
        })
    })
    .map_err(|e| e.to_string())
}
