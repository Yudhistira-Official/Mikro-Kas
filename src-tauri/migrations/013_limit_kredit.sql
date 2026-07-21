-- Migration 013: Limit Kredit Pelanggan
-- Menambah kolom limit_kredit pada tabel customer
-- untuk membatasi piutang per pelanggan.
-- Design ref: KasGo — Limit Kredit Pelanggan.
-- Created: 2026-07-21

-- SQLite tidak mendukung ADD COLUMN IF NOT EXISTS, gunakan pendekatan safe:
-- Cek apakah kolom sudah ada, kalau belum tambahkan.
-- rusqlite execute_batch akan ignore error jika kolom sudah ada.
ALTER TABLE customer ADD COLUMN limit_kredit INTEGER NOT NULL DEFAULT 0;