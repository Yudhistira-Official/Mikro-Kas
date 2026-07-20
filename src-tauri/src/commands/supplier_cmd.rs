//! Command CRUD supplier + detail tambahan & chat WhatsApp.
use crate::db::DbState;
use crate::models::supplier::{Supplier, SupplierInput};
use rusqlite::params;
use tauri::State;

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Supplier> {
    Ok(Supplier {
        id: row.get(0)?,
        nama: row.get(1)?,
        telepon: row.get(2)?,
        alamat: row.get(3)?,
        deskripsi_tambahan: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[tauri::command]
pub fn list_supplier(state: State<DbState>) -> Result<Vec<Supplier>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at FROM supplier ORDER BY lower(nama) ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_supplier(state: State<DbState>, id: i64) -> Result<Supplier, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at FROM supplier WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|_| "Supplier tidak ditemukan".to_string())
}

#[tauri::command]
pub fn create_supplier(state: State<DbState>, input: SupplierInput) -> Result<Supplier, String> {
    let nama = input.nama.trim();
    if nama.is_empty() {
        return Err("Nama wajib diisi".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO supplier (nama, telepon, alamat, deskripsi_tambahan) VALUES (?1, ?2, ?3, ?4)",
        params![nama, input.telepon, input.alamat, input.deskripsi_tambahan],
    )
    .map_err(|e| format!("Gagal menyimpan data: {e}"))?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at FROM supplier WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_supplier(
    state: State<DbState>,
    id: i64,
    input: SupplierInput,
) -> Result<Supplier, String> {
    let nama = input.nama.trim();
    if nama.is_empty() {
        return Err("Nama wajib diisi".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE supplier SET nama=?1, telepon=?2, alamat=?3, deskripsi_tambahan=?4 WHERE id=?5",
        params![
            nama,
            input.telepon,
            input.alamat,
            input.deskripsi_tambahan,
            id
        ],
    )
    .map_err(|e| format!("Gagal update data: {e}"))?;
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at FROM supplier WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_supplier(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM supplier WHERE id=?1", params![id])
        .map_err(|e| format!("Gagal hapus data: {e}"))?;
    Ok(())
}
