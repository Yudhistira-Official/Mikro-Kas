// pin_cmd.rs — PIN kasir untuk keamanan akses kasir.
// Design ref: KasGo — PIN kasir, role-based access.
// PIN disimpan sebagai hash sederhana untuk UMKM lokal.
use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::commands::user_cmd::{require_admin, AuthState};
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
    auth: State<AuthState>,
    pin: String,
    role: Option<String>,
) -> Result<KasirPin, String> {
    require_admin(&auth)?;
    if pin.len() < 4 || pin.len() > 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN harus 4-6 digit angka".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let role_str = role.unwrap_or_else(|| "kasir".to_string());

    // Hapus PIN aktif lama untuk role ini
    conn.execute(
        "UPDATE kasir_pin SET is_active = 0 WHERE role = ?1 AND is_active = 1",
        params![role_str],
    )
    .map_err(|e| e.to_string())?;

    // Hash PIN menggunakan bcrypt sebelum disimpan
    let hash = bcrypt::hash(&pin, 10).map_err(|e| e.to_string())?;

    // Insert PIN baru
    conn.execute(
        "INSERT INTO kasir_pin (pin, role, is_active) VALUES (?1, ?2, 1)",
        params![hash, role_str],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    Ok(KasirPin {
        id,
        role: role_str,
        is_active: true,
    })
}

/// Verifikasi PIN kasir.
pub fn verify_pin_hashes(conn: &rusqlite::Connection, pin: &str, roles: &[&str]) -> Result<bool, String> {
    if pin.is_empty() { return Ok(false); }
    let placeholders = std::iter::repeat("?").take(roles.len()).collect::<Vec<_>>().join(",");
    let sql = format!("SELECT id, pin FROM kasir_pin WHERE role IN ({placeholders}) AND is_active = 1");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let role_params: Vec<&dyn rusqlite::ToSql> = roles.iter().map(|r| r as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(role_params.as_slice(), |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    for row in rows {
        let (id, hash) = row.map_err(|e| e.to_string())?;
        // Legacy migration: accept plaintext PIN stored pre-bcrypt and rehash transparently
        if hash == pin {
            let new_hash = bcrypt::hash(pin, 10).map_err(|e| e.to_string())?;
            let _ = conn.execute("UPDATE kasir_pin SET pin = ?1 WHERE id = ?2", params![new_hash, id]);
            return Ok(true);
        }
        if bcrypt::verify(pin, &hash).unwrap_or(false) {
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub fn verify_kasir_pin(
    state: State<DbState>,
    pin: String,
    role: Option<String>,
) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let role_str = role.unwrap_or_else(|| "kasir".to_string());

    crate::commands::pin_cmd::verify_pin_hashes(&conn, &pin, &[role_str.as_str()])
}

/// List semua PIN aktif (tanpa menampilkan PIN).
#[tauri::command]
pub fn list_kasir_pins(state: State<DbState>) -> Result<Vec<KasirPin>, String> {
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
pub fn delete_kasir_pin(state: State<DbState>, auth: State<AuthState>, id: i64) -> Result<(), String> {
    require_admin(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM kasir_pin WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
