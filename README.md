# MikroKas

Aplikasi mobile pembukuan dan kasir (POS) sederhana untuk UMKM (warung, toko kelontong, pedagang kecil) berbasis **Tauri v2**, **React 19**, **Vite 7**, dan database lokal **SQLite (Offline-First)** yang dioptimalkan untuk perangkat mobile berspesifikasi rendah dengan penyimpanan dan RAM terbatas.

Aplikasi ini menggabungkan pencatatan pembukuan sederhana dengan modul utilitas konversi **QRIS Statis** menjadi **QRIS Dinamis** secara lokal, tanpa memerlukan pendaftaran merchant baru ataupun payment gateway pihak ketiga (manual cashier confirmation).

## Fitur Utama

- **Dashboard Real-Time**: Ringkasan penjualan, modal, pengeluaran kas operasional, laba kotor, grafik tren penjualan, dan notifikasi otomatis produk dengan stok menipis.
- **Kasir Penjualan & Pembelian (POS)**: Manajemen transaksi keluar masuk secara atomik (mengurangi/menambah stok otomatis) mendukung multi-metode pembayaran (Tunai, QRIS, Transfer).
- **Manajemen Produk & Kategori**: CRUD lengkap data produk dengan SKU/barcode, unit satuan, harga beli, harga jual, stok minimum, pencarian, filter kategori, serta dukungan soft-delete demi menjaga integritas riwayat transaksi.
- **Pencatatan Kas Operasional**: Pencatatan pemasukan dan pengeluaran kas non-transaksi produk secara mandiri.
- **Cetak Laporan PDF**: Pembuatan laporan penjualan per periode tanggal ke file PDF temporer dan langsung membukanya di default PDF viewer perangkat (mendukung Share, Print, dan Save via Android Intent). Laporan diatur secara profesional (daftar produk diurutkan abjad, detail jumlah terjual, metode bayar) dengan summary laba-rugi diposisikan rapi di bagian bawah tabel.
- **QRIS Dinamis Lokal**: Mengubah QRIS Statis merchant (format EMVCo) menjadi QRIS Dinamis dengan menyisipkan nominal nominal secara otomatis secara lokal menggunakan parser TLV dan generator checksum CRC16-CCITT.
- **Multi-Profil Merchant QRIS**: Mengelola banyak data profil merchant QRIS terdaftar untuk kemudahan operasional multi-akun.

## Struktur Kode Aplikasi

```text
├── public/                 # Aset statis frontend (ikon, logo)
├── src/                    # Frontend React 19 + Vite 7
│   ├── assets/             # Aset gambar & media
│   ├── components/         # Komponen UI global (ErrorBoundary, Layout, QrisScanner)
│   ├── hooks/              # Custom React hooks (useToast, withRouter HOC)
│   ├── pages/              # Halaman / Screen utama aplikasi
│   │   ├── Dashboard.jsx   # Ringkasan insight penjualan, laba kotor, & stok menipis
│   │   ├── Kas.jsx         # Kas masuk/keluar manual operasional toko
│   │   ├── Keuangan.jsx    # Laba Rugi
│   │   ├── Laporan.jsx     # Filter laporan & cetak PDF
│   │   ├── Log.jsx         # Viewer log debug & ekspor log aplikasi
│   │   ├── Pembelian.jsx   # Transaksi pembelian barang (restock produk)
│   │   ├── Produk.jsx      # Manajemen data produk & kategori
│   │   ├── Profile.jsx     # Pengaturan toko & kelola profil QRIS
│   │   ├── Qris.jsx        # POS QRIS Dinamis & histori log pembayaran
│   │   ├── Riwayat.jsx     # Detail & daftar riwayat transaksi
│   │   ├── TokoSetup.jsx   # Inisialisasi awal nama toko & QRIS statis
│   │   └── Transaksi.jsx   # POS penjualan (Kasir)
│   ├── styles/             # Pengaturan tema CSS (global.css)
│   ├── utils/              # Helper utilitas (decode QR canvas, IPC wrapped)
│   ├── App.jsx             # Router aplikasi & diagnostic error listener
│   └── main.jsx            # Entry point rendering React
├── src-tauri/              # Backend Rust (Tauri v2 Core)
│   ├── capabilities/       # Konfigurasi perizinan keamanan aplikasi
│   ├── migrations/         # DDL Migrasi SQLite (001_init.sql, 002_qris_status.sql, 003_qris_profile.sql)
│   ├── src/                # Kode sumber Rust
│   │   ├── commands/       # Tauri IPC commands handler (bisnis logika)
│   │   │   ├── dashboard_cmd.rs  # Logika hitung laba, produk terlaris, & tren harian
│   │   │   ├── file_cmd.rs       # Logika penyimpanan berkas PDF temporer
│   │   │   ├── kas_cmd.rs        # Logika entri kas operasional
│   │   │   ├── kategori_cmd.rs   # Logika CRUD kategori produk
│   │   │   ├── log_cmd.rs        # Logika pembacaan & penyalinan log diagnostik
│   │   │   ├── produk_cmd.rs     # Logika CRUD data produk
│   │   │   ├── qris_cmd.rs       # Logika log & status transaksi QRIS
│   │   │   ├── qris_profile_cmd.rs  # Logika kelola profil merchant QRIS
│   │   │   ├── qris_util_cmd.rs  # Logika parser & generator QRIS dengan fee
│   │   │   ├── toko_cmd.rs       # Logika profil toko utama
│   │   │   └── transaksi_cmd.rs  # Logika pembuatan & riwayat transaksi atomik
│   │   ├── models/         # Struct model representasi tabel database
│   │   ├── qris/           # Modul parser TLV EMVCo & hitung checksum CRC16
│   │   ├── db.rs           # Koneksi database SQLite & inisialisasi WAL mode
│   │   ├── lib.rs          # Konfigurasi Tauri builder & routing IPC handler
│   │   ├── logger.rs       # Logger diagnostik internal ke berkas teks lokal
│   │   ├── main.rs         # Entry point biner backend
│   │   └── pdf_plugin.rs   # Tauri plugin untuk memicu Android Intent Viewer PDF
│   ├── Cargo.toml          # Konfigurasi dependensi crate Rust & profil rilis
│   ├── tauri.conf.json     # Konfigurasi Tauri v2 global
│   └── tauri.android.conf.json
├── LICENSE
├── package.json            # Dependensi npm & script Vite
└── vite.config.js          # Konfigurasi bundler Vite
```
