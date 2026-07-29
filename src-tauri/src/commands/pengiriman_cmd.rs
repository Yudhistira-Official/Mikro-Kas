//! Commands pengiriman — tracking dan resi pengiriman
use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct Pengiriman {
    pub id: i64,
    pub transaksi_id: i64,
    pub alamat_kirim: Option<String>,
    pub kota: Option<String>,
    pub provinsi: Option<String>,
    pub kode_pos: Option<String>,
    pub ekspedisi: Option<String>,
    pub no_resi: Option<String>,
    pub tgl_kirim: Option<String>,
    pub tgl_diterima: Option<String>,
    pub status: String,
    pub catatan: Option<String>,
}

#[tauri::command]
pub fn create_pengiriman(
    state: State<DbState>,
    transaksi_id: i64,
    alamat_kirim: Option<String>,
    kota: Option<String>,
    provinsi: Option<String>,
    kode_pos: Option<String>,
    ekspedisi: Option<String>,
    no_resi: Option<String>,
    catatan: Option<String>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "SELECT id FROM transaksi WHERE id=?1",
        params![transaksi_id],
    )
    .map_err(|_| "Transaksi tidak ditemukan".to_string())?;

    conn.execute(
        "INSERT INTO pengiriman (transaksi_id, alamat_kirim, kota, provinsi, kode_pos, ekspedisi, no_resi, catatan, tgl_kirim)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
        params![transaksi_id, alamat_kirim, kota, provinsi, kode_pos, ekspedisi, no_resi, catatan],
    )
    .map_err(|e| format!("Gagal menyimpan pengiriman: {e}"))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_pengiriman_status(
    state: State<DbState>,
    id: i64,
    status: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let now = if status == "diterima" {
        Some("datetime('now')")
    } else {
        None
    };

    if let Some(time_expr) = now {
        conn.execute(
            &format!(
                "UPDATE pengiriman SET status=?1, tgl_diterima={} WHERE id=?2",
                time_expr
            ),
            params![status, id],
        )
        .map_err(|e| format!("Gagal update status: {e}"))?;
    } else {
        conn.execute(
            "UPDATE pengiriman SET status=?1 WHERE id=?2",
            params![status, id],
        )
        .map_err(|e| format!("Gagal update status: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_pengiriman(
    state: State<DbState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Pengiriman>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let offset = offset.unwrap_or(0).max(0);
    let mut stmt = conn
        .prepare(
            "SELECT id, transaksi_id, alamat_kirim, kota, provinsi, kode_pos, ekspedisi, no_resi,
                    tgl_kirim, tgl_diterima, status, catatan
             FROM pengiriman
             ORDER BY id DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit, offset], |row| {
            Ok(Pengiriman {
                id: row.get(0)?,
                transaksi_id: row.get(1)?,
                alamat_kirim: row.get(2)?,
                kota: row.get(3)?,
                provinsi: row.get(4)?,
                kode_pos: row.get(5)?,
                ekspedisi: row.get(6)?,
                no_resi: row.get(7)?,
                tgl_kirim: row.get(8)?,
                tgl_diterima: row.get(9)?,
                status: row.get(10)?,
                catatan: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }

    Ok(result)
}
