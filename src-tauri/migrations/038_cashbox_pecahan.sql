-- Migration 038: opening and closing denomination counts for each cashier shift
CREATE TABLE IF NOT EXISTS cashbox_pecahan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
    denom INTEGER NOT NULL CHECK (denom > 0),
    qty_awal INTEGER NOT NULL DEFAULT 0 CHECK (qty_awal >= 0),
    qty_akhir INTEGER NOT NULL DEFAULT 0 CHECK (qty_akhir >= 0),
    is_koin INTEGER NOT NULL DEFAULT 0 CHECK (is_koin IN (0, 1)),
    UNIQUE(shift_id, denom, is_koin)
);
CREATE INDEX IF NOT EXISTS idx_cashbox_pecahan_shift ON cashbox_pecahan(shift_id);
