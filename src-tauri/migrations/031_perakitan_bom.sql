-- Migration 031: Perakitan & BOM (Bill of Materials)
-- BOM: resep produk rakitan dari komponen lain + biaya tambahan (upah, overhead)
-- Perakitan: proses produksi yang mengurangi stok komponen, tambah stok produk jadi

CREATE TABLE IF NOT EXISTS bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produk_id INTEGER NOT NULL UNIQUE REFERENCES produk(id) ON DELETE CASCADE,
  kode_bom TEXT UNIQUE,
  keterangan TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS bom_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER NOT NULL REFERENCES bom(id) ON DELETE CASCADE,
  komponen_id INTEGER NOT NULL REFERENCES produk(id),
  qty_per_unit REAL NOT NULL DEFAULT 1,
  satuan TEXT,
  UNIQUE(bom_id, komponen_id)
);

CREATE TABLE IF NOT EXISTS bom_biaya (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER NOT NULL REFERENCES bom(id) ON DELETE CASCADE,
  jenis_biaya TEXT NOT NULL,
  nominal INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS perakitan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  bom_id INTEGER NOT NULL REFERENCES bom(id),
  produk_id INTEGER NOT NULL REFERENCES produk(id),
  qty_produksi INTEGER NOT NULL DEFAULT 0,
  total_biaya_bahan INTEGER NOT NULL DEFAULT 0,
  total_biaya_tambahan INTEGER NOT NULL DEFAULT 0,
  total_hpp INTEGER NOT NULL DEFAULT 0,
  gudang_id INTEGER REFERENCES gudang(id) ON DELETE SET NULL,
  catatan TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS perakitan_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  perakitan_id INTEGER NOT NULL REFERENCES perakitan(id) ON DELETE CASCADE,
  komponen_id INTEGER NOT NULL REFERENCES produk(id),
  qty_terpakai REAL NOT NULL DEFAULT 0,
  harga_satuan INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bom_produk ON bom(produk_id);
CREATE INDEX IF NOT EXISTS idx_bom_item_bom ON bom_item(bom_id);
CREATE INDEX IF NOT EXISTS idx_perakitan_bom ON perakitan(bom_id);
CREATE INDEX IF NOT EXISTS idx_perakitan_item_perakitan ON perakitan_item(perakitan_id);
