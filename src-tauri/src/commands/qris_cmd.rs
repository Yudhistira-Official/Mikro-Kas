//! Commands QRIS: generate, cek status, konfirmasi pembayaran.
//! status: pending → dibayar (manual konfirmasi) / expired (kadaluarsa)

use crate::db::DbState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct QrisResult {
    pub qris_dinamis: String,
    pub qr_image_base64: String,
}

#[derive(Debug, Serialize)]
pub struct QrisLogEntry {
    pub id: i64,
    pub transaksi_id: Option<i64>,
    pub profile_id: Option<i64>,
    pub profile_nama: Option<String>,
    pub nominal: i64,
    pub qris_dinamis: String,
    pub status: String,
    pub created_at: String,
}

/// Generate QRIS dinamis dari profil aktif atau profil tertentu.
/// Simpan log dengan status 'pending'.
#[tauri::command]
pub fn generate_qris_dinamis(
    state: State<DbState>,
    nominal: i64,
    transaksi_id: Option<i64>,
    profile_id: Option<i64>,
) -> Result<QrisResult, String> {
    if nominal <= 0 {
        return Err("Nominal harus lebih besar dari nol".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let (qris_statis, profile_id): (String, i64) = if let Some(id) = profile_id {
        conn.query_row(
            "SELECT qris_statis, id FROM qris_profile WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Profil QRIS id={id} tidak ditemukan"))?
    } else {
        conn.query_row(
            "SELECT qris_statis, id FROM qris_profile WHERE is_active = 1 LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Belum ada profil QRIS aktif. Buat di Atur QRIS.".to_string())?
    };

    let qris_dinamis = crate::qris::konversi_ke_dinamis(&qris_statis, nominal as u64)
        .map_err(|e| e.to_string())?;
    let qr_image_base64 =
        crate::qris::generate_qr_image_base64(&qris_dinamis).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO qris_log (transaksi_id, profile_id, nominal, qris_dinamis, status) VALUES (?1, ?2, ?3, ?4, 'pending')",
        rusqlite::params![transaksi_id, profile_id, nominal, qris_dinamis],
    )
    .map_err(|e| e.to_string())?;

    Ok(QrisResult {
        qris_dinamis,
        qr_image_base64,
    })
}

/// Daftar histori QRIS termasuk status pembayaran
#[tauri::command]
pub fn list_qris_log(
    state: State<DbState>,
    limit: Option<i64>,
) -> Result<Vec<QrisLogEntry>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let limit_val = limit.unwrap_or(20);
    let sql = format!(
        "SELECT ql.id, ql.transaksi_id, ql.profile_id, qp.nama, ql.nominal,
                ql.qris_dinamis, ql.status, ql.created_at
         FROM qris_log ql LEFT JOIN qris_profile qp ON ql.profile_id = qp.id
         ORDER BY ql.created_at DESC LIMIT {}",
        limit_val
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(QrisLogEntry {
                id: row.get(0)?,
                transaksi_id: row.get(1)?,
                profile_id: row.get(2)?,
                profile_nama: row.get(3)?,
                nominal: row.get(4)?,
                qris_dinamis: row.get(5)?,
                status: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Cek status QRIS berdasarkan id log
#[tauri::command]
pub fn cek_status_qris(state: State<DbState>, qris_log_id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let status: String = conn
        .query_row(
            "SELECT status FROM qris_log WHERE id = ?1",
            rusqlite::params![qris_log_id],
            |row| row.get(0),
        )
        .map_err(|_| "QRIS log tidak ditemukan".to_string())?;
    Ok(status)
}

/// Konfirmasi QRIS telah dibayar (manual oleh user/kasir)
#[tauri::command]
pub fn konfirmasi_bayar_qris(state: State<DbState>, qris_log_id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute(
            "UPDATE qris_log SET status = 'dibayar' WHERE id = ?1 AND status = 'pending'",
            rusqlite::params![qris_log_id],
        )
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err("QRIS sudah dikonfirmasi sebelumnya atau tidak ditemukan".into());
    }
    Ok("dibayar".into())
}

/// Tandai QRIS sebagai expired (kadaluarsa)
#[tauri::command]
pub fn expire_qris(state: State<DbState>, qris_log_id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE qris_log SET status = 'expired' WHERE id = ?1 AND status = 'pending'",
        rusqlite::params![qris_log_id],
    )
    .map_err(|e| e.to_string())?;
    Ok("expired".into())
}

/// Hapus semua riwayat QRIS yang sudah berbeda hari (bukan hari ini).
/// Dipanggil tiap kali halaman QRIS dibuka agar riwayat selalu hanya hari ini.
#[tauri::command]
pub fn prune_old_qris_logs(state: State<DbState>) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let deleted = conn
        .execute(
            "DELETE FROM qris_log WHERE date(created_at) < date('now')",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(deleted)
}
