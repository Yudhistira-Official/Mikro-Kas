-- Migration 043: kolom path foto QRIS statis untuk toko
-- Menyimpan path file gambar QRIS di app_data_dir/store_photos/qris.*
ALTER TABLE toko ADD COLUMN qris_foto_path TEXT;
