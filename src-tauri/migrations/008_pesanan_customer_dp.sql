-- ============================================================
-- Migration 008: Pesanan customer + DP
-- Menyimpan pre-order pelanggan sederhana tanpa mengurangi stok.
-- ponytail: tambah tabel pesanan_item jika pesanan perlu detail produk formal.
-- ============================================================
CREATE TABLE IF NOT EXISTS pesanan_customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customer(id) ON DELETE SET NULL,
    nama_pemesan TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    dp INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'selesai', 'batal')),
    catatan TEXT,
    jatuh_tempo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pesanan_customer_status ON pesanan_customer(status);
CREATE INDEX IF NOT EXISTS idx_pesanan_customer_customer ON pesanan_customer(customer_id);
