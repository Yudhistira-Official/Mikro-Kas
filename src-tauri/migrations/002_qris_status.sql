-- ============================================================
-- MikroKas — Migration 002: QRIS payment status tracking
-- Tambah kolom status untuk melacak QRIS yg sudah dibayar/belum
-- ============================================================

ALTER TABLE qris_log ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dibayar', 'expired', 'gagal'));

-- Indeks untuk polling status
CREATE INDEX IF NOT EXISTS idx_qris_log_status ON qris_log(status, created_at);
