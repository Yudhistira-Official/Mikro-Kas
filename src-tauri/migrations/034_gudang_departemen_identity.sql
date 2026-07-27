-- Migration 034: Identitas departemen/gudang dan timestamp pembuatan.
-- Kolom evolutif ditambahkan oleh init_db agar migrasi aman pada database lama.
-- Backfill kode memakai tanggal pembuatan dan ID lama; kode baru dibuat backend.
UPDATE gudang
SET created_at = datetime('now')
WHERE created_at IS NULL OR created_at = '';
UPDATE gudang
SET kode = strftime('%Y%m%d', created_at) || printf('%03d', id)
WHERE kode IS NULL OR kode = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_gudang_kode ON gudang(kode);
