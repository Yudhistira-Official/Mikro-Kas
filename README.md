# MikroKas

MikroKas adalah aplikasi kasir, pembukuan, QRIS, dan laporan PDF untuk UMKM. Aplikasi berjalan offline-first memakai Tauri v2, React 19, Vite 7, Rust, dan SQLite lokal.

Fokus project saat ini: transaksi harian cepat, stok otomatis, QRIS dinamis lokal, laporan PDF rapi, backup/restore native, dan build Android APK.

## Stack

- Frontend: React 19 + Vite 7
- Backend: Tauri v2 + Rust
- Database: SQLite lokal (`app_data_dir/mikrokas.db`)
- Android: Tauri Android build, offline-first
- PDF: jsPDF + viewer PDF native Android
- QR/Barcode: jsQR untuk QRIS, ZXing untuk barcode produk

## Fitur Saat Ini

- Dashboard ringkasan pemasukan, pengeluaran, transaksi, laba, stok rendah, produk terlaris.
- Dashboard Hari Ini tanpa grafik garis; rentang 7 hari/1 bulan tetap memakai grafik.
- Kasir/POS penjualan dengan stok otomatis, diskon nominal/persen, customer opsional, metode pembayaran Tunai/QRIS/Transfer.
- Barcode produk realtime dengan kamera + input manual barcode.
- Pembelian/restock produk dengan UI mirip kasir.
- Manajemen produk, kategori, supplier, customer.
- Supplier dan customer punya detail modal, salin nomor, dan chat WhatsApp native.
- Retur penjualan dengan dua tab: retur baru dan riwayat retur; retur bisa diedit dari halaman Retur Penjualan.
- Manajemen Keuangan Toko: pemasukan penjualan otomatis, pengeluaran manual, pembelian/restock, retur, layout list 1 kolom.
- QRIS dinamis lokal dari QRIS statis merchant, multi profil merchant, konfirmasi manual pembayaran.
- Riwayat QRIS otomatis dibersihkan saat hari berganti.
- Laporan PDF periode tanggal:
  - Produk sama diakumulasi lintas periode.
  - Tabel: Nama Produk, Jumlah, Metode Pembayaran, Harga Awal/modal, Total harga jual.
  - Total Penjualan berada di baris paling bawah tabel utama.
  - Ringkasan Keuangan sinkron dari total tabel utama.
  - Ringkasan Metode Pembayaran tanpa Qty.
- Backup/restore database via native file picker; tanpa mengetik path manual.
- Log aplikasi internal untuk debugging Android.
- Logo aplikasi, header, dan Profile memakai icon M geometric navy dari Stitch.
- Android backup otomatis dimatikan agar uninstall + install ulang tidak memulihkan DB lama.

## Keamanan Data

- Database tidak dibundel di APK.
- Data runtime disimpan di app private data Android.
- Android manifest memakai:
  - `android:allowBackup="false"`
  - `android:fullBackupContent="false"`
- Jika app data dir gagal, database hanya in-memory; tidak fallback ke file publik/temp.
- File `.env`, database lokal, backup, keystore, APK/AAB build output tidak boleh masuk commit.

## Struktur Kode

```text
├── public/
│   └── logo-header.png              # Logo icon M Stitch untuk UI
├── src/
│   ├── components/
│   │   ├── Layout.jsx               # Header, bottom nav, swipe antar tab utama
│   │   ├── LogoMark.jsx             # Render logo app
│   │   └── BarcodeScanner.jsx       # Scanner barcode produk ZXing + manual input
│   ├── pages/
│   │   ├── Dashboard.jsx            # Ringkasan toko + quick stats
│   │   ├── Transaksi.jsx            # Kasir penjualan
│   │   ├── Pembelian.jsx            # Restock/pembelian produk
│   │   ├── Produk.jsx               # CRUD produk + supplier dropdown
│   │   ├── Customer.jsx             # CRUD customer + detail/copy/WhatsApp
│   │   ├── Supplier.jsx             # CRUD supplier + detail/copy/WhatsApp
│   │   ├── Keuangan.jsx             # Manajemen keuangan toko
│   │   ├── Laporan.jsx              # Filter laporan + PDF
│   │   ├── Retur.jsx                # Retur baru + riwayat/edit retur
│   │   ├── Qris.jsx                 # QRIS dinamis + riwayat harian
│   │   ├── QrisProfile.jsx          # Profil merchant QRIS
│   │   ├── BackupRestore.jsx        # Backup/restore via native picker
│   │   ├── Log.jsx                  # Viewer log aplikasi
│   │   └── Profile.jsx              # Menu utama aplikasi
│   ├── utils/
│   │   ├── ipc.js                   # Wrapper invoke + logging IPC
│   │   └── decodeQrImage.js         # Decode QRIS dari gambar
│   └── App.jsx                      # Router + diagnostic listener
├── src-tauri/
│   ├── capabilities/                # Permission Tauri
│   ├── gen/android/                 # Project Android generated Tauri
│   │   └── app/src/main/AndroidManifest.xml
│   ├── icons/                       # Icon app multi-size
│   ├── migrations/                  # Migrasi SQLite
│   └── src/
│       ├── commands/
│       │   ├── dashboard_cmd.rs     # Ringkasan dashboard + profit
│       │   ├── file_cmd.rs          # Backup/restore + PDF temp file
│       │   ├── kas_cmd.rs           # Keuangan toko terintegrasi
│       │   ├── qris_cmd.rs          # QRIS log/status/prune harian
│       │   ├── qris_profile_cmd.rs  # Profil merchant QRIS
│       │   ├── produk_cmd.rs        # Produk + supplier join
│       │   ├── supplier_cmd.rs      # Supplier CRUD
│       │   ├── customer_cmd.rs      # Customer CRUD
│       │   └── transaksi_cmd.rs     # Penjualan, pembelian, retur, laporan produk
│       ├── db.rs                    # Init SQLite + migrasi idempotent
│       ├── logger.rs                # Log internal app
│       └── pdf_plugin.rs            # Buka PDF via native viewer
├── package.json
└── vite.config.js
```

## Perintah Development

```bash
npm install
npm run dev
npm run build
cd src-tauri && cargo check
npm run tauri android build -- --target aarch64
```

APK release:

```text
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

AAB release:

```text
src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab
```

## Catatan Android

- Install ulang manual disarankan setelah uninstall lama.
- Karena backup Android sudah dimatikan, install baru seharusnya membuka database kosong.
- Jika perangkat masih memulihkan data lama, hapus storage aplikasi dari Settings sebelum uninstall.
