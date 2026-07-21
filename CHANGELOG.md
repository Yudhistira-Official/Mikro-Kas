# Changelog

Semua perubahan penting MikroKas dicatat di file ini.

## v2.0.0 — 2026-07-20

### Ringkasan

Rilis besar setelah versi awal. Fokus utama: Android native lebih stabil, laporan PDF lebih akurat, QRIS lebih aman, backup/restore lebih mudah, UI mobile lebih rapi, dan data app tidak ikut pulih otomatis setelah reinstall.

### Added

- Logo aplikasi baru dari Stitch: icon geometric M navy dengan background putih.
- Logo baru diterapkan ke header, tab Profile, asset Tauri, dan icon APK.
- Swipe kiri/kanan antar tab utama: Dashboard, Kasir, QRIS, Profile.
- Scanner barcode produk realtime memakai ZXing.
- Input manual barcode di modal scanner.
- Customer detail modal:
  - data bisa diklik dari daftar,
  - tombol salin nomor,
  - chat WhatsApp native.
- Supplier dibuat setara Customer:
  - CRUD supplier,
  - detail modal,
  - tombol salin nomor,
  - chat WhatsApp native,
  - deskripsi tambahan.
- Produk mendukung pilihan supplier opsional.
- Kasir mendukung cart collapsible dengan animasi panah.
- Diskon kasir mendukung nominal Rupiah dan persen.
- Restock/Pembelian memakai UI mirip Kasir.
- Retur Penjualan punya dua tab:
  - Retur Baru,
  - Riwayat Retur.
- Riwayat retur bisa diedit dari halaman Retur Penjualan.
- Tabel database retur dan retur_item.
- Dashboard ringkasan baru:
  - pemasukan,
  - pengeluaran,
  - neto kas,
  - produk terlaris,
  - stok rendah.
- QRIS multi profil merchant.
- Riwayat QRIS otomatis dihapus saat hari berganti.
- Backup database via native file picker.
- Restore database via native file picker.
- Log aplikasi lebih lengkap untuk debugging Android.
- README baru sesuai kondisi project terkini.

### Changed

- Dashboard tab Hari Ini tidak lagi menampilkan grafik garis karena hanya satu titik data.
- Grafik hanya tampil untuk 7 hari dan 1 bulan.
- Label dashboard disederhanakan menjadi Pemasukan dan Pengeluaran.
- Manajemen Keuangan Toko sekarang layout list 1 kolom agar tidak melebar di layar mobile.
- CashBox/toggle tampilan Manajemen Keuangan dihapus.
- Pemasukan di Manajemen Keuangan otomatis berasal dari transaksi penjualan.
- Pengeluaran mencakup kas manual, pembelian/restock, dan retur penjualan.
- Tombol hapus retur di Manajemen Keuangan disembunyikan; edit retur hanya lewat halaman Retur Penjualan.
- Laporan PDF diganti menjadi agregasi produk lintas periode:
  - produk dengan nama sama digabung,
  - jumlah terjual diakumulasi,
  - modal dan total harga jual dihitung per periode.
- Judul tabel PDF menjadi `Rincian Penjualan <dari> s.d. <sampai>`.
- Tabel PDF utama sekarang berisi:
  - Nama Produk,
  - Jumlah,
  - Metode Pembayaran,
  - Harga Awal,
  - Total.
- Total Penjualan dipindahkan ke baris paling bawah tabel utama PDF.
- Ringkasan Keuangan PDF sekarang sinkron dengan total tabel utama.
- Ringkasan per Metode Pembayaran PDF tidak lagi menampilkan Qty.
- Tabel Ringkasan Keuangan dan Ringkasan Metode Pembayaran dibuat selebar tabel utama.
- Backup/restore tidak lagi memakai input path manual.
- Android backup otomatis dimatikan agar reinstall tidak memulihkan database lama.
- Fallback database ke file `/tmp` dihapus; jika app data dir gagal, database memakai in-memory.
- Versi UI Profile menjadi `MikroKas v2.0.0`.

### Fixed

- QRIS lama muncul lagi setelah uninstall/install ulang karena Android auto-backup.
- Backup gagal dengan error `Folder tujuan backup tidak ditemukan` di Android picker.
- Dashboard Hari Ini sebelumnya sering menampilkan grafik/empty state tidak sesuai.
- Ringkasan Keuangan PDF tidak sinkron dengan rincian penjualan.
- Barcode kamera menyala tetapi tidak membaca barcode produk.
- QRIS tetap tidak terganggu oleh perubahan scanner barcode.
- WhatsApp native sebelumnya ditolak oleh permission opener.
- Error payload transaksi `metodeBayar` / `diskon` pada kasir.
- Retur sekarang mengembalikan stok dan menyesuaikan total transaksi.
- Supplier/customer nomor telepon lebih mudah disalin dan dihubungi.
- Logo lama terlalu menyatu dengan background.

### Security / Data Safety

- `android:allowBackup="false"` ditambahkan.
- `android:fullBackupContent="false"` ditambahkan.
- Database runtime tidak dibundel ke APK.
- Manifest Android penting ikut repo agar perubahan anti-backup tidak hilang saat build.
- `.env`, database lokal, backup, keystore, APK/AAB, dan build output tetap tidak boleh ikut commit.

### Build Verification

- `cargo check` sukses.
- `npm run build` sukses.
- Android APK build sukses.

## v1.0.0 — Versi Awal

### Initial

- Setup dasar MikroKas dengan Tauri v2, React, Vite, Rust, dan SQLite.
- CRUD produk, kategori, toko, transaksi dasar.
- QRIS statis ke dinamis.
- Laporan PDF awal.
- Dashboard dan halaman Profile awal.
