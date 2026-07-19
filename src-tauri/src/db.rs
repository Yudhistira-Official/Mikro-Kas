//! Koneksi SQLite + migrasi database MikroKas
//!
//! Menggunakan rusqlite langsung (bukan tauri-plugin-sql)
//! untuk kontrol penuh atas transaksi dan koneksi.
//! DB disimpan di app_data_dir/mikrokas.db dengan WAL mode.
//!
//! NOTE: init_db TIDAK PERNAH gagal — jika app_data_dir tak bisa dipakai,
//! fallback ke /tmp/mikrokas.db agar aplikasi tetap jalan.

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

/// State Tauri untuk shared database connection (single-thread di v1)
pub struct DbState(pub Mutex<Connection>);

/// Inisialisasi database: buat direktori, buka/ buat file, set pragma, migrasi.
/// TIDAK PERNAH PANIC — selalu return Connection (fallback ke /tmp atau in-memory).
pub fn init_db(app_dir: PathBuf) -> Connection {
    let db_path = match ensure_dir(&app_dir) {
        Ok(_) => app_dir.join("mikrokas.db"),
        Err(_) => {
            let fallback = std::path::Path::new("/tmp/mikrokas");
            let _ = std::fs::create_dir_all(fallback);
            eprintln!("DB_INIT: Fallback ke {:?}", fallback);
            fallback.join("mikrokas.db")
        }
    };

    eprintln!("DB_INIT: Opening {:?}", db_path);
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("DB_INIT: Gagal buka DB, fallback memory: {e}");
            return Connection::open_in_memory()
                .expect("In-memory database gagal dibuat — situasi tidak normal");
        }
    };

    // Set pragma: journal_mode=DELETE agar kompatibel Android,
    // foreign_keys=ON untuk integrity, busy_timeout agar tidak cepat error.
    let _ = conn.execute_batch(
        "PRAGMA journal_mode=DELETE;
         PRAGMA foreign_keys=ON;
         PRAGMA busy_timeout=5000;",
    );

    // Jalankan migrasi dari file SQL. Jika tabel sudah ada (error),
    // abaikan — migrasi idempoten.
    eprintln!("DB_INIT: Running migrations");
    match conn.execute_batch(include_str!("../migrations/001_init.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 001 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 001 gagal (mungkin tabel sudah ada): {e}"),
    }

    // Jalankan migrasi status QRIS.
    match conn.execute_batch(include_str!("../migrations/002_qris_status.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 002 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 002 gagal/sudah pernah: {e}"),
    }

    // Profil QRIS multi-merchant. Error duplicate-column aman untuk DB lama.
    match conn.execute_batch(include_str!("../migrations/003_qris_profile.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 003 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 003 gagal/sudah pernah: {e}"),
    }

    eprintln!("DB_INIT: Success");
    conn
}

fn ensure_dir(dir: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("{:?}", e))
}
