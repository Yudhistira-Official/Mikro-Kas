-- ============================================================
-- Migration 006: Tambah kolom jatuh_tempo di tabel hutang_piutang
-- Kolom jatuh_tempo menyimpan batas tanggal jatuh tempo pembayaran (YYYY-MM-DD)
-- ============================================================
ALTER TABLE hutang_piutang ADD COLUMN jatuh_tempo TEXT;
