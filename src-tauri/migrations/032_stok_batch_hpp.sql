-- Migration 032: Stok Batch & Metode HPP
-- stok_batch: tracking batch masuk per pembelian/perakitan untuk FIFO/LIFO
-- produk.metode_hpp: pilihan metode perhitungan HPP per produk

CREATE TABLE IF NOT EXISTS stok_batch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
  gudang_id INTEGER REFERENCES gudang(id) ON DELETE SET NULL,
  tgl_masuk TEXT NOT NULL,
  qty_masuk INTEGER NOT NULL DEFAULT 0,
  qty_terpakai INTEGER NOT NULL DEFAULT 0,
  qty_sisa INTEGER NOT NULL DEFAULT 0,
  harga_beli INTEGER NOT NULL DEFAULT 0,
  ref_tabel TEXT,
  ref_id INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_stok_batch_produk ON stok_batch(produk_id, tgl_masuk);
CREATE INDEX IF NOT EXISTS idx_stok_batch_gudang ON stok_batch(gudang_id);
