-- 011_shift_management.sql
-- Shift management: buka/tutup kasir harian, catat saldo awal/akhir, selisih kas.
-- Created: 2026-07-21

CREATE TABLE IF NOT EXISTS shift (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    saldo_awal INTEGER NOT NULL DEFAULT 0,
    saldo_akhir INTEGER,
    total_penjualan INTEGER NOT NULL DEFAULT 0,
    total_pengeluaran INTEGER NOT NULL DEFAULT 0,
    selisih INTEGER NOT NULL DEFAULT 0,
    catatan TEXT,
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shift_status ON shift(status);
CREATE INDEX IF NOT EXISTS idx_shift_opened ON shift(opened_at DESC);
