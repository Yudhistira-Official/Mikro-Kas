# MikroKas

<p align="center">
  <img src="public/logo-header.png" alt="Logo MikroKas" width="140" height="140" />
</p>

<p align="center"><strong>POS offline-first untuk UMKM: kasir, stok, pembelian, penjualan, keuangan, QRIS, laporan, promo, dan operasional toko.</strong></p>

MikroKas adalah aplikasi kasir dan pembukuan UMKM berbasis Tauri v2, React, Vite, Rust, dan SQLite lokal. Aplikasi dirancang offline-first: transaksi, produk, stok, pelanggan, supplier, pembayaran, komisi, dan laporan berjalan menggunakan database lokal tanpa server eksternal.

## Download

**Latest Release: v4.0.0**

- [Windows Installer (.msi)](https://github.com/Yudhistira-Official/Mikro-Kas/releases/latest)
- [Linux AppImage](https://github.com/Yudhistira-Official/Mikro-Kas/releases/latest)
- [macOS Universal (.dmg)](https://github.com/Yudhistira-Official/Mikro-Kas/releases/latest)

**Auto-update**: Aplikasi akan otomatis memeriksa dan mengunduh update terbaru dari GitHub Releases.

## Stack

- Frontend: React + Vite
- Backend: Tauri v2 + Rust
- Database: SQLite lokal pada `app_data_dir`
- Desktop: Tauri desktop layout dengan sidebar
- Android: Tauri Android layout dengan bottom navigation dan menu Lainnya
- PDF: jsPDF + native viewer/share handoff
- Barcode/QR: ZXing, jsQR, QRIS TLV/CRC parser
- Printer: ESC/POS thermal printer melalui device USB/COM yang tersedia

## Fitur

### Dashboard

- Ringkasan penjualan kotor, retur, penjualan bersih, laba kotor, keuntungan bersih, margin, transaksi, dan pengeluaran.
- Produk terlaris, produk kurang laris, semua produk, tren penjualan, dan transaksi terbaru.
- Filter periode laporan dan sortir kolom berdasarkan header.

### Master Data

- **Daftar Item / Barang**: CRUD produk, multi-SKU per produk (barcode warna/varian berbeda), barcode scan, kategori, supplier, foto, harga jual, harga diskon, stok minimum, satuan multi, dan import/export Excel.
- **Daftar Supplier**: CRUD supplier, kontak WhatsApp, detail supplier, salin link WhatsApp, dan catatan harga supplier per produk.
- **Daftar Pelanggan**: CRUD pelanggan, limit kredit, kontak WhatsApp, detail pelanggan, salin link WhatsApp, dan import CSV.
- **Daftar Sales**: CRUD sales, kode, telepon, email, komisi terutang, histori periode, dan pembayaran komisi.
- **Departemen / Gudang**: CRUD gudang, gudang default, alamat, status aktif, dan kontrol lokasi stok.
- **Point Pelanggan**: nilai rupiah per point, masa berlaku, minimum penukaran, dan simulasi point.
- **Periode Promosi**: Minimum Belanja, Beli X Gratis Y, dan Tebus Murah dengan preview aturan.
- **Harga Multi Level**: kalkulator diskon bertingkat dan pengecekan harga jual produk.

### Kasir dan Penjualan

- Kasir/POS dengan pencarian produk substring (ranked: exact > awalan > mengandung), tampilan kartu/list, cart, perubahan qty, multi-satuan, customer, diskon, pajak, service charge, ongkir, dan total bayar.
- Multi-SKU: scan barcode alternatif tetap menambah produk yang sama ke cart.
- Metode pembayaran Tunai, QRIS, dan Transfer.
- Validasi uang diterima, kembalian, fokus keyboard `End`, dan submit dengan `Enter`.
- Konfirmasi cetak faktur: `Ya, Cetak` atau `Tidak` (simpan tanpa cetak). Jika cetak gagal, transaksi dibatalkan otomatis.
- Keyboard shortcut: Arrow L/R pilih, Enter jalankan, Escape batal.
- Toast sukses dengan aksi **Urungkan** dan shortcut `Ctrl+Z`.
- Reorder transaksi dari riwayat.
- Pesanan penjualan, retur, tukar tambah, dan pengiriman.
- WhatsApp customer/supplier dibuka melalui browser default desktop.

### Pembelian dan Stok

- Pembelian/restock supplier, DP, riwayat pembelian, dan catatan harga supplier.
- Stock opname dengan VirtualDataTable (dinamis), audit penyesuaian, dan export DOCX.
- Riwayat stok.
- Serial number: tambah, status, transaksi terkait, dan hapus.
- HPP FIFO/LIFO: tambah batch stok dan kalkulasi harga pokok.
- Perakitan BOM: daftar BOM, komponen, dan proses perakitan.
- Konsinyasi masuk dan keluar.

### Keuangan dan Akuntansi

- Keuangan toko: pemasukan, pengeluaran, pembelian, retur, dan cashflow.
- Kas dan Cashbox: saldo, mutasi, dan riwayat kas.
- Shift kasir: buka shift, saldo awal, tutup shift, saldo akhir, selisih, dan riwayat.
- Hutang/piutang, jatuh tempo, limit kredit, pembayaran, dan deposit pelanggan.
- Daftar COA, jurnal manual, neraca saldo, dan pemeriksaan jurnal tidak seimbang.
- Komisi sales terutang dan pembayaran komisi.

### QRIS dan Printer

- QRIS dinamis dari QRIS statis merchant.
- Multi profil QRIS dan pemilihan profil aktif.
- Status, konfirmasi manual, expiry, dan riwayat QRIS.
- Cetak struk/struk ESC/POS: layout standar POS (32/80mm), dual-align (label kiri + nominal kanan), garis pemisah, wrap otomatis, UTF-8.
- Lebar kertas otomatis deteksi 58mm (32 char) atau 80mm (48 char).
- Test print menggunakan layout yang sama dengan struk transaksi.
- Desktop mencoba device printer USB/COM umum lintas Windows dan Linux; driver printer tetap diperlukan.

### Pengaturan Toko

- **Profil Perusahaan**: nama toko/perusahaan, alamat, telepon, email, website, NPWP, deskripsi usaha, dan QRIS statis.
- **Profil QRIS Pembayaran**: profil QRIS statis multi-merchant untuk perangkat mobile.
- User dan role (admin, kasir, supervisor, inventori), PIN kasir, reset password, dan status user.
- Setting nomor transaksi dan generate nomor transaksi.
- Pengaturan PPN: mode non/include/exclude, tarif, dan kalkulasi preview.
- Hardware POS: printer path, lebar kertas (32/48), scanner HID, customer display.
- Backup/restore database melalui native file picker.
- Maintenance database SQLite.
- Log sistem dengan viewer, refresh, copy, dan export.

## UX dan Navigasi

- Desktop memakai sidebar berdasarkan kelompok kerja: Utama, Master Data, Pembelian, Penjualan, Perakitan, Konsinyasi, Persediaan, Akuntansi, Laporan, dan Pengaturan.
- Sidebar desktop memiliki pencarian fitur berdasarkan judul dan deskripsi tersembunyi.
- Android memakai bottom navigation dan menu **Lainnya** berbentuk titik tiga.
- Keyboard shortcut: F1-F10 untuk navigasi halaman, F11 untuk toggle fullscreen.
- VirtualDataTable dengan ukuran baris dinamis (measureElement) agar tidak tumpang tindih.
- Form penting menggunakan modal, label penjelas, preview hasil, empty state, loading state, validasi input, dan toast feedback.
- Operasi CRUD utama menyediakan aksi **Urungkan** pada notifikasi bila backend mendukung reverse operation.
- UI responsif dan mengikuti design token warna MikroKas: violet primary, cyan secondary, amber tertiary, surface putih bersih.

## Keamanan Data

- Database runtime disimpan di private app data melalui `app_data_dir`.
- Database lokal, backup, log runtime, token, credential, private key, keystore, APK/AAB, dan file pribadi tidak boleh masuk repository.
- `.env`, keystore Android, target build, log, dan state agent diabaikan oleh `.gitignore`.
- Password user di-hash di backend.
- Input backend divalidasi dan query database menggunakan parameter.
- Android backup otomatis dinonaktifkan melalui konfigurasi aplikasi.

## Menjalankan

```bash
npm install
npm run tauri dev
```

## Struktur Project

```text
MikroKas/
├── public/
│   └── logo-header.png
├── src/
│   ├── components/
│   │   ├── VirtualDataTable.jsx
│   │   ├── BarcodeScanner.jsx
│   │   ├── DropZoneImport.jsx
│   │   ├── PinGate.jsx
│   │   ├── RupiahInput.jsx
│   │   ├── PageKit.jsx
│   │   └── desktop/Sidebar.jsx
│   ├── hooks/useToast.jsx
│   ├── layouts/
│   │   ├── DesktopLayout.jsx
│   │   ├── MobileLayout.jsx
│   │   └── usePlatform.js
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Transaksi.jsx
│   │   ├── Produk.jsx
│   │   ├── Customer.jsx
│   │   ├── Supplier.jsx
│   │   ├── SalesKomisi.jsx
│   │   ├── Gudang.jsx
│   │   ├── Pembelian.jsx
│   │   ├── Pengiriman.jsx
│   │   ├── TukarTambah.jsx
│   │   ├── Konsinyasi.jsx
│   │   ├── SerialManagement.jsx
│   │   ├── HppManagement.jsx
│   │   ├── Perakitan.jsx
│   │   ├── Shift.jsx
│   │   ├── Cashbox.jsx
│   │   ├── Akuntansi.jsx
│   │   ├── Deposit.jsx
│   │   ├── Laporan.jsx
│   │   ├── StockOpname.jsx
│   │   ├── RiwayatStok.jsx
│   │   ├── Riwayat.jsx
│   │   ├── RiwayatPembelian.jsx
│   │   ├── NomorTransaksi.jsx
│   │   ├── PajakSetting.jsx
│   │   ├── Sistem.jsx
│   │   ├── TokoSetup.jsx
│   │   ├── Profile.jsx
│   │   ├── BackupRestore.jsx
│   │   └── ...
│   ├── styles/global.css
│   ├── utils/ipc.js
│   ├── utils/printerSettings.js
│   ├── utils/windowMode.js
│   └── App.jsx
├── src-tauri/
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   ├── 041_produk_sku.sql
│   │   └── ...
│   ├── src/commands/
│   │   ├── produk_cmd.rs
│   │   ├── transaksi_cmd.rs
│   │   ├── printer_cmd.rs
│   │   ├── hardware_cmd.rs
│   │   └── ...
│   ├── src/models/
│   │   └── produk.rs
│   ├── src/db.rs
│   └── src/lib.rs
├── package.json
└── README.md
```

## Lisensi

Project internal MikroKas. Pastikan data operasional dan credential tidak dibagikan ke repository publik.
