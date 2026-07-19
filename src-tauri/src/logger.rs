//! Modul Logging sederhana ke file untuk debugging di HP
//!
//! Log disimpan di app_data_dir/mikrokas_log.txt
//! Bisa disalin ke Downloads lewat command copy_log_to_downloads

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static LOG_FILE_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn log_state() -> &'static Mutex<Option<PathBuf>> {
    LOG_FILE_PATH.get_or_init(|| Mutex::new(None))
}

/// Set path file log. Panggil sekali dari setup().
/// File akan di-truncate (restart baru).
pub fn init_logger(app_dir: PathBuf) {
    let file_path = app_dir.join("mikrokas_log.txt");

    // Header setiap restart
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&file_path)
    {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = writeln!(f, "=== MIKROKAS LOG STARTED AT {} ===\n", now);
    }

    if let Ok(mut guard) = log_state().lock() {
        *guard = Some(file_path);
    }

    // Panic hook → tulis ke log
    let _ = std::panic::take_hook();
    std::panic::set_hook(Box::new(|info| {
        let msg = match info.payload().downcast_ref::<&str>() {
            Some(s) => *s,
            None => info
                .payload()
                .downcast_ref::<String>()
                .map(|s| s.as_str())
                .unwrap_or("unknown panic"),
        };
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".into());
        log(&format!("PANIC at {}: {}", location, msg));
    }));
}

/// Tulis baris log ke file. Thread-safe.
pub fn log(msg: &str) {
    if let Ok(guard) = log_state().lock() {
        if let Some(ref path) = *guard {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let now = chrono::Local::now().format("%H:%M:%S").to_string();
                let _ = writeln!(file, "[{}] {}", now, msg);
            }
        }
    }
}

/// Baca seluruh isi file log sebagai String. Digunakan frontend untuk menampilkan log.
pub fn read_log() -> Result<String, String> {
    if let Ok(guard) = log_state().lock() {
        if let Some(ref path) = *guard {
            return std::fs::read_to_string(path).map_err(|e| format!("Gagal baca log: {e}"));
        }
    }
    Err("Log belum diinisialisasi".to_string())
}

/// Tulis ke log dari frontend (JavaScript → Rust).
pub fn write_from_js(msg: &str) {
    log(&format!("JS: {msg}"));
}

/// Dapatkan path file log saat ini.
pub fn get_log_path() -> Option<PathBuf> {
    if let Ok(guard) = log_state().lock() {
        guard.clone()
    } else {
        None
    }
}

/// Path Downloads publik yang pasti bisa diakses.
/// Gunakan hardcoded path sebagai fallback karena app.path().download_dir()
/// gagal di beberapa versi Android (API 30+ / custom ROM).
pub fn public_downloads_dir() -> PathBuf {
    // Path standar Android untuk folder Downloads publik
    let paths = [
        "/storage/emulated/0/Download",
        "/sdcard/Download",
        "/storage/emulated/0/Downloads",
    ];
    for p in &paths {
        if std::path::Path::new(p).exists() {
            return PathBuf::from(p);
        }
    }
    // Fallback terakhir: gunakan home dir user
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join("Downloads");
    }
    PathBuf::from("/storage/emulated/0/Download")
}

/// Salin log ke Downloads publik agar bisa diakses file manager / dikirim.
pub fn copy_to_downloads() -> Result<PathBuf, String> {
    let src = get_log_path().ok_or("Log belum diinisialisasi")?;
    let dest = public_downloads_dir().join("mikrokas_log.txt");
    std::fs::copy(&src, &dest).map_err(|e| format!("Gagal salin log: {e}"))?;
    Ok(dest)
}
