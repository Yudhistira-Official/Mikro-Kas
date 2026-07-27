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
pub fn init_db(app_dir: PathBuf) -> Result<Connection, String> {
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
            return Ok(Connection::open_in_memory()
                .expect("In-memory database gagal dibuat — situasi tidak normal"));
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

    ensure_column(&conn, "toko", "alamat", "TEXT");
    ensure_column(&conn, "toko", "telepon", "TEXT");
    ensure_column(&conn, "toko", "email", "TEXT");
    ensure_column(&conn, "toko", "website", "TEXT");
    ensure_column(&conn, "toko", "npwp", "TEXT");
    ensure_column(&conn, "toko", "deskripsi", "TEXT");
    ensure_column(&conn, "customer", "deskripsi_tambahan", "TEXT");
    ensure_column(&conn, "supplier", "deskripsi_tambahan", "TEXT");
    ensure_column(
        &conn,
        "produk",
        "supplier_id",
        "INTEGER REFERENCES supplier(id)",
    );

    match conn.execute_batch(include_str!("../migrations/005_fitur_pos_kasgo.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 005 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 005 gagal/sudah pernah: {e}"),
    }

    // Evolusi kolom ringan untuk gap KasGo Phase 1 & 2.
    // Kolom transaksi menyimpan biaya checkout eksplisit tanpa rebuild CHECK metode_bayar.
    ensure_column(&conn, "transaksi", "pajak_nominal", "INTEGER NOT NULL DEFAULT 0");
    ensure_column(&conn, "transaksi", "biaya_layanan", "INTEGER NOT NULL DEFAULT 0");
    ensure_column(&conn, "transaksi", "ongkir", "INTEGER NOT NULL DEFAULT 0");
    ensure_column(
        &conn,
        "transaksi",
        "supplier_id",
        "INTEGER REFERENCES supplier(id) ON DELETE SET NULL",
    );
    ensure_column(&conn, "produk", "foto_path", "TEXT");
    ensure_column(&conn, "produk", "satuan_multi", "TEXT");
    ensure_column(&conn, "produk", "harga_diskon", "INTEGER NOT NULL DEFAULT 0");
    ensure_column(&conn, "produk", "diskon_berlaku_sampai", "TEXT");

    match conn.execute_batch(include_str!("../migrations/006_hutang_piutang_jatuh_tempo.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 006 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 006 gagal/sudah pernah: {e}"),
    }

    // Gap KasGo Phase 3: piutang/hutang jatuh tempo untuk reminder pembayaran.
    ensure_column(&conn, "hutang_piutang", "jatuh_tempo", "TEXT");

    match conn.execute_batch(include_str!("../migrations/008_pesanan_customer_dp.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 008 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 008 gagal/sudah pernah: {e}"),
    }

    match conn.execute_batch(include_str!("../migrations/009_pembelian_supplier_dp.sql")) {
        Ok(_) => eprintln!("DB_INIT: Migrasi 009 sukses"),
        Err(e) => eprintln!("DB_INIT: Migrasi 009 gagal/sudah pernah: {e}"),
    }

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

    // Migrasi 011: shift management untuk tracking buka/tutup kasir harian.
    let _ = conn.execute_batch(include_str!("../migrations/011_shift_management.sql"));

    // Migrasi 012: PIN kasir untuk keamanan akses checkout.
    let _ = conn.execute_batch(include_str!("../migrations/012_kasir_pin.sql"));

    // Migrasi 013: Limit Kredit Pelanggan.
    let _ = conn.execute_batch(include_str!("../migrations/013_limit_kredit.sql"));

    // Migrasi 014: Catatan Harga Supplier.
    let _ = conn.execute_batch(include_str!("../migrations/014_catatan_harga_supplier.sql"));

    // Migrasi 015: Multi user & role untuk login desktop/kasir.
    let _ = conn.execute_batch(include_str!("../migrations/015_user_role.sql"));
    seed_default_admin(&conn)?;

    // Tabel pertanyaan keamanan untuk fitur lupa password
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS security_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            pertanyaan TEXT NOT NULL,
            jawaban TEXT NOT NULL,
            urutan INTEGER NOT NULL DEFAULT 1,
            UNIQUE(user_id, urutan)
        );"
    );

    let _ = conn.execute_batch(include_str!("../migrations/016_nomor_setting.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/017_pajak_setting.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/019_pengiriman.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/020_master_tambahan.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/021_gudang.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/022_serial.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/023_saldo_awal.sql"));

    // Phase 4-5: Akuntansi, komisi, loyalty, konsinyasi, perakitan, dan HPP batch.
    let _ = conn.execute_batch(include_str!("../migrations/024_coa.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/025_sales_komisi.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/026_point.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/027_deposit.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/028_tukar_tambah.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/029_konsinyasi_masuk.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/030_konsinyasi_keluar.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/031_perakitan_bom.sql"));
    let _ = conn.execute_batch(include_str!("../migrations/032_stok_batch_hpp.sql"));
    ensure_column(&conn, "produk", "metode_hpp", "TEXT NOT NULL DEFAULT 'fifo'");

    eprintln!("DB_INIT: Success");
    Ok(conn)
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

