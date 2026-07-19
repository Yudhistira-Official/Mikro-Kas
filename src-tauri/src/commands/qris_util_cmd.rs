use serde::Serialize;
use tauri::State;

use crate::db::DbState;

#[derive(Debug, Serialize)]
pub struct QrisValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct QrisParseResult {
    pub method: String,
    pub merchant_name: String,
    pub merchant_city: String,
    pub currency: String,
    pub country_code: String,
    pub amount: Option<String>,
    pub merchant_category_code: String,
    pub tip_indicator: Option<String>,
    pub tip_fixed: Option<String>,
    pub tip_percentage: Option<String>,
    pub crc: String,
}

/// Validasi string QRIS — memeriksa format TLV, required tags, CRC16
#[tauri::command]
pub fn validate_qris_string(qris: &str) -> QrisValidationResult {
    match crate::qris::validasi_qris(qris) {
        Ok(_) => QrisValidationResult {
            valid: true,
            errors: vec![],
        },
        Err(e) => QrisValidationResult {
            valid: false,
            errors: vec![e.to_string()],
        },
    }
}

/// Parse metadata dari string QRIS (merchant, currency, dll)
#[tauri::command]
pub fn parse_qris(qris: &str) -> Result<QrisParseResult, String> {
    let meta = crate::qris::parse_metadata(qris).map_err(|e| e.to_string())?;
    Ok(QrisParseResult {
        method: meta.method,
        merchant_name: meta.merchant_name,
        merchant_city: meta.merchant_city,
        currency: meta.currency,
        country_code: meta.country_code,
        amount: meta.amount,
        merchant_category_code: meta.merchant_category_code,
        tip_indicator: meta.tip_indicator,
        tip_fixed: meta.tip_fixed,
        tip_percentage: meta.tip_percentage,
        crc: meta.crc,
    })
}

/// Generate QRIS dinamis dengan nomimal + service fee (opsional)
#[tauri::command]
pub fn generate_qris_with_fee(
    state: State<DbState>,
    nominal: i64,
    fee_fixed: Option<i64>,
    fee_persen: Option<i64>,
    transaksi_id: Option<i64>,
) -> Result<crate::commands::qris_cmd::QrisResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let qris_statis: String = conn
        .query_row("SELECT qris_statis FROM toko WHERE id = 1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "QRIS statis belum diatur. Silakan isi di Pengaturan Toko.".to_string())?;

    let qris_dinamis = crate::qris::konversi_ke_dinamis_dengan_fee(
        &qris_statis,
        nominal as u64,
        fee_fixed.map(|v| v as u64),
        fee_persen.map(|v| v as u64),
    )
    .map_err(|e| e.to_string())?;
    let qr_image_base64 =
        crate::qris::generate_qr_image_base64(&qris_dinamis).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO qris_log (transaksi_id, nominal, qris_dinamis) VALUES (?1, ?2, ?3)",
        rusqlite::params![transaksi_id, nominal, qris_dinamis],
    )
    .map_err(|e| e.to_string())?;

    Ok(crate::commands::qris_cmd::QrisResult {
        qris_dinamis,
        qr_image_base64,
    })
}
