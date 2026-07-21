# MikroKas

<p align="center">
  <img src="public/logo-header.png" alt="Logo MikroKas" width="140" height="140" />
</p>

<p align="center"><strong>POS offline-first untuk UMKM: kasir, stok, QRIS, hutang/piutang, laporan, promo, shift, dan backup Android.</strong></p>

MikroKas adalah aplikasi kasir dan pembukuan UMKM berbasis Tauri v2, React 19, Vite 7, Rust, dan SQLite lokal. Aplikasi dirancang offline-first: transaksi, produk, stok, pelanggan, supplier, QRIS, dan laporan tetap berjalan tanpa server.

Logo aplikasi menggunakan asset Stitch project `Elegant Blue Color Palette` screen `MikroKas Logo`, disimpan lokal di `public/logo-header.png` agar README dan aplikasi tidak bergantung URL eksternal.

## Stack

- Frontend: React 19 + Vite 7
- Backend: Tauri v2 + Rust
- Database: SQLite lokal (`app_data_dir/mikrokas.db`)
- Android: Tauri Android build, private app data, backup otomatis dimatikan
- PDF: jsPDF + native Android PDF viewer handoff
- QR/Barcode: jsQR untuk QRIS payload image, ZXing untuk barcode produk

## Pembaruan Fitur

- Kasir/POS penjualan dengan stok otomatis, diskon nominal/persen, pajak, biaya layanan, ongkir, customer opsional, metode bayar Tunai/QRIS/Transfer.
- Scan barcode native Android untuk kasir:
  - Tombol scan lama tetap dipakai.
  - Popup muncul lalu langsung membuka kamera bawaan HP.
  - Tidak ada galeri, tidak ada input SKU manual.
  - Hasil foto dikembalikan ke MikroKas sebagai base64 dan didekode ZXing.
  - Jika SKU tidak ada, muncul popup `SKU tidak ada dalam database` dengan value SKU terbaca.
- Scan barcode native Android untuk Tambah Produk/Edit Produk:
  - Field SKU punya tombol scan yang sama.
  - Hasil barcode otomatis mengisi SKU produk.
- Popup scanner memakai `createPortal` + event stopPropagation agar klik di popup tidak menambah barang di belakang.
- Manajemen produk:
  - Foto produk private storage.
  - Kategori dan supplier.
  - Harga diskon promo dan tanggal berlaku.
  - Multi-satuan berbasis JSON ringan.
  - Barcode SVG generator dari SKU.
  - CSV import produk.
- Stock opname batch dengan audit penyesuaian stok.
- Pembelian/restock supplier, riwayat pembelian, catatan harga supplier, dan DP pembelian.
- Pesanan customer dengan DP/uang muka.
- Hutang/piutang dengan jatuh tempo, limit kredit customer, dan reminder.
- Promo lokal offline-first: BxGY, Tebus Murah, Minimum Belanja.
- PIN kasir/security gate untuk aksi sensitif.
- Shift management kasir.
- Dashboard ringkasan pemasukan, pengeluaran, transaksi, laba, stok rendah, produk terlaris.
- Keuangan toko: pemasukan penjualan otomatis, pengeluaran manual, pembelian, retur, cashflow.
- QRIS dinamis lokal dari QRIS statis merchant, multi profil merchant, konfirmasi manual pembayaran, prune riwayat harian.
- Laporan multi-tab: penjualan, inventori, pelanggan, pembelian, pengeluaran, margin, PDF, CSV/share fallback.
- Backup/restore database via native file picker.
- Log aplikasi internal untuk debugging Android APK.
- Android release mencegah restore data lama: `allowBackup=false`, `fullBackupContent=false`.

## Keamanan Data

- Database tidak dibundel di APK.
- Data runtime disimpan di app private data Android.
- Tidak ada `.env`, database lokal, backup, keystore, APK/AAB, token, credential, atau file pribadi yang boleh masuk commit.
- APK/AAB build output tetap artifact lokal, bukan source code repo.
- SQLite fallback publik/temp dihindari; DB berjalan di private app data.

## Struktur Project

