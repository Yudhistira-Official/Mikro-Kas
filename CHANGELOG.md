# Changelog

All notable changes to MikroKas will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2025-01-08

### Added
- **Cek Harga**: Price checker full-page tanpa login — akses dari tombol FAB di halaman Login
- **Auto Update**: Mekanisme update otomatis via GitHub Releases untuk Windows, Linux, dan macOS
- **GitHub Actions**: Multi-OS build workflow (Windows, Linux Intel/Apple Silicon, macOS Intel/Apple Silicon)

### Changed
- **Window Default**: Ukuran 1280×800 (min 900×600), sebelumnya 800×600
- **Version**: Bumped dari 0.1.0 → 4.0.0

### Fixed
- **UserManagement**: `user_id` → `userId` camelCase untuk IPC `set_security_questions` + `get_security_questions_admin`
- **Printer**: Pesan error diperbaiki menjadi "Cetak Struk Gagal. Coba periksa printer dahulu"
- **Search Produk**: 3-tier ranking (exact → prefix → contains) untuk konsistensi `list_produk` dan `list_produk_kasir`

### Performance
- **SearchSelect**: Cap dropdown 100 item (`MAX_VISIBLE_OPTIONS`), stable `pick` via `useCallback`
- **Dashboard**: IPC staggered (8 critical first, `list_produk` deferred), VirtualDataTable overscan 8→3, konstanta dipindah ke module scope
- **Perakitan, HppManagement, MultiHarga, SerialManagement, Promo**: Semua `produkOptions`/`gudangOptions` via `useMemo`, inline `.map()` di JSX diganti memoized vars

### PDF Laporan
- **Kolom No**: Ditambahkan ke tabel dan PDF
- **Alignment Rupiah**: `rupiahPdf()` custom untuk Rp + desimal terpisah, aligned right
- **Word Wrap**: `wrapText()` custom char-based (maxChars=30)
- **Urutan Baris**: PDF mengikuti sort order UI (`sortedPenjualan`)
- **Row Height**: Dynamic `max(11, lines × 6 + 4)` untuk multi-line wrap
- **Column Layout**: `RIGHT_START=margin+75`, `COL_STEP=29`, `modal_rp = modal - 24`, `total_rp = total - 3 - 24`

---

## [0.1.0] - 2024-12-15

### Added
- Initial release
- Kasir/POS dengan multi-SKU, cart, diskon, pajak
- Master data: Produk, Supplier, Pelanggan, Sales, Gudang
- Transaksi: Penjualan, Pembelian, Retur, Transfer
- Keuangan: Hutang/Piutang, Kas, Pengeluaran, Double-entry bookkeeping
- Laporan: Penjualan, Pembelian, Stok, Keuangan
- Printer: ESC/POS thermal printer via USB/COM
- QRIS: Parser + generator
- User Management: Multi-user, role, security questions
- Database: SQLite lokal, backup/restore
- Desktop layout: Sidebar navigation
