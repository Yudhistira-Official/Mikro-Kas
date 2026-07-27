//! Commands pricing — multi-tier discount dan harga jual calculation
use crate::db::DbState;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn hitung_diskon_bertingkat(harga: f64, lapisan: Vec<f64>) -> Result<f64, String> {
    let mut current = harga;
    for persen in lapisan {
        if persen < 0.0 || persen > 100.0 {
            return Err("Persentase diskon harus 0-100".into());
        }
        current = current * (1.0 - persen / 100.0);
    }
    Ok(current)
}

#[tauri::command]
pub fn get_harga_jual(
    state: State<DbState>,
    produk_id: i64,
    _qty: Option<i64>,
    _level_id: Option<i64>,
    satuan: Option<String>,
) -> Result<f64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let (harga_base, satuan_multi): (i64, Option<String>) = conn
        .query_row(
            "SELECT harga_jual, satuan_multi FROM produk WHERE id=?1 AND is_active=1",
            params![produk_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Produk tidak ditemukan".to_string())?;

    let mut harga = harga_base as f64;

    if let Some(unit) = satuan.as_deref().filter(|s| !s.trim().is_empty()) {
        if let Some(multi_json) = satuan_multi {
            let rules: Vec<SatuanRule> = serde_json::from_str(&multi_json)
                .map_err(|_| "JSON satuan_multi tidak valid".to_string())?;
            if let Some(rule) = rules.iter().find(|r| r.satuan.eq_ignore_ascii_case(unit)) {
                harga = rule.harga_jual as f64;
            }
        }
    }

    Ok(harga)
}

#[derive(serde::Deserialize)]
struct SatuanRule {
    satuan: String,
    harga_jual: i64,
}
