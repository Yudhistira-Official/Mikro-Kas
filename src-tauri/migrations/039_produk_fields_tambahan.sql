-- Migration 039: Tambah kolom merek, tipe_item, rak, kode_item ke tabel produk
-- merek: nama merek produk (TEXT, opsional)
-- tipe_item: jenis barang (contoh: "BARANG", "JASA") (TEXT, opsional)
-- rak: lokasi rak/shelving (TEXT, opsional)
-- kode_item: kode internal item dari nomor_settings (TEXT, opsional)
ALTER TABLE produk ADD COLUMN IF NOT EXISTS merek TEXT;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS tipe_item TEXT DEFAULT 'BARANG';
ALTER TABLE produk ADD COLUMN IF NOT EXISTS rak TEXT;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS kode_item TEXT;
