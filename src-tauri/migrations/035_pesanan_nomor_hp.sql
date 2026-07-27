-- Migration 035: Index nomor HP pesanan pelanggan setelah kolom evolutif ditambahkan.
CREATE INDEX IF NOT EXISTS idx_pesanan_customer_no_hp ON pesanan_customer(no_hp);
