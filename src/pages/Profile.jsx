// ============================================================
// Profile.jsx — Hub menu untuk Produk, Transaksi, Toko
// Menu yang tidak ada di bottom nav 4 tab masuk sini
// ============================================================
import { NavLink } from "react-router-dom";

const menuItems = [
  // QRIS diutamakan agar kasir cepat mengatur sumber pembayaran.
  { path: "/toko", label: "Atur QRIS", icon: "qr_code_2", desc: "Unggah dan validasi QRIS statis toko" },
  { path: "/produk", label: "Produk", icon: "inventory_2", desc: "Kelola stok dan harga produk" },
  { path: "/pembelian", label: "Pembelian (Restock)", icon: "add_shopping_cart", desc: "Restok barang dari supplier" },
  { path: "/keuangan", label: "Manajemen Keuangan Toko", icon: "account_balance", desc: "Catat pemasukan & pengeluaran toko" },
  { path: "/riwayat", label: "Riwayat Penjualan", icon: "receipt_long", desc: "Riwayat penjualan dengan filter tanggal" },
  { path: "/laporan", label: "Laporan", icon: "description", desc: "Cetak laporan penjualan (PDF)" },
  { path: "/log", label: "Log Aplikasi", icon: "bug_report", desc: "Lihat dan ekspor log debugging" },
];

export default function Profile() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "1.5rem 0" }}>
        <div className="card" style={{ width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: "36px", color: "var(--color-primary)" }}>storefront</span>
        </div>
        <div>
          <p className="text-headline-sm">MikroKas</p>
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Aplikasi kasir UMKM</p>
        </div>
      </div>

      {/* Menu list */}
      <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
        {menuItems.map((item, i) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={{
              display: "flex", alignItems: "center", gap: "12px", padding: "1rem",
              textDecoration: "none", color: "inherit",
              borderBottom: i < menuItems.length - 1 ? "1px solid var(--color-surface-border)" : "none",
            }}
            className="list-dense-item"
          >
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "24px" }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <p className="text-headline-sm" style={{ fontSize: "15px" }}>{item.label}</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>{item.desc}</p>
            </div>
            <span className="material-symbols-outlined" style={{ color: "var(--color-text-secondary)", fontSize: "20px" }}>chevron_right</span>
          </NavLink>
        ))}
      </div>

      {/* Version */}
      <p className="text-label-md" style={{ textAlign: "center", color: "var(--color-text-secondary)", marginTop: "1rem" }}>
        MikroKas v1.0.0
      </p>
    </div>
  );
}
