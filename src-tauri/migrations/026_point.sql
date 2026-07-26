-- Migration 026: Point Loyalty System
-- Customer dapat point dari pembelian, bisa ditukar dengan diskon/produk
-- Point setting mengatur konversi Rp -> point dan point -> Rp

CREATE TABLE IF NOT EXISTS point_setting (
  id INTEGER PRIMARY KEY DEFAULT 1,
  rupiah_per_point INTEGER NOT NULL DEFAULT 1000,
  point_per_rupiah REAL NOT NULL DEFAULT 1.0,
  min_transaksi_dapat_point INTEGER NOT NULL DEFAULT 0,
  berlaku_sampai TEXT,
  is_active INTEGER DEFAULT 1,
  CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS point_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  transaksi_id INTEGER REFERENCES transaksi(id) ON DELETE SET NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('earn', 'redeem', 'expire', 'adjust')),
  point INTEGER NOT NULL,
  saldo_sebelum INTEGER NOT NULL DEFAULT 0,
  saldo_sesudah INTEGER NOT NULL DEFAULT 0,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_point_log_customer ON point_log(customer_id);

INSERT OR IGNORE INTO point_setting (id, rupiah_per_point, point_per_rupiah) VALUES (1, 1000, 1.0);
