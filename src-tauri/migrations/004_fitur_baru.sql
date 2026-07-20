-- ============================================================
-- Migration 004: Tabel baru — Customer, Supplier, Hutang/Piutang, Cashbox
-- Semua CREATE TABLE IF NOT EXISTS untuk idempotensi
-- ============================================================

-- Customer
CREATE TABLE IF NOT EXISTS customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    telepon TEXT,
    alamat TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Supplier
CREATE TABLE IF NOT EXISTS supplier (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    telepon TEXT,
    alamat TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hutang/Piutang
CREATE TABLE IF NOT EXISTS hutang_piutang (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipe TEXT NOT NULL CHECK (tipe IN ('hutang', 'piutang')),
    kontak_id INTEGER NOT NULL,
    kontak_tipe TEXT NOT NULL CHECK (kontak_tipe IN ('customer', 'supplier')),
    jumlah INTEGER NOT NULL,
    jumlah_bayar INTEGER NOT NULL DEFAULT 0,
    keterangan TEXT,
    status TEXT NOT NULL DEFAULT 'belum_lunas' CHECK (status IN ('belum_lunas', 'lunas')),
    tanggal TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hp_status ON hutang_piutang(status);
CREATE INDEX IF NOT EXISTS idx_hp_tipe ON hutang_piutang(tipe);

-- Cashbox / Saldo kas
CREATE TABLE IF NOT EXISTS cashbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL DEFAULT 'Kas Utama',
    saldo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mutasi cashbox (log perubahan saldo)
CREATE TABLE IF NOT EXISTS cashbox_mutasi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cashbox_id INTEGER NOT NULL REFERENCES cashbox(id),
    tipe TEXT NOT NULL CHECK (tipe IN ('tambah', 'kurang', 'pindah')),
    jumlah INTEGER NOT NULL,
    dari_cashbox_id INTEGER,
    keterangan TEXT,
    tanggal TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cm_cashbox ON cashbox_mutasi(cashbox_id);

-- Insert default cashbox jika belum ada
INSERT OR IGNORE INTO cashbox (id, nama, saldo) VALUES (1, 'Kas Utama', 0);
