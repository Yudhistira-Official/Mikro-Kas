-- Migration 027: Deposit Customer
-- Customer bisa top-up saldo deposit, digunakan saat checkout untuk pembayaran
-- Mempercepat transaksi recurring customer tanpa transaksi bank setiap kali

CREATE TABLE IF NOT EXISTS deposit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customer(id) ON DELETE CASCADE,
  saldo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS deposit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL REFERENCES deposit(id) ON DELETE CASCADE,
  tipe TEXT NOT NULL CHECK(tipe IN ('topup', 'usage', 'refund', 'adjust')),
  nominal INTEGER NOT NULL,
  saldo_sebelum INTEGER NOT NULL DEFAULT 0,
  saldo_sesudah INTEGER NOT NULL DEFAULT 0,
  transaksi_id INTEGER REFERENCES transaksi(id) ON DELETE SET NULL,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_deposit_customer ON deposit(customer_id);
CREATE INDEX IF NOT EXISTS idx_deposit_log_deposit ON deposit_log(deposit_id);
