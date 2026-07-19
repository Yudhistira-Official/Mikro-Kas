-- ============================================================
-- MikroKas — Migration 003: Multi-profile QRIS
-- Mendukung beberapa profil QRIS statis (untuk beberapa merchant/outlet)
-- ============================================================

CREATE TABLE IF NOT EXISTS qris_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    merchant_name TEXT,
    qris_statis TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Migrate existing single QRIS from toko table ke qris_profile
-- Hanya jika toko punya qris_statis dan belum ada profile
INSERT OR IGNORE INTO qris_profile (nama, merchant_name, qris_statis, is_active)
SELECT
    COALESCE(nama_toko, 'Default'),
    nama_toko,
    qris_statis,
    1
FROM toko
WHERE id = 1 AND qris_statis IS NOT NULL AND qris_statis != ''
  AND NOT EXISTS (SELECT 1 FROM qris_profile LIMIT 1);

-- Tambah profile_id ke qris_log untuk tracking profile mana yang generate
ALTER TABLE qris_log ADD COLUMN profile_id INTEGER
    REFERENCES qris_profile(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qris_profile_active ON qris_profile(is_active);
