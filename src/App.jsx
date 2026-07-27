// ============================================================
// App.jsx — Router utama MikroKas
// Navigasi: Dashboard, Produk, Kasir (Transaksi), QRIS, Profile
//
// NOTE: Setiap halaman dimuat secara LAZY agar modul berat
// (jsPDF, html2canvas) hanya di-load saat rute itu dibuka.
// Ini mencegah crash WebView di Android saat aplikasi start.
//
// Setiap navigasi & error dicatat ke file log via Rust logger.
// ============================================================
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ToastProvider } from "./hooks/useToast";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "./utils/ipc";
import DesktopLayout from "./layouts/DesktopLayout";
import MobileLayout from "./layouts/MobileLayout";
import { usePlatform } from "./layouts/usePlatform";
import { applyWindowMode } from "./utils/windowMode";

// Android WebView pada perangkat ini crash saat memuat Vite dynamic chunks
// (TypeError: z is not a function). Semua halaman memakai static import.
// ponytail: aktifkan lazy loading lagi hanya setelah WebView/chunk loading stabil.
import Dashboard from "./pages/Dashboard";
import Produk from "./pages/Produk";
import Transaksi from "./pages/Transaksi";
import Kas from "./pages/Kas";
import Qris from "./pages/Qris";
import TokoSetup from "./pages/TokoSetup";
import Profile from "./pages/Profile";
import Sistem from "./pages/Sistem";
import Keuangan from "./pages/Keuangan";
import Pembelian from "./pages/Pembelian";
import Riwayat from "./pages/Riwayat";
import Laporan from "./pages/Laporan";
import Log from "./pages/Log";
import Customer from "./pages/Customer";
import Supplier from "./pages/Supplier";
import HutangPiutang from "./pages/HutangPiutang";
import Cashbox from "./pages/Cashbox";
import Retur from "./pages/Retur";
import BackupRestore from "./pages/BackupRestore";
import RiwayatStok from "./pages/RiwayatStok";
import StockOpname from "./pages/StockOpname";
import Promo from "./pages/Promo";
import Pesanan from "./pages/Pesanan";
import RiwayatPembelian from "./pages/RiwayatPembelian";
import Shift from "./pages/Shift";
import AdvancedModules from "./pages/AdvancedModules";
import UserManagement from "./pages/UserManagement";
import NomorTransaksi from "./pages/NomorTransaksi";
import PajakSetting from "./pages/PajakSetting";
import Pengiriman from "./pages/Pengiriman";
import Gudang from "./pages/Gudang";
import SerialManagement from "./pages/SerialManagement";
import Akuntansi from "./pages/Akuntansi";
import SalesKomisi from "./pages/SalesKomisi";
import PointPelanggan from "./pages/PointPelanggan";
import Deposit from "./pages/Deposit";
import TukarTambah from "./pages/TukarTambah";
import Konsinyasi from "./pages/Konsinyasi";
import Perakitan from "./pages/Perakitan";
import HppManagement from "./pages/HppManagement";
import DatabaseMaintenance from "./pages/DatabaseMaintenance";
import MultiHarga from "./pages/MultiHarga";
import Login from "./pages/Login";

// ============================================================
// Logger JS → Rust (fire-and-forget, tidak throw).
// ============================================================
function jslog(msg) {
  try {
    invoke("write_log", { msg }).catch(() => {});
  } catch { /* skip */ }
}

// ============================================================
// Ambil error awal (sebelum module load) dari window hook.
// ============================================================
function getEarlyErrors() {
  try {
    const early = window.__HERMES_ERRORS__ || [];
    const stored = JSON.parse(localStorage.getItem("hermes_bootstrap_err") || "[]");
    return [...early, ...(Array.isArray(stored) ? stored : [String(stored)])];
  } catch { return []; }
}

