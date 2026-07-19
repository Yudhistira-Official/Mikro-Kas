//! CRUD profil QRIS. Satu profil aktif dipilih untuk generator QRIS.

use crate::db::DbState;
use crate::models::qris_profile::{QrisProfile, QrisProfileInput};
use rusqlite::params;
use tauri::State;

fn row_to_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<QrisProfile> {
    Ok(QrisProfile {
        id: row.get(0)?,
        nama: row.get(1)?,
        merchant_name: row.get(2)?,
        qris_statis: row.get(3)?,
        is_active: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
    })
}

#[tauri::command]
pub fn list_qris_profile(state: State<DbState>) -> Result<Vec<QrisProfile>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nama, merchant_name, qris_statis, is_active, created_at FROM qris_profile ORDER BY is_active DESC, nama")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_profile)
        .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub fn save_qris_profile(
    state: State<DbState>,
    id: Option<i64>,
    input: QrisProfileInput,
) -> Result<QrisProfile, String> {
    let nama = input.nama.trim();
    if nama.is_empty() || input.qris_statis.trim().is_empty() {
        return Err("Nama dan QRIS statis wajib diisi".into());
    }
    crate::qris::validasi_qris(input.qris_statis.trim()).map_err(|e| e.to_string())?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    match id {
        Some(id) => {
            let updated = conn.execute(
                "UPDATE qris_profile SET nama = ?1, merchant_name = ?2, qris_statis = ?3 WHERE id = ?4",
                params![nama, input.merchant_name, input.qris_statis.trim(), id],
            ).map_err(|e| e.to_string())?;
            if updated == 0 {
                return Err("Profil QRIS tidak ditemukan".into());
            }
        }
        None => {
            let active = conn
                .query_row("SELECT COUNT(*) FROM qris_profile", [], |r| {
                    r.get::<_, i64>(0)
                })
                .map_err(|e| e.to_string())?
                == 0;
            conn.execute(
                "INSERT INTO qris_profile (nama, merchant_name, qris_statis, is_active) VALUES (?1, ?2, ?3, ?4)",
                params![nama, input.merchant_name, input.qris_statis.trim(), active as i64],
            ).map_err(|e| e.to_string())?;
        }
    }
    let target_id = id.unwrap_or_else(|| conn.last_insert_rowid());
    conn.query_row(
        "SELECT id, nama, merchant_name, qris_statis, is_active, created_at FROM qris_profile WHERE id = ?1",
        [target_id], row_to_profile,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_active_qris_profile(state: State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    if tx
        .execute("UPDATE qris_profile SET is_active = 0", [])
        .map_err(|e| e.to_string())?
        == 0
    {
        return Err("Belum ada profil QRIS".into());
    }
    if tx
        .execute("UPDATE qris_profile SET is_active = 1 WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?
        == 0
    {
        return Err("Profil QRIS tidak ditemukan".into());
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_qris_profile(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let active: bool = conn
        .query_row(
            "SELECT is_active FROM qris_profile WHERE id = ?1",
            [id],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|_| "Profil QRIS tidak ditemukan".to_string())?
        != 0;
    conn.execute("DELETE FROM qris_profile WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    if active {
        let _ = conn.execute("UPDATE qris_profile SET is_active = 1 WHERE id = (SELECT id FROM qris_profile ORDER BY id LIMIT 1)", []);
    }
    Ok(())
}

#[tauri::command]
pub fn get_active_qris_profile(state: State<DbState>) -> Result<Option<QrisProfile>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, nama, merchant_name, qris_statis, is_active, created_at FROM qris_profile WHERE is_active = 1 LIMIT 1",
        [], row_to_profile,
    ).optional().map_err(|e| e.to_string())
}

use rusqlite::OptionalExtension;
