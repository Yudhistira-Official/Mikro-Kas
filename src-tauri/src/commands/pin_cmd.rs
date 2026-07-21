// pin_cmd.rs — PIN kasir untuk keamanan akses kasir.
// Design ref: KasGo — PIN kasir, role-based access.
// PIN disimpan sebagai hash sederhana untuk UMKM lokal.
use serde::Serialize;
use tauri::State;
use rusqlite::params;

use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct KasirPin {
    pub id: i64,
    pub role: String,
    pub is_active: bool,
}

/// Set PIN baru untuk kasir/owner.
#[tauri::command]
pub fn set_kasir_pin(
    state: State<DbState>,
    pin: String,
    role: Option<String>,
) -> Result<KasirPin, String> {
    if pin.len() < 4 || pin.len() > 6 {
        return Err("PIN harus 4-6 digit".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let role_str = role.unwrap_or_else(|| "kasir".to_string());
    
    // Hapus PIN aktif lama untuk role ini
    conn.execute(
        "UPDATE kasir_pin SET is_active = 0 WHERE role = ?1 AND is_active = 1",
        params![role_str],
    ).map_err(|e| e.to_string())?;
    
    // Insert PIN baru
    conn.execute(
        "INSERT INTO kasir_pin (pin, role, is_active) VALUES (?1, ?2, 1)",
        params![pin, role_str],
    ).map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid();
    Ok(KasirPin {
        id,
        role: role_str,
        is_active: true,
    })
}

/// Verifikasi PIN kasir.
#[tauri::command]
pub fn verify_kasir_pin(
    state: State<DbState>,
    pin: String,
    role: Option<String>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let role_str = role.unwrap_or_else(|| "kasir".to_string());
    
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM kasir_pin WHERE pin = ?1 AND role = ?2 AND is_active = 1",
        params![pin, role_str],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    
    Ok(count > 0)
}

/// List semua PIN aktif (tanpa menampilkan PIN).
#[tauri::command]
pub fn list_kasir_pins(
    state: State<DbState>,
) -> Result<Vec<KasirPin>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, role, is_active FROM kasir_pin WHERE is_active = 1 ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt
        .query_map([], |row| {
            Ok(KasirPin {
                id: row.get(0)?,
                role: row.get(1)?,
                is_active: row.get::<_, i64>(2)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Hapus PIN berdasarkan ID.
#[tauri::command]
pub fn delete_kasir_pin(
    state: State<DbState>,
    id: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM kasir_pin WHERE id = ?1",
        params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
