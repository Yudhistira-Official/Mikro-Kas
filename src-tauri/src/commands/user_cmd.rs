/// Multi-user system with role-based access control
/// Roles: admin (full), supervisor (all except user mgmt), kasir (POS only)
/// Password: bcrypt hash (cost 10)
/// Session: frontend manages (8h timeout)

use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub nama_lengkap: Option<String>,
    pub role: String,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub nama_lengkap: Option<String>,
    pub role: String,
}

/// Register new user with bcrypt password hash
#[tauri::command]
pub fn create_user(
    state: State<DbState>,
    req: CreateUserRequest,
) -> Result<User, String> {
    if req.username.len() < 3 {
        return Err("Username min 3 karakter".into());
    }
    if req.password.len() < 6 {
        return Err("Password min 6 karakter".into());
    }
    
    let hash = bcrypt::hash(&req.password, 10).map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES (?1, ?2, ?3, ?4)",
        params![req.username, hash, req.nama_lengkap, req.role],
    ).map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid();
    Ok(User {
        id,
        username: req.username,
        nama_lengkap: req.nama_lengkap,
        role: req.role,
        is_active: true,
    })
}

/// Login: verify username + password, return user if valid
#[tauri::command]
pub fn login_user(
    state: State<DbState>,
    username: String,
    password: String,
) -> Result<User, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, username, password_hash, nama_lengkap, role, is_active FROM users WHERE username = ?1"
    ).map_err(|e| e.to_string())?;
    
    let user = stmt.query_row(params![username], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
        ))
    }).map_err(|_| "User tidak ditemukan".to_string())?;
    
    let (id, user_username, hash, nama, role, active) = user;
    
    if active == 0 {
        return Err("User tidak aktif".into());
    }
    
    if !bcrypt::verify(&password, &hash).map_err(|e| e.to_string())? {
        return Err("Password salah".into());
    }
    
    conn.execute(
        "INSERT INTO user_logs (user_id, aksi) VALUES (?1, 'login')",
        params![id],
    ).map_err(|e| e.to_string())?;
    
    Ok(User {
        id,
        username: user_username,
        nama_lengkap: nama,
        role,
        is_active: true,
    })
}

/// List all users (without password hash)
#[tauri::command]
pub fn list_users(state: State<DbState>) -> Result<Vec<User>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, username, nama_lengkap, role, is_active FROM users ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(User {
            id: row.get(0)?,
            username: row.get(1)?,
            nama_lengkap: row.get(2)?,
            role: row.get(3)?,
            is_active: row.get::<_, i64>(4)? == 1,
        })
    }).map_err(|e| e.to_string())?;
    
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Deactivate user (soft delete)
#[tauri::command]
pub fn deactivate_user(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE users SET is_active = 0 WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reset password (admin only)
#[tauri::command]
pub fn reset_password(
    state: State<DbState>,
    user_id: i64,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("Password min 6 karakter".into());
    }
    
    let hash = bcrypt::hash(&new_password, 10).map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![hash, user_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Log user action
#[tauri::command]
pub fn log_user_action(
    state: State<DbState>,
    user_id: i64,
    aksi: String,
    detail: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO user_logs (user_id, aksi, detail) VALUES (?1, ?2, ?3)",
        params![user_id, aksi, detail],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
