// ============================================================
// pdf_plugin.rs — Tauri plugin wrapper untuk PdfOpenerPlugin Android.
// Mendaftarkan Kotlin PdfOpenerPlugin sebagai Tauri native plugin
// agar Rust bisa membuka PDF via FileProvider + content:// URI.
// ============================================================

//! Plugin Rust wrapper untuk PdfOpenerPlugin Android.
//! Flow: Rust -> PluginHandle::run_mobile_plugin -> Kotlin openPdf()
//!       -> FileProvider.getUriForFile -> content:// URI
//!       -> ACTION_VIEW + FLAG_GRANT_READ_URI_PERMISSION -> viewer default.

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::Runtime;

/// State plugin PDF opener. Menyimpan PluginHandle ke Kotlin PdfOpenerPlugin.
/// Hanya aktif di Android; di desktop plugin init no-op.
#[cfg(target_os = "android")]
pub struct PdfOpener<R: Runtime> {
    pub handle: tauri::plugin::PluginHandle<R>,
}

/// Init plugin yang mendaftarkan PdfOpenerPlugin Kotlin di Android.
/// Di desktop, init no-op (tidak ada state PdfOpener).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("pdf-opener")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    _api.register_android_plugin("com.yudhis.mikrokas", "PdfOpenerPlugin")?;
                _app.manage(PdfOpener { handle });
            }
            Ok(())
        })
        .build()
}
