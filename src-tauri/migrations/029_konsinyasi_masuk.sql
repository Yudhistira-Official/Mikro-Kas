-- Migration 029: Konsinyasi Masuk
-- Terima barang konsinyasi dari supplier, bayar setelah terjual
-- Stok tidak didebit dari modal awal, hanya dicatat quantity

CREATE TABLE IF NOT EXISTS konsinyasi_masuk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  supplier_id INTEGER REFERENCES supplier(id) ON DELETE SET NULL,
  total_item INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'aktif' CHECK(status IN ('aktif', 'selesai', 'retur')),
  catatan TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS konsinyasi_masuk_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  konsinyasi_masuk_id INTEGER NOT NULL REFERENCES konsinyasi_masuk(id) ON DELETE CASCADE,
  produk_id INTEGER NOT NULL REFERENCES produk(id),
  qty_masuk INTEGER NOT NULL DEFAULT 0,
  qty_terjual INTEGER NOT NULL DEFAULT 0,
  qty_sisa INTEGER NOT NULL DEFAULT 0,
  harga_beli_kesepakatan INTEGER NOT NULL DEFAULT 0,
  harga_jual_disarankan INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_konsinyasi_masuk_supplier ON konsinyasi_masuk(supplier_id);
CREATE INDEX IF NOT EXISTS idx_konsinyasi_masuk_item_konsinyasi ON konsinyasi_masuk_item(konsinyasi_masuk_id);
