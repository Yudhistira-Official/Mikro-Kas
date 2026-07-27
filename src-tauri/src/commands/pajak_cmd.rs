use crate::db::DbState;
/// PPN (Pajak Pertambahan Nilai) settings and calculation
/// Modes: non (0%), exclude (added on top), include (extracted from price)
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct PajakSetting {
    pub ppn_mode: String, // "non", "exclude", "include"
    pub ppn_persen: f64,
}

#[derive(Debug, Serialize)]
pub struct PpnResult {
    pub ppn_amount: f64,
    pub taxable_amount: f64,
    pub grand_total: f64,
}

/// Get current PPN setting
#[tauri::command]
pub fn get_pajak_setting(state: State<DbState>) -> Result<PajakSetting, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT ppn_mode, ppn_persen FROM pajak_setting WHERE id = 1",
        [],
        |row| {
            Ok(PajakSetting {
                ppn_mode: row.get(0)?,
                ppn_persen: row.get(1)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Update PPN mode and rate
#[tauri::command]
pub fn update_pajak_setting(
    state: State<DbState>,
    ppn_mode: String,
    ppn_persen: f64,
) -> Result<(), String> {
    if !["non", "exclude", "include"].contains(&ppn_mode.as_str()) {
        return Err("Mode PPN tidak valid (non/exclude/include)".into());
    }
    if ppn_persen < 0.0 || ppn_persen > 100.0 {
        return Err("PPN persen harus 0-100".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE pajak_setting SET ppn_mode = ?1, ppn_persen = ?2, updated_at = datetime('now') WHERE id = 1",
        params![ppn_mode, ppn_persen],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Calculate PPN from subtotal based on current setting
/// - non: ppn=0
/// - exclude: ppn = subtotal_taxable * persen/100 (added on top)
/// - include: ppn = subtotal_taxable - subtotal_taxable/(1+persen/100) (extracted)
#[tauri::command]
pub fn hitung_ppn(state: State<DbState>, subtotal_taxable: f64) -> Result<PpnResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let setting = conn
        .query_row(
            "SELECT ppn_mode, ppn_persen FROM pajak_setting WHERE id = 1",
            [],
            |row| {
                Ok(PajakSetting {
                    ppn_mode: row.get(0)?,
                    ppn_persen: row.get(1)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let (ppn_amount, grand_total) = match setting.ppn_mode.as_str() {
        "exclude" => {
            let ppn = subtotal_taxable * (setting.ppn_persen / 100.0);
            (ppn, subtotal_taxable + ppn)
        }
        "include" => {
            let ppn = subtotal_taxable - subtotal_taxable / (1.0 + setting.ppn_persen / 100.0);
            (ppn, subtotal_taxable)
        }
        _ => (0.0, subtotal_taxable), // "non"
    };

    Ok(PpnResult {
        ppn_amount,
        taxable_amount: subtotal_taxable,
        grand_total,
    })
}
