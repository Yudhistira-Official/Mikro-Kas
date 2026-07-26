use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct Gudang { pub id: i64, pub nama: String, pub alamat: Option<String>, pub is_active: bool, pub is_default: bool }

#[derive(Debug, Serialize)]
pub struct StokGudang { pub gudang_id: i64, pub gudang_nama: String, pub produk_id: i64, pub qty: f64 }

#[derive(Debug, Serialize)]
pub struct TransferStok { pub id: i64, pub gudang_asal_id: i64, pub gudang_tujuan_id: i64, pub tgl_transfer: String, pub status: String, pub catatan: Option<String> }

#[tauri::command]
pub fn list_gudang(state: State<DbState>) -> Result<Vec<Gudang>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, nama, alamat, is_active, is_default FROM gudang WHERE is_active = 1 ORDER BY is_default DESC, nama ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(Gudang { id: row.get(0)?, nama: row.get(1)?, alamat: row.get(2)?, is_active: row.get::<_,i64>(3)? == 1, is_default: row.get::<_,i64>(4)? == 1 })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_gudang(state: State<DbState>, nama: String, alamat: Option<String>) -> Result<i64, String> {
    if nama.trim().is_empty() { return Err("Nama gudang tidak boleh kosong".into()); }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO gudang (nama, alamat) VALUES (?1, ?2)", params![nama.trim(), alamat]).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Update nama dan alamat gudang.
///
/// Parameters:
/// - `id`: id gudang
/// - `nama`: nama baru
/// - `alamat`: alamat baru (opsional)
///
/// Returns: jumlah baris diubah
#[tauri::command]
pub fn update_gudang(state: State<DbState>, id: i64, nama: String, alamat: Option<String>) -> Result<usize, String> {
    if nama.trim().is_empty() { return Err("Nama gudang tidak boleh kosong".into()); }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE gudang SET nama=?1, alamat=?2 WHERE id=?3", params![nama.trim(), alamat, id]).map_err(|e| e.to_string())
}

/// Soft-delete gudang non-default.
///
/// Parameters:
/// - `id`: id gudang
///
/// Returns: jumlah baris diubah
#[tauri::command]
pub fn delete_gudang(state: State<DbState>, id: i64) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE gudang SET is_active=0 WHERE id=?1 AND is_default=0", params![id]).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_stok_per_gudang(state: State<DbState>, produk_id: i64) -> Result<Vec<StokGudang>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT sg.gudang_id, g.nama, sg.produk_id, sg.qty FROM stok_gudang sg JOIN gudang g ON g.id = sg.gudang_id WHERE sg.produk_id = ?1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![produk_id], |row| Ok(StokGudang { gudang_id: row.get(0)?, gudang_nama: row.get(1)?, produk_id: row.get(2)?, qty: row.get(3)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct TransferItem { pub produk_id: i64, pub qty: f64 }

#[tauri::command]
pub fn transfer_stok(state: State<DbState>, gudang_asal_id: i64, gudang_tujuan_id: i64, items: Vec<TransferItem>, catatan: Option<String>) -> Result<i64, String> {
    if gudang_asal_id == gudang_tujuan_id { return Err("Gudang asal dan tujuan tidak boleh sama".into()); }
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO transfer_stok (gudang_asal_id, gudang_tujuan_id, catatan) VALUES (?1, ?2, ?3)", params![gudang_asal_id, gudang_tujuan_id, catatan]).map_err(|e| e.to_string())?;
    let transfer_id = tx.last_insert_rowid();
    for item in &items {
        let tersedia: f64 = tx.query_row("SELECT COALESCE(qty,0) FROM stok_gudang WHERE gudang_id=?1 AND produk_id=?2", params![gudang_asal_id, item.produk_id], |r| r.get(0)).unwrap_or(0.0);
        if tersedia < item.qty { tx.rollback().ok(); return Err(format!("Stok produk {} kurang dari {}", item.produk_id, item.qty)); }
        tx.execute("INSERT INTO transfer_stok_item (transfer_id, produk_id, qty) VALUES (?1, ?2, ?3)", params![transfer_id, item.produk_id, item.qty]).map_err(|e| e.to_string())?;
        tx.execute("UPDATE stok_gudang SET qty = qty - ?1 WHERE gudang_id=?2 AND produk_id=?3", params![item.qty, gudang_asal_id, item.produk_id]).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO stok_gudang (gudang_id, produk_id, qty) VALUES (?1, ?2, ?3) ON CONFLICT(gudang_id, produk_id) DO UPDATE SET qty = qty + ?3", params![gudang_tujuan_id, item.produk_id, item.qty]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(transfer_id)
}

#[tauri::command]
pub fn list_transfer_stok(state: State<DbState>) -> Result<Vec<TransferStok>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, gudang_asal_id, gudang_tujuan_id, tgl_transfer, status, catatan FROM transfer_stok ORDER BY tgl_transfer DESC LIMIT 100").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(TransferStok { id: row.get(0)?, gudang_asal_id: row.get(1)?, gudang_tujuan_id: row.get(2)?, tgl_transfer: row.get(3)?, status: row.get(4)?, catatan: row.get(5)? })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
}
