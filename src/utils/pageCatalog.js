// Katalog title + deskripsi tiap halaman untuk pencarian sidebar.
// Sumber: PageShell title/description di masing-masing page.

export const PAGE_CATALOG = {
  "/": {
    title: "Dashboard",
    description: "Ringkasan penjualan, keuntungan, dan laporan harian bisnis",
  },
  "/transaksi": {
    title: "Kasir",
    description: "Transaksi penjualan, checkout, pembayaran tunai, transfer, QRIS, scan barcode",
  },
  "/produk": {
    title: "Daftar Item / Barang",
    description: "Kelola katalog produk, stok, harga promo, barcode, dan import CSV",
  },
  "/customer": {
    title: "Daftar Pelanggan",
    description: "Menampilkan, menambah, mengubah, dan menghapus data pelanggan / customer",
  },
  "/supplier": {
    title: "Daftar Supplier",
    description: "Menampilkan, menambah, mengubah, dan menghapus data supplier / pemasok barang",
  },
  "/sales-komisi": {
    title: "Daftar Sales",
    description: "Kelola tenaga penjualan, kontak, dan pembayaran komisi secara terpusat",
  },
  "/gudang": {
    title: "Departemen / Gudang",
    description: "Kelola lokasi penyimpanan stok. Gudang default menjadi lokasi utama transaksi",
  },
  "/point": {
    title: "Point Pelanggan",
    description: "Program loyalitas: pelanggan kumpulkan point dari setiap transaksi, lalu tukar dengan diskon atau hadiah",
  },
  "/promo": {
    title: "Periode Promosi",
    description: "Atur promo yang otomatis berlaku di kasir saat pelanggan memenuhi syarat",
  },
  "/multi-harga": {
    title: "Multi Harga",
    description: "Daftar harga berbeda per pelanggan atau kategori",
  },
  "/pembelian": {
    title: "Restock Barang",
    description: "Klik produk isi qty harga dan supplier di popup. Restock langsung per item",
  },
  "/riwayat-pembelian": {
    title: "Riwayat Pembelian Supplier",
    description: "Daftar transaksi restock dari supplier. Filter tanggal untuk audit pembelian",
  },
  "/hutang-piutang": {
    title: "Hutang & Piutang",
    description: "Catat hutang ke supplier dan piutang dari pelanggan. Bayar cicilan kapan saja, pantau yang lewat tempo",
  },
  "/pesanan": {
    title: "Pesanan Pelanggan + DP",
    description: "Catat pre-order sebelum jadi penjualan. Stok belum berkurang sampai checkout di kasir",
  },
  "/retur": {
    title: "Retur Penjualan",
    description: "Pilih penjualan hari ini untuk retur, atau edit riwayat retur. Stok dan kas ikut menyesuaikan otomatis",
  },
  "/tukar-tambah": {
    title: "Tukar Tambah",
    description: "Catat transaksi trade-in barang lama dengan potongan pembelian barang baru",
  },
  "/pengiriman": {
    title: "Data Pengiriman",
    description: "Kelola pengiriman barang dan biaya ongkos kirim",
  },
  "/shift": {
    title: "Manajemen Shift",
    description: "Buka dan tutup shift kasir dengan pencatatan saldo yang rapi",
  },
  "/riwayat": {
    title: "Riwayat Penjualan",
    description: "Histori transaksi penjualan, detail nota, edit dan reorder ke kasir",
  },
  "/perakitan": {
    title: "Perakitan (BOM)",
    description: "Bill of Materials — resep komponen untuk produk rakitan",
  },
  "/konsinyasi": {
    title: "Konsinyasi",
    description: "Kelola barang konsinyasi masuk dari supplier dan keluar ke penerima",
  },
  "/stock-opname": {
    title: "Stock Opname",
    description: "Bandingkan stok sistem dengan hitungan fisik. Klik Fisik per baris, lalu simpan semua selisih sekaligus",
  },
  "/riwayat-stok": {
    title: "Riwayat & Audit Stok",
    description: "Jejak penyesuaian stok manual: opname, barang rusak, koreksi, dan reversal",
  },
  "/serial": {
    title: "Serial / IMEI",
    description: "Lacak nomor serial atau IMEI produk unit",
  },
  "/hpp": {
    title: "HPP Management",
    description: "Catat batch stok masuk dan simulasikan HPP dengan metode FIFO atau LIFO",
  },
  "/kas": {
    title: "Kas",
    description: "Catat uang masuk/keluar di luar transaksi penjualan: modal, biaya operasional, atau pemasukan lain",
  },
  "/keuangan": {
    title: "Manajemen Keuangan",
    description: "Pantau pemasukan dan pengeluaran per periode. Pemasukan penjualan masuk otomatis; catat pengeluaran manual di sini",
  },
  "/cashbox": {
    title: "Cashbox",
    description: "Kelola saldo kas lokal dan riwayat mutasi setiap cashbox",
  },
  "/deposit": {
    title: "Deposit Pelanggan",
    description: "Kelola saldo prabayar pelanggan: top-up, pemakaian, dan histori transaksi",
  },
  "/akuntansi": {
    title: "Akuntansi",
    description: "Kelola akun, jurnal double-entry, dan pemeriksaan saldo bisnis",
  },
  "/laporan": {
    title: "Laporan",
    description: "Laporan penjualan, stok, laba rugi, dan export PDF",
  },
  "/users": {
    title: "User Management",
    description: "Kelola pengguna dan hak akses. Kasir = POS saja; Supervisor = semua kecuali user; Admin = penuh",
  },
  "/toko": {
    title: "Data Perusahaan",
    description: "Kelola identitas perusahaan dan informasi yang tampil pada struk",
  },
  "/sistem": {
    title: "Sistem",
    description: "Kelola tampilan aplikasi, tema, jendela, fullscreen, windowed, printer, scanner barcode",
  },
  "/nomor-transaksi": {
    title: "Nomor Transaksi",
    description: "Atur prefix, jumlah digit, dan periode reset counter untuk setiap tipe transaksi",
  },
  "/pajak": {
    title: "Pajak (PPN)",
    description: "Pilih mode PPN dan tarif. Berlaku di kasir, pembelian, dan laporan",
  },
  "/backup-restore": {
    title: "Backup & Restore",
    description: "Simpan salinan database atau pulihkan dari file backup sebelumnya",
  },
  "/database-maintenance": {
    title: "Database Maintenance",
    description: "Periksa integritas, rapikan ruang, dan bangun ulang indeks database",
  },
  "/log": {
    title: "Log Aplikasi",
    description: "Diagnostik dan jejak aktivitas aplikasi untuk debugging",
  },
  "/advanced": {
    title: "Modul Lanjutan",
    description: "Cek kesiapan command backend Phase 1–5: printer, user, pricing, gudang, akuntansi, konsinyasi, perakitan, HPP, maintenance",
  },
  "/qris": {
    title: "QRIS Dinamis",
    description: "Buat kode QR bayar sesuai nominal, lalu konfirmasi di riwayat setelah pelanggan transfer",
  },
};

/**
 * Teks pencarian gabungan untuk satu path menu.
 * Menggabungkan label sidebar, desc sidebar, title page, dan description page.
 */
export function pageSearchText(path, label = "", desc = "") {
  const page = PAGE_CATALOG[path] || {};
  return [label, desc, page.title || "", page.description || ""]
    .join(" ")
    .toLowerCase();
}

/**
 * Cuplikan deskripsi halaman untuk ditampilkan di hasil search.
 */
export function pageSnippet(path, desc = "") {
  const page = PAGE_CATALOG[path];
  return page?.description || desc || "";
}