```text
MikroKas/
├── public/
│   └── logo-header.png                 # Logo MikroKas dari Stitch, dipakai README + UI
├── src/
│   ├── components/
│   │   ├── BarcodeScanner.jsx          # Popup native camera bridge + ZXing decode
│   │   ├── Layout.jsx                  # Header, nav bawah, layout mobile
│   │   └── PinGate.jsx                 # Modal verifikasi PIN kasir
│   ├── hooks/
│   │   └── useToast.js                 # Toast app
│   ├── pages/
│   │   ├── Dashboard.jsx               # Ringkasan toko
│   │   ├── Transaksi.jsx               # Kasir/POS + scanner barcode
│   │   ├── Produk.jsx                  # CRUD produk + scan SKU + barcode SVG
│   │   ├── StockOpname.jsx             # Opname stok batch
│   │   ├── Pembelian.jsx               # Pembelian/restock supplier
│   │   ├── RiwayatPembelian.jsx        # Riwayat pembelian
│   │   ├── RiwayatStok.jsx             # Audit stok
│   │   ├── Customer.jsx                # Customer + limit kredit
│   │   ├── Supplier.jsx                # Supplier + kontak WhatsApp
│   │   ├── Pesanan.jsx                 # Pesanan customer + DP
│   │   ├── HutangPiutang.jsx           # Hutang/piutang + jatuh tempo
│   │   ├── Promo.jsx                   # Promo localStorage offline-first
│   │   ├── Shift.jsx                   # Shift management kasir
│   │   ├── Keuangan.jsx                # Cashflow toko
│   │   ├── Laporan.jsx                 # Laporan PDF/CSV multi-tab
│   │   ├── Qris.jsx                    # QRIS dinamis + history
│   │   ├── BackupRestore.jsx           # Backup/restore native picker
│   │   ├── Log.jsx                     # Viewer log aplikasi
│   │   ├── Profile.jsx                 # Hub menu sekunder
│   │   └── TokoSetup.jsx               # Setup toko awal
│   ├── styles/
│   │   └── global.css                  # Design token, mobile UI, modal, nav
│   ├── utils/
│   │   ├── barcode.js                  # Generate barcode SVG Code128
│   │   └── ipc.js                      # Wrapper invoke + logging IPC
│   └── App.jsx                         # Router + diagnostic wiring
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json                # Permission Tauri plugins
│   ├── gen/android/
│   │   └── app/src/main/
│   │       ├── AndroidManifest.xml     # Android permission + allowBackup false
│   │       └── java/.../MainActivity.kt# Camera bridge + PDF/share helpers
│   ├── migrations/
│   │   ├── 005_fitur_pos_kasgo.sql
│   │   ├── 006_hutang_piutang_jatuh_tempo.sql
│   │   ├── 007_produk_harga_diskon.sql
│   │   ├── 008_pesanan_customer_dp.sql
│   │   ├── 009_pembelian_supplier_dp.sql
│   │   ├── 010_produk_satuan_multi.sql
│   │   ├── 011_shift_management.sql
│   │   ├── 012_kasir_pin.sql
│   │   ├── 013_limit_kredit.sql
│   │   └── 014_catatan_harga_supplier.sql
│   └── src/
│       ├── commands/
│       │   ├── produk_cmd.rs           # Produk, kategori, foto, import, stock audit
│       │   ├── transaksi_cmd.rs        # Penjualan, pembelian, retur, laporan
│       │   ├── customer_cmd.rs         # Customer + limit kredit
│       │   ├── supplier_cmd.rs         # Supplier CRUD
│       │   ├── hutang_piutang_cmd.rs   # Hutang/piutang
│       │   ├── pesanan_cmd.rs          # Pesanan customer + DP
│       │   ├── shift_cmd.rs            # Shift kasir
│       │   ├── pin_cmd.rs              # PIN security
│       │   ├── harga_supplier_cmd.rs   # Harga supplier per produk
│       │   ├── dashboard_cmd.rs        # Aggregasi dashboard
│       │   ├── kas_cmd.rs              # Keuangan/cashflow
│       │   ├── qris_cmd.rs             # QRIS log/status
│       │   ├── file_cmd.rs             # Backup/restore/PDF temp
│       │   └── log_cmd.rs              # Log internal APK
│       ├── models/                     # Struct serializable untuk frontend
│       ├── db.rs                       # Init SQLite + migrasi idempotent
│       ├── logger.rs                   # File logger internal
│       ├── pdf_plugin.rs               # Buka PDF native Android
│       └── lib.rs                      # Tauri builder + command registry
├── package.json
├── vite.config.js
└── README.md
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
- Kamera barcode saat ini memakai native Android camera bridge karena Samsung WebView sulit memakai `getUserMedia` secara stabil.
