// ============================================================
// Dashboard.jsx — Ringkasan bisnis, grafik, produk terlaris
// Design ref: ui-references/dashboard.html
// NOTE: Tidak memakai Chart.js/canvas di mobile. Lifecycle canvas Chart.js
// dapat crash saat halaman di-unmount cepat (TypeError: Ft is not a function).
// Grafik diganti HTML/CSS bar chart tanpa resource eksternal.
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { invoke } from "../utils/ipc";

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

const ranges = [
  { label: "Hari Ini", days: 0 },
  { label: "7 Hari", days: 7 },
  { label: "30 Hari", days: 30 },
];

export default function Dashboard() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [ringkasan, setRingkasan] = useState(null);
  const [harian, setHarian] = useState([]);
  const [terlaris, setTerlaris] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  const dateRange = useMemo(() => {
    const sampai = new Date().toISOString().slice(0, 10);
    const dari = new Date();
    dari.setDate(dari.getDate() - ranges[rangeIdx].days);
    return { dari: dari.toISOString().slice(0, 10), sampai };
  }, [rangeIdx]);

  // Guard flag: cegah setState setelah komponen umount (crash saat cepat ganti tab)
  let cancelled = false;

  useEffect(() => {
    cancelled = false;
    setLoading(true);
    Promise.all([
      invoke("get_ringkasan", dateRange),
      invoke("get_penjualan_harian", dateRange),
      invoke("get_produk_terlaris", { ...dateRange, limit: 5 }),
      invoke("list_produk_low_stock"),
    ])
      .then(([ringkasan, harian, terlaris, lowStock]) => {
        if (cancelled) return;
        setRingkasan(ringkasan);
        setHarian(harian);
        setTerlaris(terlaris);
        setLowStock(lowStock);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Memuat dashboard...</span>
      </div>
    );
  }

  const labaKotor = (ringkasan?.total_penjualan || 0) - (ringkasan?.total_pembelian || 0);

  const totalPengeluaran = (ringkasan?.total_pembelian || 0) + (ringkasan?.total_pengeluaran_kas || 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Welcome */}
      <div>
        <h2 className="text-headline-md">Ringkasan Bisnis</h2>
        <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>
          {ranges[rangeIdx].label === "Hari Ini" ? "Hari ini" : `${ranges[rangeIdx].label} terakhir`}
        </p>
      </div>

      {/* Date range selector */}
      <div className="filter-row">
        {ranges.map((r, i) => (
          <button key={r.label} className={`filter-chip${i === rangeIdx ? " active" : ""}`} onClick={() => setRangeIdx(i)}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="card">
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Penjualan</p>
          <p className="text-headline-md" style={{ color: "var(--color-income-green)" }}>
            {ringkasan ? rupiah(ringkasan.total_penjualan) : "—"}
          </p>
        </div>
        <div className="card">
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Pengeluaran</p>
          <p className="text-headline-md" style={{ color: "var(--color-expense-red)" }}>
            {rupiah(totalPengeluaran)}
          </p>
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Laba Kotor</p>
          <p className={`text-currency-display ${labaKotor >= 0 ? "text-income-green" : "text-expense-red"}`}>
            {labaKotor >= 0 ? "+ " : "- "}{rupiah(Math.abs(labaKotor))}
          </p>
        </div>
      </div>

      {/* Chart — HTML bar chart (no Chart.js untuk hindari crash canvas saat tab switch) */}
      {harian.length > 0 && (
        <div className="card">
          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Tren Penjualan</p>
          <div style={{ display: "flex", alignItems: "end", gap: "4px", height: "120px", overflowX: "auto", paddingBottom: "20px" }}>
            {(() => {
              const maxVal = Math.max(...harian.map((h) => h.total), 1);
              return harian.map((h, i) => (
                <div key={i} style={{ flex: "1 0 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                  <div
                    style={{
                      width: "100%", borderRadius: "4px 4px 0 0",
                      background: "var(--color-primary)",
                      opacity: 0.7 + 0.3 * (h.total / maxVal),
                      height: `${(h.total / maxVal) * 80}px`,
                      minHeight: h.total > 0 ? "6px" : "2px",
                      position: "relative",
                    }}
                    title={rupiah(h.total)}
                  >
                    {h.total > 0 && (
                      <span style={{
                        position: "absolute",
                        top: "-14px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontSize: "6px",
                        fontWeight: "bold",
                        color: "var(--color-text-primary)",
                        whiteSpace: "nowrap"
                      }}>
                        {h.total >= 1000000 ? `${(h.total/1000000).toFixed(1)}jt` : h.total >= 1000 ? `${(h.total/1000).toFixed(0)}rb` : h.total}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "8px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {h.hari.slice(5)}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Top Products */}
      <div className="card">
        <p className="text-headline-sm" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)", fontSize: "20px" }}>star</span>
          Produk Terlaris
        </p>
        {terlaris.length === 0 ? (
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Belum ada data penjualan</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {terlaris.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p className="text-body-md">{p.nama}</p>
                  <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{p.total_qty} terjual</p>
                </div>
                <p className="text-headline-sm" style={{ color: "var(--color-primary)" }}>{rupiah(p.total_revenue)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="card" style={{ borderColor: "var(--color-warning-amber)" }}>
          <p className="text-headline-sm" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)", fontSize: "20px" }}>warning</span>
            Stok Menipis ({lowStock.length})
          </p>
          {lowStock.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <p className="text-body-md">{p.nama}</p>
              <p className="text-label-md" style={{ color: "var(--color-warning-amber)" }}>Stok: {p.stok}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
