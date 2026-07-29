import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/desktop/Sidebar";
import { isKasirMode, onKasirModeChange, setKasirMode } from "../utils/kasirMode";
import { toggleFullscreen } from "../utils/windowMode";

const SHORTCUT_MAP = {
  F1: "/transaksi",
  F2: "/produk",
  F3: "/pembelian",
  F4: "/customer",
  F5: "/hutang-piutang",
  F6: "/qris",
  F7: "/laporan",
  F8: "/dashboard",
  F9: "/keuangan",
  F10: "/shift",
};

/**
 * Desktop shell: sidebar + main content.
 * Supports kasir focus mode (sidebar hidden) and applies saved window mode on mount.
 */
export default function DesktopLayout({ currentUser, onLogout, loggingOut }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [kasirMode, setKasirModeState] = useState(() => isKasirMode());

  useEffect(() => {
    return onKasirModeChange(setKasirModeState);
  }, []);

  // Exit kasir mode automatically when leaving /transaksi
  useEffect(() => {
    if (kasirMode && location.pathname !== "/transaksi") {
      setKasirMode(false);
      setKasirModeState(false);
    }
  }, [location.pathname, kasirMode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // F11 selalu aktif (termasuk mode kasir) — toggle fullscreen runtime.
      if (e.key === "F11") {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen().catch(() => {});
        return;
      }
      if (kasirMode && e.ctrlKey && e.key === "Escape") {
        e.preventDefault();
        setKasirMode(false);
        setKasirModeState(false);
        return;
      }
      if (kasirMode) return;
      if (SHORTCUT_MAP[e.key]) {
        e.preventDefault();
        navigate(SHORTCUT_MAP[e.key]);
      }
    };
    // capture: true agar F11 tidak dilahap handler lain / browser default
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [navigate, kasirMode]);

  return (
    <div className={`desktop-layout${kasirMode ? " desktop-layout--kasir" : ""}`}>
      {!kasirMode && <Sidebar collapsed={false} onToggle={() => {}} currentUser={currentUser} onLogout={onLogout} loggingOut={loggingOut} />}
      <main className="desktop-main">
        <Outlet />
      </main>
    </div>
  );
}
