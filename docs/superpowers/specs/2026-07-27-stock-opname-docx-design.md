# Desain: Stock Opname dengan Riwayat dan Export DOCX

## Tujuan

Menjadikan halaman Stock Opname sebagai dokumen opname kasir untuk barang toko/eceran. Setiap opname dapat disimpan, dilihat kembali melalui tab Riwayat, dan diekspor sebagai draft `.docx` siap cetak.

## Ruang Lingkup

- Tab **Opname Baru** untuk membuat dokumen.
- Tab **Riwayat** untuk daftar, detail, dan export dokumen.
- Header otomatis dari profil toko dan user aktif, tetapi tetap editable.
- Snapshot produk dan hasil audit disimpan sebagai detail opname.
- Penyesuaian stok dilakukan saat dokumen disimpan.
- DOCX berisi data form dan area tanda tangan kosong.
- Cash opname pecahan uang tidak termasuk scope.

## Data Model

### `stock_opname`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `kode TEXT UNIQUE NOT NULL`
- `nama_toko TEXT NOT NULL`
- `tanggal TEXT NOT NULL`
- `petugas TEXT NOT NULL`
- `penanggung_jawab TEXT NOT NULL DEFAULT ''`
- `catatan TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`

### `stock_opname_item`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `opname_id INTEGER NOT NULL REFERENCES stock_opname(id) ON DELETE CASCADE`
- `produk_id INTEGER NOT NULL`
- `kode_barang TEXT NOT NULL`
- `nama_barang TEXT NOT NULL`
- `satuan TEXT NOT NULL DEFAULT ''`
- `stok_sistem INTEGER NOT NULL`
- `stok_fisik INTEGER NOT NULL`
- `selisih INTEGER NOT NULL`
- `keterangan TEXT NOT NULL DEFAULT ''`

Detail memakai snapshot agar riwayat tetap akurat ketika produk kemudian berubah nama, SKU, satuan, atau stok.

## Backend

Tambahkan migration idempotent serta command Tauri:

- `create_stock_opname`: validasi header, item, stok fisik non-negatif, dan minimal satu item; simpan header/detail; update stok hanya untuk item yang selisih ≠ 0; catat `stock_adjustment` per item dengan alasan merujuk kode opname; jalankan seluruh proses dalam satu transaksi.
- `list_stock_opname`: kembalikan riwayat dengan kode, tanggal, toko, petugas, jumlah item, dan ringkasan selisih.
- `get_stock_opname`: kembalikan header dan seluruh item snapshot.
- `export_stock_opname_docx`: buat DOCX dari data tersimpan dan simpan melalui dialog/path yang dipilih pengguna.

Kode dokumen memakai format `OPGYYYYMMDDNNN` dengan nomor urut global harian sesuai pola nomor dokumen yang sudah digunakan aplikasi.

Jika proses penyesuaian stok atau penyimpanan detail gagal, transaksi dibatalkan seluruhnya. Tidak ada dokumen opname parsial.

## Frontend

`src/pages/StockOpname.jsx` memakai dua tab.

### Opname Baru

Header:

- Nama Toko/Cabang
- Hari/Tanggal
- Nama Petugas/Kasir
- Penanggung Jawab
- Catatan tambahan

Nilai nama toko dan petugas diisi otomatis dari data aplikasi, tetapi dapat diedit. Tanggal default hari ini.

Tabel barang:

- No
- Kode Barang
- Nama Barang
- Satuan
- Stok Sistem
- Stok Fisik
- Selisih
- Keterangan

Produk aktif ditampilkan dan dapat dicari. Stok fisik serta keterangan diinput inline. Selisih dihitung sebagai `stok_fisik - stok_sistem`, dengan nilai positif dan negatif dibedakan secara visual. Simpan hanya jika header valid dan minimal satu barang terisi.

### Riwayat

Tabel menampilkan tanggal, kode dokumen, nama toko, petugas, jumlah item, total selisih, serta aksi Detail dan Export DOCX. Detail menampilkan header dan item secara read-only. Export hanya menggunakan data yang telah tersimpan.

## Format DOCX

Dokumen draft berisi:

1. Judul `FORM STOK OPNAME`.
2. Kode dokumen, nama toko/cabang, tanggal, petugas, dan penanggung jawab.
3. Tabel No, Kode Barang, Nama Barang, Satuan, Stok Sistem, Stok Fisik, Selisih, dan Keterangan.
4. Ringkasan jumlah item, total selisih kurang, dan total selisih lebih.
5. Catatan tambahan.
6. Dua area tanda tangan kosong: Dibuat oleh (Kasir/Petugas) dan Mengetahui (Supervisor/Manager), dengan nama terang bila tersedia.

Data audit dan stok diambil dari snapshot dokumen; bagian manual lain tetap dapat diisi pengguna di Word.

## Validasi dan Error Handling

- Field nama toko, tanggal, petugas, dan minimal satu item wajib.
- Stok fisik harus bilangan bulat dan tidak boleh negatif.
- Selisih selalu dihitung backend dari stok fisik dikurangi stok sistem.
- Produk dan item divalidasi pada batas command.
- Error transaksi ditampilkan sebagai pesan yang ramah pengguna.
- Export gagal tidak mengubah data opname atau stok.

## Verifikasi

- Migration dapat dijalankan ulang tanpa merusak schema.
- Backend: `cargo test`, `cargo build`.
- Frontend: `npm run build`.
- Cek manual: buat opname, pastikan stok tersesuaikan, buka riwayat, lihat detail, export DOCX, dan buka hasil file.
- Pastikan isi detail riwayat sama dengan isi DOCX.