fn seed_default_admin(conn: &Connection) -> Result<(), String> {
    // Check if there's at least one active admin user
    let active_admin_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE is_active = 1 AND role = 'admin'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // If active admin exists, nothing to do
    if active_admin_count > 0 {
        return Ok(());
    }

    let hash = bcrypt::hash("admin", 10).map_err(|e| e.to_string())?;
    
    // Check if 'admin' username exists (regardless of active status)
    let admin_exists: bool = conn
        .query_row("SELECT COUNT(*) FROM users WHERE username = 'admin'", [], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;

    if admin_exists {
        conn.execute(
            "UPDATE users SET is_active = 1, password_hash = ?1 WHERE username = 'admin'",
            rusqlite::params![hash],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params!["admin", hash, "Administrator", "admin"],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::seed_default_admin;
    use bcrypt::verify;
    use rusqlite::{params, Connection};

    fn test_connection_with_users_table() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nama_lengkap TEXT,
                role TEXT NOT NULL DEFAULT 'kasir',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );",
        )
        .unwrap();
        conn
    }

    fn count_users(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
            .unwrap()
    }

    fn count_username(conn: &Connection, username: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1",
            params![username],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn password_hash(conn: &Connection, username: &str) -> String {
        conn.query_row(
            "SELECT password_hash FROM users WHERE username = ?1",
            params![username],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn seeded_admin_fields(conn: &Connection) -> (String, String, i64) {
        conn.query_row(
            "SELECT nama_lengkap, role, is_active FROM users WHERE username = 'admin'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap()
    }

    fn insert_test_user(conn: &Connection, username: &str) {
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            params![username, "test-hash", "Test User", "kasir"],
        )
        .unwrap();
    }

    fn insert_active_user(conn: &Connection, username: &str, role: &str) {
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            params![username, "test-hash", "Test User", role],
        )
        .unwrap();
    }

    #[test]
    fn seeds_default_admin_only_when_users_table_is_empty() {
        let conn = test_connection_with_users_table();
        seed_default_admin(&conn).unwrap();
        assert_eq!(count_users(&conn), 1);
        assert!(verify("admin", &password_hash(&conn, "admin")).unwrap());
        assert_eq!(seeded_admin_fields(&conn), ("Administrator".into(), "admin".into(), 1));
    }

    #[test]
    fn default_admin_seed_is_idempotent_and_non_destructive() {
        let conn = test_connection_with_users_table();
        seed_default_admin(&conn).unwrap();
        let first_hash = password_hash(&conn, "admin");
        seed_default_admin(&conn).unwrap();
        assert_eq!(count_users(&conn), 1);
        assert_eq!(password_hash(&conn, "admin"), first_hash);
    }

    #[test]
    fn existing_active_admin_prevents_default_admin_seed() {
        let conn = test_connection_with_users_table();
        // Insert an active admin
        let hash = bcrypt::hash("custom-pass", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES ('myadmin', ?1, 'My Admin', 'admin', 1)",
            params![hash],
        ).unwrap();
        seed_default_admin(&conn).unwrap();
        assert_eq!(count_users(&conn), 1);
        assert_eq!(count_username(&conn, "admin"), 0);
    }

    #[test]
    fn seeds_admin_when_only_supervisor_active() {
        let conn = test_connection_with_users_table();
        insert_active_user(&conn, "supervisor1", "supervisor");
        seed_default_admin(&conn).unwrap();
        assert_eq!(count_users(&conn), 2);
        assert_eq!(count_username(&conn, "admin"), 1);
        assert!(verify("admin", &password_hash(&conn, "admin")).unwrap());
    }

    #[test]
    fn seeds_admin_when_only_kasir_active() {
        let conn = test_connection_with_users_table();
        insert_active_user(&conn, "kasir1", "kasir");
        seed_default_admin(&conn).unwrap();
        assert_eq!(count_users(&conn), 2);
        assert_eq!(count_username(&conn, "admin"), 1);
        assert!(verify("admin", &password_hash(&conn, "admin")).unwrap());
    }

    #[test]
    fn reactivates_admin_when_no_active_admin_exists() {
        let conn = test_connection_with_users_table();
        // Insert admin but inactive
        let hash = bcrypt::hash("original-pass", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES ('admin', ?1, 'Admin', 'admin', 0)",
            params![hash],
        ).unwrap();
        
        seed_default_admin(&conn).unwrap();
        assert_eq!(count_users(&conn), 1);
        let (_, _, active) = seeded_admin_fields(&conn);
        assert_eq!(active, 1);
        assert!(verify("admin", &password_hash(&conn, "admin")).unwrap());
    }

    #[test]
    fn reactivates_admin_when_active_kasir_but_no_active_admin() {
        let conn = test_connection_with_users_table();
        // Active kasir
        insert_active_user(&conn, "kasir1", "kasir");
        // Inactive admin
        let hash = bcrypt::hash("old-pass", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES ('admin', ?1, 'Admin', 'admin', 0)",
            params![hash],
        ).unwrap();
        
        seed_default_admin(&conn).unwrap();
        assert_eq!(count_users(&conn), 2);
        let (_, _, active) = seeded_admin_fields(&conn);
        assert_eq!(active, 1);
        assert!(verify("admin", &password_hash(&conn, "admin")).unwrap());
    }
}
