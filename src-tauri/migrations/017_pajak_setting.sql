-- Migration 017: Pengaturan PPN (include/exclude/non)
-- include: harga sudah termasuk PPN; exclude: PPN ditambah ke total; non: tidak ada pajak
CREATE TABLE IF NOT EXISTS pajak_setting (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ppn_mode TEXT NOT NULL DEFAULT 'non',
  ppn_persen REAL NOT NULL DEFAULT 11.0,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO pajak_setting (id, ppn_mode, ppn_persen) VALUES (1, 'non', 11.0);
