use crate::db::DbState;
use crate::models::kategori::{Kategori, KategoriInput};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn list_kategori(state: State<DbState>) -> Result<Vec<Kategori>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nama FROM kategori ORDER BY nama ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Kategori {
                id: row.get(0)?,
                nama: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Buat kategori baru. Nama dinormalisasi agar spasi/duplikasi jelas bagi kasir.
#[tauri::command]
pub fn create_kategori(state: State<DbState>, input: KategoriInput) -> Result<Kategori, String> {
    let nama = input.nama.trim().to_string();
    if nama.is_empty() {
        return Err("Nama kategori wajib diisi".into());
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO kategori (nama) VALUES (?1)", params![nama])
        .map_err(|e| {
            if matches!(e, rusqlite::Error::SqliteFailure(ref err, _) if err.code == rusqlite::ErrorCode::ConstraintViolation) {
                "Kategori dengan nama tersebut sudah ada".to_string()
            } else {
                format!("Gagal simpan kategori: {e}")
            }
        })?;
    Ok(Kategori {
        id: conn.last_insert_rowid(),
        nama,
    })
}

#[tauri::command]
pub fn update_kategori(
    state: State<DbState>,
    id: i64,
    input: KategoriInput,
) -> Result<Kategori, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE kategori SET nama = ?1 WHERE id = ?2",
        params![input.nama, id],
    )
    .map_err(|e| format!("Gagal update kategori: {}", e))?;
    Ok(Kategori {
        id,
        nama: input.nama,
    })
}

#[tauri::command]
pub fn delete_kategori(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM kategori WHERE id = ?1", params![id])
        .map_err(|e| format!("Gagal hapus kategori: {}", e))?;
    Ok(())
}
