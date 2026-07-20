// ============================================================
// file_cmd.rs — Perintah PDF MikroKas.
// Flow: JS generate PDF (jsPDF) -> base64 -> Rust decode -> tulis ke
//       cache -> buka via viewer default user.
// File bersifat temporary di cache, tidak perlu user simpan manual.
//
// Android: PdfOpenerPlugin.kt -> FileProvider -> content:// URI
// Desktop: tauri-plugin-opener -> open_url(file://...)
// ============================================================

use crate::db::DbState;
use base64::Engine;
use tauri::{Manager, State};

/// Simpan PDF sementara di cache dan buka via viewer default user.
/// PDF bersifat temporary — generated dari data JSON tersimpan,
/// user hanya melihat tanpa perlu menyimpan manual.
#[tauri::command]
pub fn simpan_pdf(
    app: tauri::AppHandle,
    _state: State<DbState>,
    pdf_base64: String,
    nama_file: String,
) -> Result<String, String> {
    // Validasi nama file — hanya alphanumeric, dot, underscore, dash
    let safe_name = nama_file
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect::<String>();
    if safe_name.is_empty() || !safe_name.ends_with(".pdf") {
        return Err("Nama file PDF tidak valid".into());
    }

    // Decode base64 PDF dari frontend (jsPDF output)
    let encoded = pdf_base64
        .split_once("base64,")
        .map_or(pdf_base64.as_str(), |(_, v)| v);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Gagal decode PDF: {e}"))?;

    // Tulis ke cache dir (bukan app_data_dir) agar FileProvider bisa share.
    // file_paths.xml: <cache-path name="exports_cache" path="exports" />
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Gagal menentukan cache dir: {e}"))?
        .join("exports");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("Gagal buat direktori: {e}"))?;
    let file_path = cache_dir.join(&safe_name);
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Gagal tulis PDF: {e}"))?;

    let path_str = file_path.to_string_lossy().into_owned();

    // Android: buka via PdfOpenerPlugin (FileProvider + content:// + FLAG_GRANT_READ_URI_PERMISSION)
    #[cfg(target_os = "android")]
    {
        use crate::pdf_plugin::PdfOpener;
        let pdf_opener = app.state::<PdfOpener<tauri::Wry>>();
        let _: serde_json::Value = pdf_opener
            .handle
            .run_mobile_plugin("openPdf", serde_json::json!({"path": &path_str}))
            .map_err(|e| format!("Gagal buka PDF: {e}"))?;
        return Ok(path_str);
    }

    // Desktop: buka via tauri-plugin-opener (file:// URI)
    #[cfg(not(target_os = "android"))]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(format!("file://{path_str}"), None::<&str>)
            .map_err(|e| format!("Gagal buka PDF: {e}"))?;
        return Ok(path_str);
    }
}

/// Backup database SQLite ke file cache export. Return path agar user bisa share/salin.
#[tauri::command]
pub fn backup_database(app: tauri::AppHandle, _state: State<DbState>) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Gagal cache dir: {e}"))?
        .join("exports");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("Gagal buat folder backup: {e}"))?;
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let target = cache_dir.join(format!("mikrokas_backup_{stamp}.db"));
    copy_database_to(app, target)
}

/// Backup database SQLite ke lokasi yang dipilih user dari dialog native.
/// Validasi minimal: ekstensi .db dan parent folder sudah ada.
#[tauri::command]
pub fn backup_database_to(
    app: tauri::AppHandle,
    _state: State<DbState>,
    target_path: String,
) -> Result<String, String> {
    let mut target = std::path::PathBuf::from(target_path);
    if target.extension().and_then(|e| e.to_str()) != Some("db") {
        target.set_extension("db");
    }
    let parent = target.parent().ok_or("Lokasi backup tidak valid")?;
    if !parent.exists() {
        return Err("Folder tujuan backup tidak ditemukan".into());
    }
    copy_database_to(app, target)
}

/// Helper copy DB agar command cache lama dan dialog native berbagi logika.
fn copy_database_to(app: tauri::AppHandle, target: std::path::PathBuf) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal app data dir: {e}"))?;
    let db_path = app_dir.join("mikrokas.db");
    if !db_path.exists() {
        return Err("Database belum ada".into());
    }
    std::fs::copy(&db_path, &target).map_err(|e| format!("Gagal backup DB: {e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

/// Restore database dari path file backup. App perlu direstart setelah restore.
#[tauri::command]
pub fn restore_database(
    app: tauri::AppHandle,
    _state: State<DbState>,
    backup_path: String,
) -> Result<(), String> {
    let source = std::path::PathBuf::from(backup_path);
    if !source.exists() {
        return Err("File backup tidak ditemukan".into());
    }
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal app data dir: {e}"))?;
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Gagal buat app dir: {e}"))?;
    let db_path = app_dir.join("mikrokas.db");
    std::fs::copy(&source, &db_path).map_err(|e| format!("Gagal restore DB: {e}"))?;
    Ok(())
}
