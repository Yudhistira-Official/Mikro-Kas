use crate::db::DbState;
use crate::logger;
use crate::models::toko::{Toko, TokoInput};
use rusqlite::params;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn get_toko(state: State<DbState>) -> Result<Option<Toko>, String> {
    logger::log("COMMAND: get_toko dipanggil");
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nama_toko, qris_statis, qris_foto_path, created_at, alamat, telepon, email, website, npwp, deskripsi FROM toko WHERE id = 1")
        .map_err(|e| {
            logger::log(&format!("COMMAND: get_toko prepare error = {e}"));
            e.to_string()
        })?;
    let toko = stmt
        .query_row([], |row| {
            Ok(Toko {
                id: row.get(0)?,
                nama_toko: row.get(1)?,
                qris_statis: row.get(2)?,
                qris_foto_path: row.get(3)?,
                created_at: row.get(4)?,
                alamat: row.get(5).ok(),
                telepon: row.get(6).ok(),
                email: row.get(7).ok(),
                website: row.get(8).ok(),
                npwp: row.get(9).ok(),
                deskripsi: row.get(10).ok(),
            })
        })
        .ok();
    logger::log(&format!(
        "COMMAND: get_toko selesai, toko_found = {:?}",
        toko.is_some()
    ));
    Ok(toko)
}

#[tauri::command]
pub fn save_toko(state: State<DbState>, input: TokoInput) -> Result<Toko, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO toko (id, nama_toko, qris_statis, qris_foto_path, alamat, telepon, email, website, npwp, deskripsi)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET nama_toko=excluded.nama_toko, qris_statis=excluded.qris_statis, qris_foto_path=excluded.qris_foto_path, alamat=excluded.alamat, telepon=excluded.telepon, email=excluded.email, website=excluded.website, npwp=excluded.npwp, deskripsi=excluded.deskripsi",
        params![input.nama_toko, input.qris_statis, input.qris_foto_path, input.alamat, input.telepon, input.email, input.website, input.npwp, input.deskripsi],
    )
    .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nama_toko, qris_statis, qris_foto_path, created_at, alamat, telepon, email, website, npwp, deskripsi FROM toko WHERE id = 1")
        .map_err(|e| e.to_string())?;
    stmt.query_row([], |row| {
        Ok(Toko {
            id: row.get(0)?,
            nama_toko: row.get(1)?,
            qris_statis: row.get(2)?,
            qris_foto_path: row.get(3)?,
            created_at: row.get(4)?,
            alamat: row.get(5).ok(),
            telepon: row.get(6).ok(),
            email: row.get(7).ok(),
            website: row.get(8).ok(),
            npwp: row.get(9).ok(),
            deskripsi: row.get(10).ok(),
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_toko_foto(
    app: AppHandle,
    state: State<DbState>,
    foto_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(foto_base64.trim())
        .map_err(|e| format!("Base64 foto tidak valid: {e}"))?;
    if bytes.len() > 2_000_000 {
        return Err("Ukuran gambar QRIS melebihi 2MB".into());
    }
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal akses app_data_dir: {e}"))?;
    let foto_dir = app_dir.join("store_photos");
    std::fs::create_dir_all(&foto_dir).map_err(|e| format!("Gagal buat dir foto: {e}"))?;
    let file_path = foto_dir.join("qris.jpg");
    std::fs::write(&file_path, bytes).map_err(|e| format!("Gagal simpan foto QRIS: {e}"))?;
    let path = file_path.to_string_lossy().to_string();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE toko SET qris_foto_path = ?1 WHERE id = 1", [&path])
        .map_err(|e| format!("Gagal menyimpan path foto QRIS: {e}"))?;
    Ok(path)
}
