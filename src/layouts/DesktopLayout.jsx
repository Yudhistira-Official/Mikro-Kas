import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "../components/desktop/Sidebar";

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
  F11: "/toko",
};

export default function DesktopLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (SHORTCUT_MAP[e.key]) {
        e.preventDefault();
        navigate(SHORTCUT_MAP[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div className="desktop-layout">
      <Sidebar collapsed={false} onToggle={() => {}} />
      <main className="desktop-main">
        <Outlet />
      </main>
    </div>
  );
}
