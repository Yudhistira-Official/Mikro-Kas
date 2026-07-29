-- Migration 041: multi-SKU/barcode per produk
-- Satu produk boleh punya banyak barcode (warna/varian barcode beda).
-- produk.sku tetap SKU utama (pertama) untuk tampilan kasir.
CREATE TABLE IF NOT EXISTS produk_sku (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produk_id INTEGER NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_produk_sku_produk ON produk_sku(produk_id);
