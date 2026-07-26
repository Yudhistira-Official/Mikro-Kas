-- Migration 028: Tukar Tambah
-- Customer menukar barang lama dengan barang baru, bayar selisihnya
-- Tracking barang masuk trade-in dan nilai tukarnya

CREATE TABLE IF NOT EXISTS tukar_tambah (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaksi_id INTEGER NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customer(id) ON DELETE SET NULL,
  deskripsi_barang_lama TEXT NOT NULL,
  kondisi TEXT,
  nilai_tukar INTEGER NOT NULL DEFAULT 0,
  produk_baru_id INTEGER REFERENCES produk(id) ON DELETE SET NULL,
  harga_produk_baru INTEGER NOT NULL DEFAULT 0,
  selisih_bayar INTEGER NOT NULL DEFAULT 0,
  catatan TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_tukar_tambah_transaksi ON tukar_tambah(transaksi_id);
CREATE INDEX IF NOT EXISTS idx_tukar_tambah_customer ON tukar_tambah(customer_id);
