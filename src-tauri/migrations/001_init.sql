-- ============================================================
-- MikroKas — Migration 001: Initial Schema
-- Semua nominal rupiah INTEGER (bukan REAL) hindari float error
-- ============================================================

-- Toko: single-row (id=1)
CREATE TABLE IF NOT EXISTS toko (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nama_toko TEXT NOT NULL,
    qris_statis TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kategori produk
CREATE TABLE IF NOT EXISTS kategori (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL UNIQUE
);

-- Produk
CREATE TABLE IF NOT EXISTS produk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kategori_id INTEGER REFERENCES kategori(id) ON DELETE SET NULL,
    nama TEXT NOT NULL,
    sku TEXT UNIQUE,
    satuan TEXT NOT NULL DEFAULT 'pcs',
    harga_beli INTEGER NOT NULL DEFAULT 0,
    harga_jual INTEGER NOT NULL,
    stok INTEGER NOT NULL DEFAULT 0,
    stok_minimum INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produk_kategori ON produk(kategori_id);
CREATE INDEX IF NOT EXISTS idx_produk_active ON produk(is_active);

-- Transaksi header
CREATE TABLE IF NOT EXISTS transaksi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipe TEXT NOT NULL CHECK (tipe IN ('penjualan', 'pembelian')),
    total INTEGER NOT NULL,
    metode_bayar TEXT NOT NULL DEFAULT 'tunai' CHECK (metode_bayar IN ('tunai', 'qris', 'transfer', 'lainnya')),
    catatan TEXT,
    tanggal TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transaksi_tipe_tanggal ON transaksi(tipe, tanggal);

-- Transaksi item (detail baris)
CREATE TABLE IF NOT EXISTS transaksi_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaksi_id INTEGER NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
    produk_id INTEGER NOT NULL REFERENCES produk(id),
    qty INTEGER NOT NULL,
    harga_satuan INTEGER NOT NULL,
    subtotal INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_titem_transaksi ON transaksi_item(transaksi_id);
CREATE INDEX IF NOT EXISTS idx_titem_produk ON transaksi_item(produk_id);

-- Kas manual (pemasukan/pengeluaran non-transaksi produk)
CREATE TABLE IF NOT EXISTS kas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipe TEXT NOT NULL CHECK (tipe IN ('pemasukan', 'pengeluaran')),
    kategori TEXT NOT NULL,
    jumlah INTEGER NOT NULL,
    keterangan TEXT,
    tanggal TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kas_tipe_tanggal ON kas(tipe, tanggal);

-- QRIS log histori dinamis yg pernah dibuat
CREATE TABLE IF NOT EXISTS qris_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaksi_id INTEGER REFERENCES transaksi(id) ON DELETE SET NULL,
    nominal INTEGER NOT NULL,
    qris_dinamis TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
