-- Migration 022: Serial number tracking (IMEI, SN, dll)
CREATE TABLE IF NOT EXISTS serial (id INTEGER PRIMARY KEY AUTOINCREMENT, produk_id INTEGER NOT NULL, serial_number TEXT NOT NULL, gudang_id INTEGER NOT NULL DEFAULT 1, status TEXT DEFAULT 'ready', transaksi_id INTEGER, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (produk_id) REFERENCES produk(id), UNIQUE(produk_id, serial_number));
CREATE INDEX IF NOT EXISTS idx_serial_produk ON serial(produk_id, status);
