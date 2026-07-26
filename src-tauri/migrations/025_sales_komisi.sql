-- Migration 025: Sales dan Komisi
-- Tracking sales representatives dan komisi yang terutang per item terjual
-- Komisi bisa dihitung per produk atau per transaksi sesuai setting

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  kode TEXT UNIQUE,
  telepon TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS komisi_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaksi_item_id INTEGER NOT NULL REFERENCES transaksi_item(id) ON DELETE CASCADE,
  sales_id INTEGER NOT NULL REFERENCES sales(id),
  produk_id INTEGER NOT NULL REFERENCES produk(id),
  qty INTEGER NOT NULL,
  harga_satuan INTEGER NOT NULL,
  persen_komisi REAL NOT NULL DEFAULT 0,
  nominal_komisi INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(transaksi_item_id, sales_id)
);

CREATE TABLE IF NOT EXISTS komisi_terutang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_id INTEGER NOT NULL REFERENCES sales(id),
  periode TEXT NOT NULL,
  total_komisi INTEGER NOT NULL DEFAULT 0,
  sudah_dibayar INTEGER NOT NULL DEFAULT 0,
  sisa INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_komisi_item_sales ON komisi_item(sales_id);
CREATE INDEX IF NOT EXISTS idx_komisi_terutang_sales ON komisi_terutang(sales_id, periode);