// ============================================================
// Simpan error + rute aktif ke localStorage agar bisa dicek
// setelah crash. Juga kirim ke Rust logger.
// ============================================================
function installErrorDiagnostics() {
  try {
    const save = (type, value) => {
      try {
        const log = {
          type,
          message: String(value?.message || value),
          stack: typeof value?.stack === "string" ? value.stack.slice(0, 300) : "",
          route: window.location.pathname,
          at: new Date().toISOString(),
          ua: navigator.userAgent?.slice(0, 80),
        };
        // lokal
        const prior = JSON.parse(localStorage.getItem("mikrokas_error_log") || "[]");
        prior.unshift(log);
        localStorage.setItem("mikrokas_error_log", JSON.stringify(prior.slice(0, 10)));
        // Rust
        jslog(`ERROR ${type}: ${log.message} | route=${log.route} | ${log.stack}`);
      } catch { /* logging error jangan sampai crash lagi */ }
    };
    window.addEventListener("error", (event) => save("error", event.error || event.message));
    window.addEventListener("unhandledrejection", (event) => save("unhandledrejection", event.reason));
    jslog("APP: error diagnostics terpasang");
  } catch { /* skip */ }
}
installErrorDiagnostics();

// ============================================================
// RouteTracker — catat setiap navigasi ke file log Rust.
// ============================================================
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    jslog(`NAV: ${location.pathname}`);
  }, [location]);
  return null;
}

