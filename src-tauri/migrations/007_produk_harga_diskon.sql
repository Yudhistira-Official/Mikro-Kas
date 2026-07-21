-- ============================================================
-- Migration 007: Harga diskon produk
-- Menambah kolom harga_diskon (harga jual spesial) dan
-- diskon_berlaku_sampai (batas waktu berlaku, opsional).
-- Jika harga_diskon > 0 dan masih sebelum batas waktu,
-- maka di POS harga diskon yang dipakai bukan harga_jual.
-- ============================================================
ALTER TABLE produk ADD COLUMN harga_diskon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE produk ADD COLUMN diskon_berlaku_sampai TEXT;
