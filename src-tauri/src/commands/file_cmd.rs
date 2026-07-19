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
