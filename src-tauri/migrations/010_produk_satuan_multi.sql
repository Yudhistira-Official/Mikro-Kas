-- ============================================================
-- Migration 010: Multi-unit pricing produk
-- Menyimpan aturan satuan tambahan sebagai JSON text:
-- [{"satuan":"dus","konversi":12,"harga_jual":120000}]
-- Stock tetap disimpan dalam satuan dasar produk.
-- ============================================================
ALTER TABLE produk ADD COLUMN satuan_multi TEXT;
