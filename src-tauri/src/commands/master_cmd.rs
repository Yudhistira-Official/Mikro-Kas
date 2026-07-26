use rusqlite::params;
use serde::Serialize;
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct MasterItem { pub id: i64, pub nama: String, pub kode: Option<String>, pub is_active: bool }

#[tauri::command]
pub fn list_master_bank(state: State<DbState>) -> Result<Vec<MasterItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, nama, kode, is_active FROM master_bank ORDER BY nama").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(MasterItem { id: row.get(0)?, nama: row.get(1)?, kode: row.get(2)?, is_active: row.get::<_,i64>(3)? == 1 })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_master_ekspedisi(state: State<DbState>) -> Result<Vec<MasterItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, nama, NULL, is_active FROM master_ekspedisi WHERE is_active=1 ORDER BY nama").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(MasterItem { id: row.get(0)?, nama: row.get(1)?, kode: row.get(2)?, is_active: row.get::<_,i64>(3)? == 1 })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_master_merek(state: State<DbState>) -> Result<Vec<MasterItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, nama, NULL, is_active FROM master_merek WHERE is_active=1 ORDER BY nama").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(MasterItem { id: row.get(0)?, nama: row.get(1)?, kode: row.get(2)?, is_active: row.get::<_,i64>(3)? == 1 })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_master_bank(state: State<DbState>, nama: String, kode: Option<String>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO master_bank (nama, kode) VALUES (?1, ?2)", params![nama, kode]).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn create_master_ekspedisi(state: State<DbState>, nama: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO master_ekspedisi (nama) VALUES (?1)", params![nama]).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn create_master_merek(state: State<DbState>, nama: String) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO master_merek (nama) VALUES (?1)", params![nama]).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}
