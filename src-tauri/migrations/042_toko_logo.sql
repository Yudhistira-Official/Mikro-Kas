-- Migration 042: logo perusahaan untuk struk/login
-- Path file logo disimpan di app_data_dir/store_photos/logo.*
ALTER TABLE toko ADD COLUMN logo_path TEXT;
