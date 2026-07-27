-- Migration 037: Stock opname header + detail tables
-- Header: metadata dokumen opname
-- Detail: snapshot per produk + stok fisik hasil hitung
CREATE TABLE IF NOT EXISTS stock_opname (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT UNIQUE NOT NULL,
  nama_toko TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  petugas TEXT NOT NULL,
  penanggung_jawab TEXT NOT NULL DEFAULT '',
  catatan TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_opname_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opname_id INTEGER NOT NULL REFERENCES stock_opname(id) ON DELETE CASCADE,
  produk_id INTEGER NOT NULL,
  kode_barang TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT '',
  stok_sistem INTEGER NOT NULL,
  stok_fisik INTEGER NOT NULL,
  selisih INTEGER NOT NULL,
  keterangan TEXT NOT NULL DEFAULT ''
);

-- Nomor setting untuk dokumen opname
INSERT OR IGNORE INTO nomor_settings (tipe, prefix, digit_run, current_number, reset_period, last_reset_year, last_reset_month)
VALUES ('opname', 'OPG', 3, 0, 'none', 0, 0);
