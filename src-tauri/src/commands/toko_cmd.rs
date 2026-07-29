use crate::db::DbState;
use crate::logger;
use crate::models::toko::{Toko, TokoInput};
use rusqlite::params;
use tauri::{AppHandle, Manager, State};

fn ensure_toko_logo(conn: &rusqlite::Connection) {
    crate::db::ensure_column(conn, "toko", "logo_path", "TEXT");
}

fn map_toko(row: &rusqlite::Row<'_>) -> rusqlite::Result<Toko> {
    Ok(Toko {
        id: row.get(0)?,
        nama_toko: row.get(1)?,
        qris_statis: row.get(2)?,
        qris_foto_path: row.get(3)?,
        logo_path: row.get(4).ok().flatten(),
        created_at: row.get(5)?,
        alamat: row.get(6).ok(),
        telepon: row.get(7).ok(),
        email: row.get(8).ok(),
        website: row.get(9).ok(),
        npwp: row.get(10).ok(),
        deskripsi: row.get(11).ok(),
    })
}

const TOKO_SELECT: &str = "SELECT id, nama_toko, qris_statis, qris_foto_path, logo_path, created_at,
        alamat, telepon, email, website, npwp, deskripsi
     FROM toko WHERE id = 1";

#[tauri::command]
pub fn get_toko(state: State<DbState>) -> Result<Option<Toko>, String> {
    logger::log("COMMAND: get_toko dipanggil");
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_toko_logo(&conn);
    let mut stmt = conn.prepare(TOKO_SELECT).map_err(|e| {
        logger::log(&format!("COMMAND: get_toko prepare error = {e}"));
        e.to_string()
    })?;
    let toko = stmt.query_row([], map_toko).ok();
    logger::log(&format!(
        "COMMAND: get_toko selesai, toko_found = {:?}",
        toko.is_some()
    ));
    Ok(toko)
}

#[tauri::command]
pub fn save_toko(state: State<DbState>, input: TokoInput) -> Result<Toko, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_toko_logo(&conn);
    conn.execute(
        "INSERT INTO toko (id, nama_toko, qris_statis, qris_foto_path, logo_path, alamat, telepon, email, website, npwp, deskripsi)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           nama_toko=excluded.nama_toko,
           qris_statis=excluded.qris_statis,
           qris_foto_path=excluded.qris_foto_path,
           logo_path=COALESCE(excluded.logo_path, toko.logo_path),
           alamat=excluded.alamat,
           telepon=excluded.telepon,
           email=excluded.email,
           website=excluded.website,
           npwp=excluded.npwp,
           deskripsi=excluded.deskripsi",
        params![
            input.nama_toko,
            input.qris_statis,
            input.qris_foto_path,
            input.logo_path,
            input.alamat,
            input.telepon,
            input.email,
            input.website,
            input.npwp,
            input.deskripsi
        ],
    )
    .map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(TOKO_SELECT).map_err(|e| e.to_string())?;
    stmt.query_row([], map_toko)
        .map_err(|e| format!("Gagal membaca toko: {e}"))
}

/// Simpan gambar QRIS toko (base64, tanpa prefix data-URL).
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

/// Simpan logo perusahaan (base64). Dipakai di Data Perusahaan & Login.
#[tauri::command]
pub fn save_toko_logo(
    app: AppHandle,
    state: State<DbState>,
    foto_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(foto_base64.trim())
        .map_err(|e| format!("Base64 logo tidak valid: {e}"))?;
    if bytes.is_empty() {
        return Err("File logo kosong".into());
    }
    if bytes.len() > 2_000_000 {
        return Err("Ukuran logo maksimal 2MB".into());
    }
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal akses app_data_dir: {e}"))?;
    let foto_dir = app_dir.join("store_photos");
    std::fs::create_dir_all(&foto_dir).map_err(|e| format!("Gagal buat dir logo: {e}"))?;
    // Deteksi ekstensi sederhana dari magic bytes
    let ext = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png"
    } else if bytes.starts_with(&[0x47, 0x49, 0x46]) {
        "gif"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        "jpg"
    };
    let file_path = foto_dir.join(format!("logo.{ext}"));
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Gagal simpan logo: {e}"))?;
    let path = file_path.to_string_lossy().to_string();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_toko_logo(&conn);
    // Pastikan baris toko ada
    let _ = conn.execute(
        "INSERT INTO toko (id, nama_toko) VALUES (1, 'Toko')
         ON CONFLICT(id) DO NOTHING",
        [],
    );
    conn.execute("UPDATE toko SET logo_path = ?1 WHERE id = 1", [&path])
        .map_err(|e| format!("Gagal menyimpan path logo: {e}"))?;
    Ok(path)
}

/// Hapus logo perusahaan (file + kolom DB).
#[tauri::command]
pub fn clear_toko_logo(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_toko_logo(&conn);
    let path: Option<String> = conn
        .query_row("SELECT logo_path FROM toko WHERE id = 1", [], |row| row.get(0))
        .ok()
        .flatten();
    if let Some(p) = path {
        let _ = std::fs::remove_file(&p);
    }
    conn.execute("UPDATE toko SET logo_path = NULL WHERE id = 1", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}
