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
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { ToastProvider } from "./hooks/useToast";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "./utils/ipc";

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
  const [tokoReady, setTokoReady] = useState(null); // null=loading
  const [errorLog, setErrorLog] = useState("");

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
    const handler = () => {
      jslog("APP: toko-saved event, refresh");
      fetchToko();
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
    document.addEventListener("click", auditClick);
    return () => {
      window.removeEventListener("toko-saved", handler);
      document.removeEventListener("click", auditClick);
      jslog("APP: App unmount");
    };
  }, [fetchToko]);

  if (tokoReady === null) {
    return (
      <div className="loading-page" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
        <div className="spinner" />
        <span className="text-body-md">Memuat...</span>
        {errorLog && <pre style={{ fontSize: '10px', color: 'red', wordBreak: 'break-all' }}>{errorLog}</pre>}
      </div>
    );
  }

  return (
    <ToastProvider>
      <RouteTracker />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/produk" element={<Produk />} />
          <Route path="/transaksi" element={<Transaksi />} />
          <Route path="/kas" element={<Kas />} />
          <Route path="/qris" element={<Qris />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/keuangan" element={<Keuangan />} />
          <Route path="/pembelian" element={<Pembelian />} />
          <Route path="/riwayat" element={<Riwayat />} />
          <Route path="/laporan" element={<Laporan />} />
          <Route path="/log" element={<Log />} />
          <Route path="/customer" element={<Customer />} />
          <Route path="/supplier" element={<Supplier />} />
          <Route path="/hutang-piutang" element={<HutangPiutang />} />
          <Route path="/cashbox" element={<Cashbox />} />
          <Route path="/retur" element={<Retur />} />
          <Route path="/backup-restore" element={<BackupRestore />} />
          <Route path="/toko" element={<TokoSetup />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}

export default App;
