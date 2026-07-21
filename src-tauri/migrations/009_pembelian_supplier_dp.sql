-- ============================================================
-- Migration 009: Pembelian supplier + DP
-- Menambahkan supplier_id ke transaksi pembelian.
-- DP dan sisa hutang disimpan lewat tabel hutang_piutang agar tidak
-- menambah skema pembayaran baru yang melanggar CHECK metode_bayar.
-- ============================================================
ALTER TABLE transaksi ADD COLUMN supplier_id INTEGER REFERENCES supplier(id) ON DELETE SET NULL;
