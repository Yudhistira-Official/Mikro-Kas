// ============================================================
// Sidebar.jsx — Desktop navigation sidebar
// Logo MikroKas + nama toko di header, collapsible sections
// ============================================================
import { NavLink } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { invoke } from "../../utils/ipc";

// Section icons mapping
const SECTION_ICONS = {
  Utama: "home",
  "Master Data": "database",
  Pembelian: "shopping_cart",
  Penjualan: "storefront",
  Perakitan: "precision_manufacturing",
  Konsinyasi: "sync_alt",
  Persediaan: "inventory_2",
  Akuntansi: "account_balance",
  Laporan: "bar_chart",
  Pengaturan: "settings",
};

const menuSections = [
  {
    label: "Utama",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: "dashboard", desc: "Ringkasan penjualan, keuntungan, dan laporan harian" },
    ],
  },
  {
    label: "Master Data",
    items: [
      { path: "/produk", label: "Data Item / Barang", icon: "inventory_2", desc: "Daftar produk, harga, stok, SKU, dan barcode" },
      { path: "/customer", label: "Data Pelanggan", icon: "people", desc: "Data pelanggan, riwayat belanja, dan poin loyalitas" },
      { path: "/supplier", label: "Data Supplier", icon: "store", desc: "Data kontak dan informasi pemasok barang" },
      { path: "/sales-komisi", label: "Data Sales", icon: "sell", desc: "Kelola data sales dan hitung komisi penjualan" },
      { path: "/gudang", label: "Departemen / Gudang", icon: "warehouse", desc: "Manajemen gudang dan lokasi penyimpanan barang" },
      { path: "/point", label: "Setting Point", icon: "stars", desc: "Program loyalitas dan penukaran poin belanja" },
      { path: "/promo", label: "Periode Promosi", icon: "local_offer", desc: "Buat promo diskon, beli X gratis Y, dan tebus murah" },
      { path: "/multi-harga", label: "Multi Harga", icon: "layers", desc: "Daftar harga berbeda per pelanggan atau kategori" },
    ],
  },
  {
    label: "Pembelian",
    items: [
      { path: "/pembelian", label: "Daftar Pembelian", icon: "shopping_cart", desc: "Buat dan kelola order pembelian ke supplier" },
      { path: "/riwayat-pembelian", label: "Riwayat Pembelian", icon: "receipt_long", desc: "Histori transaksi pembelian dari semua supplier" },
      { path: "/hutang-piutang", label: "Hutang / Piutang", icon: "credit_card", desc: "Pantau tagihan hutang ke supplier dan piutang pelanggan" },
    ],
  },
  {
    label: "Penjualan",
    items: [
      { path: "/transaksi", label: "Penjualan Kasir", icon: "point_of_sale", desc: "Transaksi penjualan, checkout, pembayaran tunai dan QRIS" },
      { path: "/pesanan", label: "Pesanan Penjualan", icon: "description", desc: "Kelola pesanan pelanggan sebelum diproses kasir" },
      { path: "/retur", label: "Retur Penjualan", icon: "keyboard_return", desc: "Proses pengembalian barang dan refund pelanggan" },
      { path: "/tukar-tambah", label: "Tukar Tambah", icon: "swap_horiz", desc: "Proses tukar tambah produk dengan selisih harga" },
      { path: "/pengiriman", label: "Data Pengiriman", icon: "local_shipping", desc: "Kelola pengiriman barang dan biaya ongkos kirim" },
      { path: "/shift", label: "Shift Kasir", icon: "schedule", desc: "Buka dan tutup shift kasir, rekap saldo per shift" },
    ],
  },
  {
    label: "Perakitan",
    items: [
      { path: "/perakitan", label: "Daftar Perakitan BOM", icon: "precision_manufacturing", desc: "Bill of Materials dan perakitan produk dari komponen" },
    ],
  },
  {
    label: "Konsinyasi",
    items: [
      { path: "/konsinyasi", label: "Konsinyasi", icon: "sync_alt", desc: "Kelola barang titipan dan pembayaran ke penitip" },
    ],
  },
  {
    label: "Persediaan",
    items: [
      { path: "/stock-opname", label: "Stok Opname", icon: "fact_check", desc: "Penghitungan stok fisik dan sinkronisasi dengan sistem" },
      { path: "/riwayat-stok", label: "Riwayat Stok", icon: "history", desc: "Rekam jejak perubahan stok masuk dan keluar" },
      { path: "/serial", label: "Serial Number", icon: "numbers", desc: "Pelacakan produk berdasarkan nomor seri unik" },
      { path: "/hpp", label: "HPP FIFO/LIFO", icon: "stacked_line_chart", desc: "Hitung harga pokok penjualan metode FIFO atau LIFO" },
    ],
  },
  {
    label: "Akuntansi",
    items: [
      { path: "/keuangan", label: "Keuangan", icon: "account_balance_wallet", desc: "Ringkasan arus kas, pemasukan, dan pengeluaran" },
      { path: "/kas", label: "Kas Masuk / Keluar", icon: "payments", desc: "Catat pemasukan dan pengeluaran kas manual" },
      { path: "/cashbox", label: "Cashbox", icon: "inbox", desc: "Kelola saldo laci kas dan mutasi harian" },
      { path: "/akuntansi", label: "Daftar Jurnal", icon: "account_balance", desc: "Jurnal entri ganda dan chart of accounts" },
      { path: "/deposit", label: "Deposit Pelanggan", icon: "savings", desc: "Kelola deposit dan uang muka dari pelanggan" },
    ],
  },
  {
    label: "Laporan",
    items: [
      { path: "/laporan", label: "Laporan", icon: "bar_chart", desc: "Laporan penjualan, produk terlaris, dan ekspor CSV/PDF" },
      { path: "/riwayat", label: "Riwayat Penjualan", icon: "history", desc: "Semua transaksi penjualan dengan detail item dan pembayaran" },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { path: "/users", label: "Data User", icon: "manage_accounts", desc: "Kelola akun pengguna, hak akses, dan PIN kasir" },
      { path: "/toko", label: "Data Perusahaan", icon: "storefront", desc: "Nama toko, alamat, logo, dan profil QRIS" },
      { path: "/nomor-transaksi", label: "Setting Nomor", icon: "tag", desc: "Format dan penomoran otomatis transaksi" },
      { path: "/pajak", label: "Pengaturan PPN", icon: "receipt", desc: "Konfigurasi tarif dan mode PPN (include/exclude/non)" },
      { path: "/backup-restore", label: "Backup & Restore", icon: "cloud_upload", desc: "Ekspor dan impor data cadangan database" },
      { path: "/database-maintenance", label: "Pengaturan Database", icon: "storage", desc: "Pemeliharaan dan optimasi database SQLite" },
      { path: "/log", label: "Log Sistem", icon: "article", desc: "Rekam jejak aktivitas dan error sistem" },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }) {
  // Toko data untuk ditampilkan di header sidebar
  const [namaTokoDisplay, setNamaTokoDisplay] = useState("");
  // Section yang sedang terbuka (accordion)
  const [expandedSections, setExpandedSections] = useState(["Kasir"]);
  const [allExpanded, setAllExpanded] = useState(false);
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return menuSections;
    return menuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => `${item.label} ${item.desc}`.toLowerCase().includes(query)),
      }))
      .filter((section) => section.items.length > 0);
  }, [search]);

  const toggleAll = () => {
    if (collapsed) {
      onToggle();
      setAllExpanded(true);
      setExpandedSections(menuSections.map((s) => s.label));
      return;
    }
    const next = !allExpanded;
    setAllExpanded(next);
    setExpandedSections(next ? menuSections.map((s) => s.label) : []);
  };

  // Ambil nama toko dari backend untuk ditampilkan di header sidebar
  useEffect(() => {
    invoke("get_toko")
      .then((t) => { if (t?.nama_toko) setNamaTokoDisplay(t.nama_toko); })
      .catch(() => {});
  }, []);

  const toggleSection = (label) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      {/* Header: Logo MikroKas + nama toko, tombol collapse */}
      <div className="sidebar-brand">
        {/* Logo MikroKas: klik untuk tampil/sembunyikan semua tab */}
        <button type="button" className="sidebar-logo-button" onClick={toggleAll} title="Tampilkan semua tab">
          <img src="/logo-header.png" alt="MikroKas" className="sidebar-logo" />
        </button>
        {!collapsed && (
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">MikroKas</span>
            {namaTokoDisplay && (
              <span className="sidebar-brand-toko">{namaTokoDisplay}</span>
            )}
          </div>
        )}

      </div>

      {!collapsed && (
        <div className="sidebar-search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari fitur..."
            aria-label="Cari fitur sidebar"
          />
          <button type="button" aria-label="Cari fitur">
            <span>Cari</span>
            <span className="material-symbols-outlined">search</span>
          </button>
        </div>
      )}

      <nav className="sidebar-nav">
        {filteredSections.map((section) => (
          <div key={section.label} className="sidebar-section">
            {/* Label section dengan icon dan toggle accordion */}
            <button
              onClick={() => !collapsed && toggleSection(section.label)}
              className="sidebar-section-label"
              title={section.label}
            >
              <span className="material-symbols-outlined sidebar-section-icon">
                {SECTION_ICONS[section.label] || "folder"}
              </span>
              {!collapsed && (
                <>
                  <span className="sidebar-section-text">{section.label}</span>
                  <span className="material-symbols-outlined sidebar-section-chevron">
                    {expandedSections.includes(section.label) ? "expand_more" : "chevron_right"}
                  </span>
                </>
              )}
            </button>

            {/* Menu items, hanya tampil jika section terbuka atau sidebar collapsed */}
            {(collapsed || expandedSections.includes(section.label)) && (
              <div className="sidebar-items">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `sidebar-item${isActive ? " active" : ""}`}
                    title={item.label}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
