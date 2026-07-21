// ============================================================
// Layout.jsx — Top header + Bottom nav + swipe antar tab utama.
//
// Nav utama: Dashboard, Kasir, QRIS, Profile.
// Gesture:
//   - Swipe kiri/kanan di area konten pindah ke tab utama berikut/sebelumnya.
//   - Threshold 60px agar scroll kecil tidak salah dianggap navigasi.
// ============================================================
import { useRef } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import LogoMark from "./LogoMark";

const navItems = [
  { path: "/", label: "Dashboard", icon: "dashboard" },
  { path: "/transaksi", label: "Kasir", icon: "point_of_sale" },
  { path: "/qris", label: "QRIS", icon: "qr_code_2" },
  { path: "/profile", label: "Profile", icon: "account_circle" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const touchStart = useRef(null);

  const currentIndex = navItems.findIndex((item) => item.path === location.pathname);

  const onTouchStart = (event) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event) => {
    if (!touchStart.current || currentIndex < 0) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    // Abaikan gerakan vertikal agar scroll halaman tetap normal.
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < navItems.length) navigate(navItems[nextIndex].path);
  };

  return (
    <>
      <header className="top-header">
        <NavLink to="/toko" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <LogoMark size={42} variant="wordmark" />
        </NavLink>
        <NavLink to="/produk" style={{ textDecoration: "none", color: "var(--color-primary)" }}>
          <span className="material-symbols-outlined">search</span>
        </NavLink>
      </header>

      <main onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ maxWidth: "480px", margin: "0 auto", padding: "1rem", touchAction: "pan-y", overflowX: "hidden" }}>
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {navItems.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === "/"} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
