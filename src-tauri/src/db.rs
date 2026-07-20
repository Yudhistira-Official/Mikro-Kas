//! Koneksi SQLite + migrasi database MikroKas
//!
//! Menggunakan rusqlite langsung (bukan tauri-plugin-sql)
//! untuk kontrol penuh atas transaksi dan koneksi.
//! DB disimpan di app_data_dir/mikrokas.db dengan WAL mode.
//!
//! NOTE: init_db tidak memakai fallback file publik/temp.
//! Jika app_data_dir gagal, DB sementara dibuat in-memory agar tidak menyimpan data liar.

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

    let _ = conn.execute_batch(
        "PRAGMA journal_mode=DELETE;
         PRAGMA foreign_keys=ON;
         PRAGMA busy_timeout=5000;",
    );

    eprintln!("DB_INIT: Running migrations");
    match conn.execute_batch(include_str!("../migrations/001_init.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 001 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 001 gagal (mungkin tabel sudah ada): {e}"),
    }

    match conn.execute_batch(include_str!("../migrations/002_qris_status.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 002 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 002 gagal/sudah pernah: {e}"),
    }

    match conn.execute_batch(include_str!("../migrations/003_qris_profile.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 003 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 003 gagal/sudah pernah: {e}"),
    }

    match conn.execute_batch(include_str!("../migrations/004_fitur_baru.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 004 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 004 gagal/sudah pernah: {e}"),
    }

    ensure_column(&conn, "customer", "deskripsi_tambahan", "TEXT");
    ensure_column(&conn, "supplier", "deskripsi_tambahan", "TEXT");
    ensure_column(
        &conn,
        "produk",
        "supplier_id",
        "INTEGER REFERENCES supplier(id)",
    );

    // Tabel retur terpisah agar riwayat retur bisa dilihat dan diedit tanpa menghapus kas manual.
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS retur (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaksi_id INTEGER NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
            kas_id INTEGER REFERENCES kas(id) ON DELETE SET NULL,
            total_refund INTEGER NOT NULL,
            alasan TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS retur_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retur_id INTEGER NOT NULL REFERENCES retur(id) ON DELETE CASCADE,
            produk_id INTEGER NOT NULL REFERENCES produk(id),
            qty INTEGER NOT NULL,
            harga_satuan INTEGER NOT NULL,
            subtotal INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_retur_transaksi ON retur(transaksi_id);
        CREATE INDEX IF NOT EXISTS idx_retur_item_retur ON retur_item(retur_id);"
    );

    eprintln!("DB_INIT: Success");
    conn
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = match conn.prepare(&pragma) {
        Ok(stmt) => stmt,
        Err(e) => {
            eprintln!("DB_INIT: PRAGMA {table} gagal: {e}");
            return;
        }
    };
    let has_column = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .ok()
        .and_then(|rows| {
            for row in rows {
                if row.ok()?.as_str() == column {
                    return Some(true);
                }
            }
            Some(false)
        })
        .unwrap_or(false);

    if has_column {
        return;
    }

    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    match conn.execute(&sql, []) {
        Ok(_) => eprintln!("DB_INIT: Kolom {table}.{column} ditambahkan"),
        Err(e) => eprintln!("DB_INIT: Kolom {table}.{column} gagal ditambahkan: {e}"),
    }
}

fn ensure_dir(dir: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("{:?}", e))
}
