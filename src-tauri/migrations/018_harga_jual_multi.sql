-- Migration 018: Multi harga jual + diskon bertingkat
CREATE TABLE IF NOT EXISTS level_pelanggan (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, diskon_persen REAL DEFAULT 0, harga_override INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS harga_jual (id INTEGER PRIMARY KEY AUTOINCREMENT, produk_id INTEGER NOT NULL, tipe TEXT NOT NULL, qty_min REAL, qty_max REAL, level_id INTEGER, satuan TEXT, harga REAL NOT NULL, FOREIGN KEY (produk_id) REFERENCES produk(id), FOREIGN KEY (level_id) REFERENCES level_pelanggan(id));
-- Tambah kolom kena_pajak pada produk
-- Default 1 (true), 0 = tidak kena PPN
ALTER TABLE produk ADD COLUMN IF NOT EXISTS kena_pajak INTEGER DEFAULT 1;

-- Tambah kolom diskon_lapisan JSON untuk diskon bertingkat (10+5+2)
-- Format: [10, 5, 2] = diskon 10%, lalu 5%, lalu 2%
ALTER TABLE produk ADD COLUMN IF NOT EXISTS diskon_lapisan TEXT DEFAULT '[]';
