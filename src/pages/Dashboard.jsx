// ============================================================
// Dashboard.jsx — Bento-grid dashboard ala Stitch "Elegant Blue"
// 3 tombol range: Hari Ini, 7 Hari, 1 Bulan
// SVG line chart inline, zero external deps (hindari crash canvas)
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../utils/ipc";

const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
};

const ranges = [
  { label: "Hari Ini", days: 0 },
  { label: "7 Hari", days: 7 },
  { label: "1 Bulan", days: 30 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [ringkasan, setRingkasan] = useState(null);
  const [harian, setHarian] = useState([]);
  const [terlaris, setTerlaris] = useState([]);
  const [recent, setRecent] = useState([]);
  const [jmlTransaksi, setJmlTransaksi] = useState(0);
  const [keuntungan, setKeuntungan] = useState(null);
  const [toko, setToko] = useState(null);
  const [loading, setLoading] = useState(true);

  // Range tanggal berdasarkan tombol aktif
  const range = useMemo(() => {
    const d = ranges[rangeIdx].days;
    return { dari: daysAgo(d), sampai: today() };
  }, [rangeIdx]);

  let cancelled = false;
  useEffect(() => {
    cancelled = false;
    setLoading(true);
    Promise.all([
      invoke("get_ringkasan", range),
      invoke("get_penjualan_harian", range),
      invoke("get_produk_terlaris", { ...range, limit: 3 }),
      invoke("get_transaksi_count", range),
      invoke("get_keuntungan_penjualan", range),
      invoke("get_recent_transactions", { limit: 5 }),
      invoke("get_toko"),
    ])
      .then(([r, h, t, c, p, rec, tk]) => {
        if (cancelled) return;
        setRingkasan(r);
        setHarian(h);
        setTerlaris(t);
        setJmlTransaksi(c);
        setKeuntungan(p);
        setRecent(rec || []);
        setToko(tk);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [range]);

  // Prepare SVG chart path
  const chartPath = useMemo(() => {
    if (!harian.length) return { d: "", area: "", maxVal: 1 };
    const maxVal = Math.max(...harian.map((h) => h.total), 1);
    const w = 100;
    const h = 40;
    // Hari Ini biasanya hanya punya satu titik; tampilkan titik/bar pendek, bukan empty state.
    const step = harian.length > 1 ? w / (harian.length - 1) : 0;
    const points = harian.map((p, i) => ({
      x: harian.length > 1 ? i * step : w / 2,
      y: h - (p.total / maxVal) * h * 0.9,
    }));
    const d = harian.length > 1
      ? points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
      : `M${points[0].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    const area = harian.length > 1
      ? d + ` L${points[points.length - 1].x},${h} L0,${h} Z`
      : `M${points[0].x - 8},${h} L${points[0].x - 8},${points[0].y} L${points[0].x + 8},${points[0].y} L${points[0].x + 8},${h} Z`;
    return { d, area, maxVal };
  }, [harian]);

  const monthSales = ringkasan?.total_penjualan || 0;
  const estProfit = keuntungan?.total_keuntungan || 0;
  const integratedExpense = ringkasan?.total_pengeluaran_kas || 0;
  const integratedIncome = ringkasan?.total_pemasukan_kas || 0;
  const netCash = integratedIncome - integratedExpense;
  const profitPct = keuntungan?.total_penjualan
    ? ((keuntungan.total_keuntungan / keuntungan.total_penjualan) * 100).toFixed(1)
    : 0;

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const txTime = (t) => {
    const d = new Date(t?.replace(" ", "T") + (t?.includes("Z") ? "" : "Z"));
    const nowd = new Date();
    if (d.getDate() === nowd.getDate() && (nowd - d) < 86400000) return `Hari ini, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if ((nowd - d) < 172800000 && d.getDate() === nowd.getDate() - 1) return `Kemarin, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${d.getDate()} ${monthNames[d.getMonth()]}`;
  };

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Memuat dashboard...</span>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Welcome Header */}
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
          Selamat datang{toko?.nama_toko ? `, ${toko.nama_toko}` : ""}
        </h2>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
          Ringkasan bisnis untuk {ranges[rangeIdx].label.toLowerCase()}
        </p>
      </div>

      {/* 3 Tombol Range */}
      <div style={{ display: "flex", gap: 8, background: "var(--color-surface-container-low)", borderRadius: 12, padding: 4 }}>
        {ranges.map((r, i) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setRangeIdx(i)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              color: i === rangeIdx ? "var(--color-on-primary)" : "var(--color-text-secondary)",
              background: i === rangeIdx ? "var(--color-primary)" : "transparent",
              transition: "all 0.15s",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Total Sales Card */}
      <div style={{ background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", padding: "1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
              Penjualan {ranges[rangeIdx].label}
            </p>
            <p style={{ fontSize: "28px", fontWeight: 700, color: "var(--color-primary)", letterSpacing: "-0.03em", lineHeight: "34px" }}>
              {rupiah(monthSales)}
            </p>
          </div>
          {profitPct > 0 && (
            <div style={{ background: "rgba(16,185,129,0.1)", color: "var(--color-income-green)", padding: "4px 12px", borderRadius: "999px", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 500 }}>
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>trending_up</span>
              +{profitPct}%
            </div>
          )}
        </div>
        {/* Grafik hanya untuk rentang > Hari Ini; satu hari lebih jelas lewat angka total. */}
        {rangeIdx !== 0 && (
          <div style={{ width: "100%", height: "140px", background: "var(--color-surface-container-low)", borderRadius: "12px", marginTop: "12px", position: "relative", overflow: "hidden", border: "1px solid rgba(226,232,240,0.5)" }}>
            {harian.length > 0 ? (
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: "100%", height: "100%", color: "var(--color-primary)" }}>
                <path d={chartPath.area} fill="currentColor" fillOpacity="0.08" />
                <path d={chartPath.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "var(--color-surface)", padding: "4px 12px", borderRadius: "8px" }}>
                  Belum ada data penjualan
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div style={{ background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", padding: "1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "#1a3757", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>receipt_long</span>
            </div>
            <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>Transaksi</p>
          </div>
          <p style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-text-primary)" }}>{jmlTransaksi.toLocaleString("id-ID")}</p>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{ranges[rangeIdx].label}</p>
        </div>
        <div style={{ background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", padding: "1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-income-green)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>account_balance_wallet</span>
            </div>
            <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>Estimasi Laba</p>
          </div>
          <p style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)" }}>{rupiah(estProfit)}</p>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "4px" }}>Berdasarkan margin</p>
        </div>
        <div style={{ background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", padding: "1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Pemasukan</p>
          <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-income-green)" }}>{rupiah(integratedIncome)}</p>
        </div>
        <div style={{ background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", padding: "1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Pengeluaran</p>
          <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-expense-red)" }}>{rupiah(integratedExpense)}</p>
        </div>
      </div>

      {/* Top Products */}
      <div style={{ background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "1rem", borderBottom: "1px solid var(--color-surface-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-surface-bright)" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)", fontSize: "20px" }}>star</span>
            Produk Terlaris
          </h3>
          <button onClick={() => navigate("/produk")} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Lihat Semua
          </button>
        </div>
        {terlaris.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>Belum ada data penjualan</div>
        ) : (
          <div>
            {terlaris.map((p, i) => (
              <div key={i} style={{ padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < terlaris.length - 1 ? "1px solid var(--color-surface-border)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "var(--color-surface-variant)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--color-text-secondary)", fontSize: "20px" }}>inventory_2</span>
                  </div>
                  <div>
                    <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)" }}>{p.nama}</p>
                    <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>{p.total_qty} terjual</p>
                  </div>
                </div>
                <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-primary)" }}>{rupiah(p.total_revenue)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div style={{ background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
        <div style={{ padding: "1rem", borderBottom: "1px solid var(--color-surface-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-surface-bright)" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-text-secondary)", fontSize: "20px" }}>history</span>
            Transaksi Terbaru
          </h3>
          <button onClick={() => navigate("/riwayat")} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Lihat Semua
          </button>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>Belum ada transaksi</div>
        ) : (
          <div>
            {recent.map((tx, i) => {
              const isPemasukan = tx.tipe === "penjualan";
              return (
                <div key={tx.id} style={{ padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < recent.length - 1 ? "1px solid var(--color-surface-border)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: isPemasukan ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: isPemasukan ? "var(--color-income-green)" : "var(--color-expense-red)" }}>
                      <span className="material-symbols-outlined">{isPemasukan ? "arrow_downward" : "arrow_upward"}</span>
                    </div>
                    <div>
                      <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {isPemasukan ? "Penjualan" : "Pembelian"} {isPemasukan ? `- TRX${tx.id}` : `- PO${tx.id}`}
                      </p>
                      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>{txTime(tx.tanggal)}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: "16px", fontWeight: 600, color: isPemasukan ? "var(--color-income-green)" : "var(--color-expense-red)" }}>
                    {isPemasukan ? "+ " : "- "}{rupiah(tx.total)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}