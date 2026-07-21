-- 012_kasir_pin.sql
-- PIN kasir untuk keamanan akses kasir.
-- Design ref: KasGo — PIN kasir, role-based access.
-- Created: 2026-07-21

CREATE TABLE IF NOT EXISTS kasir_pin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'kasir',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kasir_pin_role ON kasir_pin(role);
