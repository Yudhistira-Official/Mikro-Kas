-- Migration 030: Konsinyasi Keluar
-- Kirim barang konsinyasi ke reseller/toko lain, terima bayaran setelah terjual
-- Stok keluar dari inventori, tracking settlement pembayaran

CREATE TABLE IF NOT EXISTS konsinyasi_keluar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  penerima_nama TEXT NOT NULL,
  penerima_telepon TEXT,
  total_item INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'aktif' CHECK(status IN ('aktif', 'selesai', 'retur')),
  catatan TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS konsinyasi_keluar_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  konsinyasi_keluar_id INTEGER NOT NULL REFERENCES konsinyasi_keluar(id) ON DELETE CASCADE,
  produk_id INTEGER NOT NULL REFERENCES produk(id),
  qty_keluar INTEGER NOT NULL DEFAULT 0,
  qty_terjual INTEGER NOT NULL DEFAULT 0,
  qty_kembali INTEGER NOT NULL DEFAULT 0,
  harga_jual_kesepakatan INTEGER NOT NULL DEFAULT 0,
  harga_modal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_konsinyasi_keluar_penerima ON konsinyasi_keluar(penerima_nama);
CREATE INDEX IF NOT EXISTS idx_konsinyasi_keluar_item_konsinyasi ON konsinyasi_keluar_item(konsinyasi_keluar_id);
