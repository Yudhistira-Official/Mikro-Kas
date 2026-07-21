-- Migration 014: Catatan Harga Supplier
-- Menyimpan riwayat harga per supplier-per-produk
-- agar bisa membandingkan harga supplier sebelum PO.
-- Design ref: KasGo — Catatan Harga Supplier.
-- Created: 2026-07-21

CREATE TABLE IF NOT EXISTS catatan_harga_supplier (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
    produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
    harga INTEGER NOT NULL,            -- harga satuan (rupiah) dari supplier
    satuan TEXT NOT NULL DEFAULT 'pcs', -- satuan beli
    catatan TEXT,                       -- opsional: keterangan barang
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chs_supplier ON catatan_harga_supplier(supplier_id);
CREATE INDEX IF NOT EXISTS idx_chs_produk ON catatan_harga_supplier(produk_id);
CREATE INDEX IF NOT EXISTS idx_chs_tanggal ON catatan_harga_supplier(created_at);