-- Migration 020: Master bank, merek, jenis barang, ekspedisi
CREATE TABLE IF NOT EXISTS master_bank (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, kode TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_merek (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_jenis_barang (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, induk_id INTEGER, is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS master_ekspedisi (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, is_active INTEGER DEFAULT 1);
INSERT OR IGNORE INTO master_bank (nama, kode) VALUES ('BCA','014'),('Mandiri','008'),('BRI','002'),('BNI','009'),('BSI','451'),('CIMB','022'),('Danamon','011'),('BTN','200'),('Permata','013'),('Maybank','016');
INSERT OR IGNORE INTO master_ekspedisi (nama) VALUES ('JNE'),('J&T Express'),('SiCepat'),('TIKI'),('AnterAja'),('Wahana'),('Lion Parcel'),('POS Indonesia'),('SAP Express'),('Ninja Xpress');
