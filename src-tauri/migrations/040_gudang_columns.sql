-- Migration 040: Add missing columns to gudang table
-- gudang_cmd.rs references kode, jenis, catatan but 021_gudang.sql never created them
ALTER TABLE gudang ADD COLUMN IF NOT EXISTS kode TEXT;
ALTER TABLE gudang ADD COLUMN IF NOT EXISTS jenis TEXT DEFAULT 'gudang';
ALTER TABLE gudang ADD COLUMN IF NOT EXISTS catatan TEXT;
ALTER TABLE gudang ADD COLUMN IF NOT EXISTS created_at TEXT DEFAULT (datetime('now'));
