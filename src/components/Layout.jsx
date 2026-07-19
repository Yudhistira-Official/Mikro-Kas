// ============================================================
// Layout.jsx — Top header + Bottom nav (4 tab) + Page content
// Nav: Dashboard, Kasir, Qris, Profile
// Menu lain (Produk, Transaksi, Toko) via halaman Profile
// Design ref: ui-references/nav-ref.html (Stitch)
// ============================================================
import { Outlet, NavLink, useLocation } from "react-router-dom";

const navItems = [
  { path: "/", label: "Dashboard", icon: "dashboard" },
  { path: "/transaksi", label: "Kasir", icon: "point_of_sale" },
  { path: "/qris", label: "QRIS", icon: "qr_code_2" },
  { path: "/profile", label: "Profile", icon: "account_circle" },
];

export default function Layout() {
  const location = useLocation();

  return (
    <>
      {/* Top Header with safe-area for notch */}
      <header className="top-header">
        <NavLink to="/toko" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>storefront</span>
          <span className="top-header-title">MikroKas</span>
        </NavLink>
        <NavLink to="/produk" style={{ textDecoration: "none", color: "var(--color-primary)" }}>
          <span className="material-symbols-outlined">search</span>
        </NavLink>
      </header>

      {/* Page Content */}
      <main style={{ maxWidth: "480px", margin: "0 auto", padding: "1rem" }}>
        <Outlet />
      </main>

      {/* Bottom Navigation — 4 tabs */}
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
