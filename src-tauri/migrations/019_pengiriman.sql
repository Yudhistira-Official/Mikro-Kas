-- Migration 019: Data pengiriman + resi
CREATE TABLE IF NOT EXISTS pengiriman (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaksi_id INTEGER NOT NULL,
  alamat_kirim TEXT,
  kota TEXT,
  provinsi TEXT,
  kode_pos TEXT,
  ekspedisi TEXT,
  no_resi TEXT,
  tgl_kirim TEXT,
  tgl_diterima TEXT,
  status TEXT DEFAULT 'dikemas',
  catatan TEXT,
  FOREIGN KEY (transaksi_id) REFERENCES transaksi(id)
);