function App() {
  const platform = usePlatform();
  const navigate = useNavigate();
  const [tokoReady, setTokoReady] = useState(null);
  const [errorLog, setErrorLog] = useState("");
  const [currentUser, setCurrentUser] = useState(undefined);
  const [loggingOut, setLoggingOut] = useState(false);
  
  const AppLayout = platform === "mobile" ? MobileLayout : DesktopLayout;

  const fetchToko = useCallback(() => {
    invoke("get_toko")
      .then((toko) => {
        const found = toko ? toko.nama_toko : false;
        jslog(`APP: get_toko → ${found || "null"}`);
        setTokoReady(found);
      })
      .catch((e) => {
        jslog(`APP: get_toko gagal → ${e}`);
        setErrorLog(e.toString());
        setTokoReady(false);
      });
  }, []);

  useEffect(() => {
    jslog("APP: App mount");
    // Flush errors yg tertangkap sebelum React mount
    const early = getEarlyErrors();
    if (early.length) {
      jslog("APP: bootstrap errors: " + JSON.stringify(early));
    }
    fetchToko();
    applyWindowMode();
    invoke("get_current_user").then(setCurrentUser).catch(() => setCurrentUser(null));
    const handler = () => {
      jslog("APP: toko-saved event, refresh");
      fetchToko();
      applyWindowMode();
    };
    // Re-fetch session user setelah data user diubah (clear notifikasi password default)
    const userHandler = () => {
      invoke("get_current_user").then(setCurrentUser).catch(() => {});
    };
    // Audit UI global: catat tombol/link/label upload tanpa perlu menambah
    // logger di setiap halaman. Isi formulir, payload QRIS, dan data sensitif tidak dicatat.
    const auditClick = (event) => {
      const target = event.target.closest("button, a, label");
      if (!target) return;
      const action = (target.getAttribute("aria-label") || target.textContent || target.getAttribute("href") || "tanpa-label")
        .replace(/\s+/g, " ").trim().slice(0, 100);
      jslog(`UI: klik ${target.tagName.toLowerCase()}=${action}; route=${window.location.pathname}`);
    };
    window.addEventListener("toko-saved", handler);
    window.addEventListener("user-updated", userHandler);
    document.addEventListener("click", auditClick);
    return () => {
      window.removeEventListener("toko-saved", handler);
      window.removeEventListener("user-updated", userHandler);
      document.removeEventListener("click", auditClick);
      jslog("APP: App unmount");
    };
  }, [fetchToko]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await invoke("logout_user");
      setCurrentUser(null);
      navigate("/login", { replace: true });
    } catch (error) {
      jslog(`APP: logout gagal → ${error}`);
      setErrorLog("Gagal keluar. Coba lagi.");
    } finally {
      setLoggingOut(false);
    }
  };

  if (tokoReady === null || currentUser === undefined) {
    return (
      <div className="loading-page" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
        <div className="spinner" />
        <span className="text-body-md">Memuat...</span>
        {errorLog && <pre style={{ fontSize: '10px', color: 'red', wordBreak: 'break-all' }}>{errorLog}</pre>}
      </div>
    );
  }

  if (currentUser === null) {
    return <ToastProvider><Routes><Route path="/login" element={<Login onLogin={setCurrentUser} />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes></ToastProvider>;
  }

  return (
    <ToastProvider>
      <RouteTracker />
      {errorLog && <div role="alert" style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 30, padding: "8px 12px", borderRadius: "8px", background: "var(--color-error)", color: "white", fontSize: "13px" }}>{errorLog}</div>}
      {currentUser.must_change_password && <div role="status" style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 20, padding: "8px 12px", borderRadius: "8px", background: "var(--color-warning, #fff3cd)", color: "var(--color-on-warning, #664d03)", fontSize: "13px" }}>Password default masih aktif. Segera ubah password melalui Pengaturan &gt; Data User.</div>}
      {platform === "mobile" && (
        <div style={{ position: "fixed", top: 8, right: 12, zIndex: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span>{currentUser.nama_lengkap || currentUser.username}</span>
          <button type="button" className="btn-secondary" onClick={handleLogout} disabled={loggingOut} style={{ padding: "4px 8px" }}>{loggingOut ? "Keluar…" : "Keluar"}</button>
        </div>
      )}
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<AppLayout currentUser={currentUser} onLogout={handleLogout} loggingOut={loggingOut} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/produk" element={<Produk />} />
          <Route path="/transaksi" element={<Transaksi />} />
          <Route path="/kas" element={<Kas />} />
          <Route path="/qris" element={platform === "mobile" ? <Qris /> : <Navigate to="/" replace />} />
          <Route path="/toko" element={<Profile />} />
          <Route path="/sistem" element={<Sistem />} />
          <Route path="/qris-setup" element={platform === "mobile" ? <TokoSetup /> : <Navigate to="/" replace />} />
          <Route path="/profile" element={<Navigate to="/toko" replace />} />
          <Route path="/keuangan" element={<Keuangan />} />
          <Route path="/pembelian" element={<Pembelian />} />
          <Route path="/riwayat-pembelian" element={<RiwayatPembelian />} />
          <Route path="/riwayat" element={<Riwayat />} />
          <Route path="/laporan" element={<Laporan />} />
          <Route path="/log" element={<Log />} />
          <Route path="/customer" element={<Customer />} />
          <Route path="/supplier" element={<Supplier />} />
          <Route path="/hutang-piutang" element={<HutangPiutang />} />
          <Route path="/cashbox" element={<Cashbox />} />
          <Route path="/retur" element={<Retur />} />
          <Route path="/promo" element={<Promo />} />
          <Route path="/pesanan" element={<Pesanan />} />
          <Route path="/backup-restore" element={<BackupRestore />} />
          <Route path="/riwayat-stok" element={<RiwayatStok />} />
          <Route path="/shift" element={<Shift />} />
          <Route path="/stock-opname" element={<StockOpname />} />
          <Route path="/advanced" element={<AdvancedModules />} />
          <Route path="/qris-profil" element={platform === "mobile" ? <TokoSetup /> : <Navigate to="/" replace />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/nomor-transaksi" element={<NomorTransaksi />} />
          <Route path="/pajak" element={<PajakSetting />} />
          <Route path="/multi-harga" element={<MultiHarga />} />
          <Route path="/pengiriman" element={<Pengiriman />} />
          <Route path="/gudang" element={<Gudang />} />
          <Route path="/serial" element={<SerialManagement />} />
          <Route path="/akuntansi" element={<Akuntansi />} />
          <Route path="/sales-komisi" element={<SalesKomisi />} />
          <Route path="/point" element={<PointPelanggan />} />
          <Route path="/deposit" element={<Deposit />} />
          <Route path="/tukar-tambah" element={<TukarTambah />} />
          <Route path="/konsinyasi" element={<Konsinyasi />} />
          <Route path="/perakitan" element={<Perakitan />} />
          <Route path="/hpp" element={<HppManagement />} />
          <Route path="/database-maintenance" element={<DatabaseMaintenance />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}

export default App;
