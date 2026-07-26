-- Migration 024: COA (Chart of Accounts) and Jurnal for double-entry accounting
-- COA structure: 1xxx=Aktiva, 2xxx=Kewajiban, 3xxx=Modal, 4xxx=Pendapatan, 5xxx=HPP, 6xxx=Biaya
-- Supports parent-child relationships via induk_id
-- Jurnal tracks all accounting entries with debit/credit pairs

CREATE TABLE IF NOT EXISTS coa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_akun TEXT UNIQUE NOT NULL,
  nama_akun TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('aktiva', 'kewajiban', 'modal', 'pendapatan', 'hpp', 'biaya')),
  induk_id INTEGER,
  saldo_normal TEXT NOT NULL DEFAULT 'debit' CHECK(saldo_normal IN ('debit', 'kredit')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (induk_id) REFERENCES coa(id)
);

CREATE TABLE IF NOT EXISTS jurnal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal TEXT NOT NULL,
  nomor_jurnal TEXT UNIQUE NOT NULL,
  keterangan TEXT,
  akun_id INTEGER NOT NULL,
  debit REAL DEFAULT 0,
  kredit REAL DEFAULT 0,
  ref_tabel TEXT,
  ref_id INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (akun_id) REFERENCES coa(id)
);

CREATE INDEX IF NOT EXISTS idx_jurnal_tanggal ON jurnal(tanggal);
CREATE INDEX IF NOT EXISTS idx_jurnal_akun ON jurnal(akun_id);
CREATE INDEX IF NOT EXISTS idx_jurnal_ref ON jurnal(ref_tabel, ref_id);

-- Seed basic COA structure
INSERT OR IGNORE INTO coa (kode_akun, nama_akun, tipe, saldo_normal) VALUES
('1101', 'Kas', 'aktiva', 'debit'),
('1201', 'Piutang Usaha', 'aktiva', 'debit'),
('1301', 'Persediaan', 'aktiva', 'debit'),
('2101', 'Hutang Usaha', 'kewajiban', 'kredit'),
('3101', 'Modal', 'modal', 'kredit'),
('4101', 'Penjualan', 'pendapatan', 'kredit'),
('5101', 'HPP', 'hpp', 'debit'),
('6101', 'Biaya Operasional', 'biaya', 'debit');
