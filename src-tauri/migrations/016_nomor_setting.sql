-- Migration 016: Pengaturan nomor transaksi otomatis
-- Prefix + auto-increment per tipe, reset bulanan/tahunan/none
CREATE TABLE IF NOT EXISTS nomor_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipe TEXT UNIQUE NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  digit_run INTEGER NOT NULL DEFAULT 4,
  current_number INTEGER NOT NULL DEFAULT 0,
  reset_period TEXT NOT NULL DEFAULT 'none',
  last_reset_year INTEGER DEFAULT 0,
  last_reset_month INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO nomor_settings (tipe, prefix, digit_run, reset_period) VALUES
  ('jual', 'INV', 4, 'monthly'),
  ('beli', 'BELI', 4, 'monthly'),
  ('retur_jual', 'RET', 4, 'monthly'),
  ('retur_beli', 'RETB', 4, 'monthly'),
  ('pesanan', 'PO', 4, 'monthly');
