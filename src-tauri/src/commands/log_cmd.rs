//! Command untuk mengakses dan membagikan log aplikasi.
//! Log disimpan di internal storage, bisa disalin ke Downloads.

use crate::db::DbState;
use tauri::State;

/// Baca file log sebagai string untuk ditampilkan di frontend.
#[tauri::command]
pub fn read_log(_state: State<DbState>) -> Result<String, String> {
    crate::logger::read_log()
}

/// Tulis log dari frontend untuk aktivitas, navigasi, dan error JavaScript.
#[tauri::command]
pub fn write_log(msg: String, _state: State<DbState>) {
    crate::logger::write_from_js(&msg);
}

/// Salin log ke folder Downloads publik agar bisa diakses oleh file manager / dikirim,
/// lalu buka secara otomatis menggunakan default text viewer di Android.
#[tauri::command]
pub fn copy_log_to_downloads(
    app: tauri::AppHandle,
    _state: State<DbState>,
) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let dest = crate::logger::copy_to_downloads()?;
    let file_uri = format!("file://{}", dest.to_string_lossy());
    let _ = app.opener().open_url(file_uri, None::<&str>);
    Ok(dest.to_string_lossy().to_string())
}
