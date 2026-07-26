/// Transaction number settings and generator
/// Generates unique formatted numbers per transaction type with optional monthly/yearly reset

use chrono::{Datelike, Local};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct NomorSetting {
    pub id: i64,
    pub tipe: String,
    pub prefix: String,
    pub digit_run: i64,
    pub current_number: i64,
    pub reset_period: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNomorSettingRequest {
    pub tipe: String,
    pub prefix: String,
    pub digit_run: i64,
    pub reset_period: String,
}

/// List all transaction number settings
#[tauri::command]
pub fn list_nomor_settings(state: State<DbState>) -> Result<Vec<NomorSetting>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, tipe, prefix, digit_run, current_number, reset_period FROM nomor_settings ORDER BY tipe ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(NomorSetting {
            id: row.get(0)?,
            tipe: row.get(1)?,
            prefix: row.get(2)?,
            digit_run: row.get(3)?,
            current_number: row.get(4)?,
            reset_period: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Update prefix/digit/reset setting for one transaction type
#[tauri::command]
pub fn update_nomor_setting(
    state: State<DbState>,
    req: UpdateNomorSettingRequest,
) -> Result<(), String> {
    if req.digit_run < 1 || req.digit_run > 12 {
        return Err("Digit nomor harus 1-12".into());
    }
    if !["none", "monthly", "yearly"].contains(&req.reset_period.as_str()) {
        return Err("Reset period tidak valid".into());
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE nomor_settings SET prefix = ?1, digit_run = ?2, reset_period = ?3 WHERE tipe = ?4",
        params![req.prefix, req.digit_run, req.reset_period, req.tipe],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Generate next number for transaction type and increment current_number atomically
#[tauri::command]
pub fn generate_nomor(state: State<DbState>, tipe: String) -> Result<String, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = Local::now();
    let year = now.year();
    let month = now.month() as i64;

    let setting = tx.query_row(
        "SELECT prefix, digit_run, current_number, reset_period, last_reset_year, last_reset_month FROM nomor_settings WHERE tipe = ?1",
        params![tipe],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
        ))
    ).map_err(|_| "Setting nomor tidak ditemukan".to_string())?;

    let (prefix, digit_run, current, reset_period, last_year, last_month) = setting;
    let should_reset = match reset_period.as_str() {
        "monthly" => last_year != year as i64 || last_month != month,
        "yearly" => last_year != year as i64,
        _ => false,
    };
    let next = if should_reset { 1 } else { current + 1 };

    tx.execute(
        "UPDATE nomor_settings SET current_number = ?1, last_reset_year = ?2, last_reset_month = ?3 WHERE tipe = ?4",
        params![next, year, month, tipe],
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!("{}{}{:0width$}", prefix, now.format("%Y%m"), next, width = digit_run as usize))
}
