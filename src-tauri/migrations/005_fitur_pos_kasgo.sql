-- ============================================================
-- Migration 005: Fitur POS KasGo Phase 1
--   - stock_adjustment: audit trail penyesuaian stok manual
--   - Kolom transaksi: pajak_nominal, biaya_layanan, ongkir
--     (biaya tambahan selain diskon; total_final = subtotal - diskon + pajak + biaya + ongkir)
--   - Kolom produk: foto_path (placeholder foto produk, Phase 2)
-- Semua nominal INTEGER (rupiah), bukan REAL.
-- Idempoten: CREATE TABLE IF NOT EXISTS + ALTER TABLE aman jika kolom sudah ada.
-- ============================================================

-- Audit trail penyesuaian stok: setiap kali stok diubah manual (opname/koreksi),
-- catat produk, selisih (+/-), alasan, dan timestamp untuk akuntabilitas.
CREATE TABLE IF NOT EXISTS stock_adjustment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
    selisih INTEGER NOT NULL,              -- positif: tambah stok, negatif: kurang stok
    stok_sebelum INTEGER NOT NULL,        -- snapshot stok sebelum penyesuaian
    stok_sesudah INTEGER NOT NULL,        -- snapshot stok sesudah penyesuaian
    alasan TEXT NOT NULL,                 -- wajib: contoh "Opname fisik", "Rusak", "Hilang"
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_adj_produk ON stock_adjustment(produk_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_tanggal ON stock_adjustment(created_at);
