//! Command CRUD customer + detail tambahan.
use crate::db::DbState;
use crate::models::customer::{Customer, CustomerInput};
use rusqlite::params;
use tauri::State;

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: row.get(0)?,
        nama: row.get(1)?,
        telepon: row.get(2)?,
        alamat: row.get(3)?,
        deskripsi_tambahan: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[tauri::command]
pub fn list_customer(state: State<DbState>) -> Result<Vec<Customer>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at
             FROM customer
             ORDER BY lower(nama) ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_customer(state: State<DbState>, input: CustomerInput) -> Result<Customer, String> {
    let nama = input.nama.trim();
    if nama.is_empty() {
        return Err("Nama wajib diisi".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO customer (nama, telepon, alamat, deskripsi_tambahan) VALUES (?1, ?2, ?3, ?4)",
        params![nama, input.telepon, input.alamat, input.deskripsi_tambahan],
    )
    .map_err(|e| format!("Gagal menyimpan data: {e}"))?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at FROM customer WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_customer(
    state: State<DbState>,
    id: i64,
    input: CustomerInput,
) -> Result<Customer, String> {
    let nama = input.nama.trim();
    if nama.is_empty() {
        return Err("Nama wajib diisi".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE customer SET nama=?1, telepon=?2, alamat=?3, deskripsi_tambahan=?4 WHERE id=?5",
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
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at FROM customer WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_customer(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM customer WHERE id=?1", params![id])
        .map_err(|e| format!("Gagal hapus data: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_customer(state: State<DbState>, id: i64) -> Result<Customer, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, created_at FROM customer WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|_| "Customer tidak ditemukan".to_string())
}
