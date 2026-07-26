-- Migration 023: Saldo awal wizard log
CREATE TABLE IF NOT EXISTS saldo_awal_log (id INTEGER PRIMARY KEY AUTOINCREMENT, tipe TEXT NOT NULL, ref_id INTEGER, nominal REAL NOT NULL, keterangan TEXT, created_at TEXT DEFAULT (datetime('now')));
