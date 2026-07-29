// ============================================================
// Dashboard.jsx — Ringkasan bisnis (PageKit)
// ============================================================
import { useState, useEffect, useMemo, useCallback } from "react";
import { VirtualDataTable } from "../components/VirtualDataTable";
import { useNavigate } from "react-router-dom";
import { invoke } from "../utils/ipc";
import { PageShell, DataPanel, DataTable, InfoNote, StatusBadge, rupiah } from "../components/PageKit";
import { formatDateTimeId } from "../utils/dateFormat";
import DateField from "../components/DateField";

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

/**
 * Dashboard: omzet, laba, chart harian, terlaris, transaksi terbaru.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [ringkasan, setRingkasan] = useState(null);
  const [harian, setHarian] = useState([]);
  const [terlaris, setTerlaris] = useState([]);
  const [recent, setRecent] = useState([]);
  const [jmlTransaksi, setJmlTransaksi] = useState(0);
  const [keuntungan, setKeuntungan] = useState(null);
  const [retur, setRetur] = useState(null);
  const [toko, setToko] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProduk, setAllProduk] = useState([]); // Full product list for "Semua" / "Kurang Laris" tabs
  const [customRange, setCustomRange] = useState(false);
  const [customDari, setCustomDari] = useState(today());
  const [customSampai, setCustomSampai] = useState(today());
  const [produkTab, setProdukTab] = useState("terlaris");
  const [produkLimit, setProdukLimit] = useState(50);
  const [kurangLarisThreshold, setKurangLarisThreshold] = useState(5);
  const [produkSortBy, setProdukSortBy] = useState("total_qty");
  const [produkSortOrder, setProdukSortOrder] = useState("desc");
  const [semuaProduk, setSemuaProduk] = useState([]);
  // Popup formula stat
  const [formulaStat, setFormulaStat] = useState(null);
  const FORMULAS = {
    "Penjualan Kotor": { formula: "Total seluruh penjualan (sebelum retur)", icon: "trending_up" },
    "Penjualan Bersih": { formula: "Penjualan Kotor − Retur", icon: "payments" },
    "Laba Kotor": { formula: "Total penjualan − Total modal (HPP)", icon: "savings" },
    "Keuntungan Bersih": { formula: "Laba Kotor − Pengeluaran", icon: "account_balance" },
    "Retur": { formula: "Total barang dikembalikan dalam periode ini", icon: "undo" },
    "Pengeluaran": { formula: "Total pengeluaran kas (biaya operasional)", icon: "money_off" },
    "Transaksi": { formula: "Jumlah transaksi dalam periode ini", icon: "receipt_long" },
    "Rata-rata / TRX": { formula: "Penjualan Bersih ÷ Jumlah Transaksi", icon: "calculate" },
    "Margin": { formula: "(Laba Kotor ÷ Penjualan Bersih) × 100%", icon: "pie_chart" },
  };
  const closeFormula = useCallback(() => setFormulaStat(null), []);

  const range = useMemo(() => {
    if (customRange) return { dari: customDari, sampai: customSampai };
    const d = ranges[rangeIdx].days;
    return { dari: daysAgo(d), sampai: today() };
  }, [rangeIdx, customRange, customDari, customSampai]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      invoke("get_ringkasan", range),
      invoke("get_penjualan_harian", range),
      invoke("get_produk_terlaris", { ...range, limit: 1000 }),
      invoke("get_transaksi_count", range),
      invoke("get_keuntungan_penjualan", range),
      invoke("get_total_retur", range),
      invoke("get_recent_transactions", { limit: 5 }),
      invoke("get_toko"),
      invoke("list_produk", { onlyActive: true }),
    ])
      .then(([r, h, t, c, p, ret, rec, tk, allProd]) => {
        if (cancelled) return;
        setRingkasan(r);
        setHarian(h);
        setTerlaris(t);
        setJmlTransaksi(c);
        setKeuntungan(p);
        setRetur(ret);
        setRecent(rec || []);
        setToko(tk);
        // Merge all products with sales data for "Semua Produk" / "Kurang Laris" tabs
        const salesMap = {};
        (t || []).forEach((sale) => { salesMap[sale.nama.toLowerCase()] = sale; });
        const merged = (allProd || []).map((p) => {
          const key = p.nama.toLowerCase();
          return salesMap[key]
            ? { nama: p.nama, total_qty: salesMap[key].total_qty, total_revenue: salesMap[key].total_revenue }
            : { nama: p.nama, total_qty: 0, total_revenue: 0 };
        });
        setSemuaProduk(merged);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const chartPath = useMemo(() => {
    if (!harian.length) return { d: "", area: "", maxVal: 1 };
    const maxVal = Math.max(...harian.map((h) => h.total), 1);
    const w = 100;
    const h = 40;
    const step = harian.length > 1 ? w / (harian.length - 1) : 0;
    const points = harian.map((p, i) => ({
      x: harian.length > 1 ? i * step : w / 2,
      y: h - (p.total / maxVal) * h * 0.9,
    }));
    const d =
      harian.length > 1
        ? points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
        : `M${points[0].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    const area =
      harian.length > 1
        ? d + ` L${points[points.length - 1].x},${h} L0,${h} Z`
        : `M${points[0].x - 8},${h} L${points[0].x - 8},${points[0].y} L${points[0].x + 8},${points[0].y} L${points[0].x + 8},${h} Z`;
    return { d, area, maxVal };
  }, [harian]);

  const monthSales = ringkasan?.total_penjualan || 0;
  const estProfit = keuntungan?.total_keuntungan || 0;
  const integratedExpense = ringkasan?.total_pengeluaran_kas || 0;
  const grossSales = monthSales;
  const totalRetur = retur?.total_retur || 0;
  const netSales = grossSales - totalRetur;
  const grossProfit = estProfit;
  const totalExpenses = integratedExpense;
  const netProfit = grossProfit - totalExpenses;
  const profitMargin = netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : 0;
  const avgOrderValue = jmlTransaksi > 0 ? Math.round(netSales / jmlTransaksi) : 0;
  const profitPct = keuntungan?.total_penjualan
    ? ((keuntungan.total_keuntungan / keuntungan.total_penjualan) * 100).toFixed(1)
    : 0;

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const txTime = (t) => {
    const d = new Date(t?.replace(" ", "T") + (t?.includes("Z") ? "" : "Z"));
    const nowd = new Date();
    if (d.getDate() === nowd.getDate() && nowd - d < 86400000) {
      return `Hari ini, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    if (nowd - d < 172800000 && d.getDate() === nowd.getDate() - 1) {
      return `Kemarin, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return `${d.getDate()} ${monthNames[d.getMonth()]}`;
  };

  const terlarisColumns = [
    {
      key: "nama",
      label: "Produk",
      render: (p) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)", flexShrink: 0 }}>
            star
          </span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ overflowWrap: "anywhere" }}>{p.nama}</strong>
            {p.sku ? <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{p.sku}</div> : null}
          </div>
        </div>
      ),
    },
    { key: "total_qty", label: "Jumlah", align: "right", render: (p) => `${Number(p.total_qty || 0)} terjual` },
    {
      key: "total_revenue",
      label: "Omzet",
      align: "right",
      render: (p) => <strong style={{ color: "var(--color-primary)" }}>{rupiah(p.total_revenue || 0)}</strong>,
    },
    {
      key: "stok",
      label: "Stok",
      align: "right",
      render: (p) => (p.stok != null ? String(p.stok) : "—"),
    },
  ];

  const recentColumns = [
    {
      key: "tipe",
      label: "Jenis",
      render: (tx) => (
        <StatusBadge
          label={tx.tipe === "penjualan" ? `Penjualan TRX${tx.id}` : `Pembelian PO${tx.id}`}
          tone={tx.tipe === "penjualan" ? "success" : "danger"}
        />
      ),
    },
    { key: "tanggal", label: "Waktu", render: (tx) => txTime(tx.tanggal) },
    {
      key: "total",
      label: "Nominal",
      align: "right",
      render: (tx) => (
        <strong style={{ color: tx.tipe === "penjualan" ? "var(--color-income-green)" : "var(--color-expense-red)" }}>
          {tx.tipe === "penjualan" ? "+" : "-"}
          {rupiah(tx.total)}
        </strong>
      ),
    },
  ];

  const filteredProduk = useMemo(() => {
    let rows;
    if (produkTab === "terlaris") rows = (terlaris || []).slice(0, produkLimit);
    else if (produkTab === "kurang_laris") rows = (semuaProduk || []).filter((p) => Number(p.total_qty || 0) < kurangLarisThreshold);
    else rows = [...(semuaProduk || [])];
    const key = produkSortBy;
    const dir = produkSortOrder === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key] ?? a.nama ?? "";
      const bv = b[key] ?? b.nama ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "id") * dir;
    });
  }, [produkTab, terlaris, semuaProduk, produkLimit, kurangLarisThreshold, produkSortBy, produkSortOrder]);

  const handleProdukSort = useCallback((key) => {
    setProdukSortBy((prev) => {
      if (prev === key) {
        setProdukSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setProdukSortOrder(key === "nama" ? "asc" : "desc");
      return key;
    });
  }, []);

  return (
    <PageShell
      eyebrow="OVERVIEW"
      title={`Selamat datang${toko?.nama_toko ? `, ${toko.nama_toko}` : ""}`}
      description={`Ringkasan bisnis untuk ${customRange || rangeIdx === -1 ? "rentang khusus" : ranges[rangeIdx]?.label?.toLowerCase() || "kustom"}. Ganti rentang di bawah.`}
      actions={
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", background: "var(--color-surface-container-low)", borderRadius: 12, padding: 4, alignItems: "center" }}>
            {ranges.map((r, i) => (
              <button
                key={r.label}
                type="button"
                className={i === rangeIdx && !customRange ? "btn-primary" : "btn-secondary"}
                style={{ padding: "8px 12px", fontSize: 13 }}
                onClick={() => { setRangeIdx(i); setCustomRange(false); }}
              >
                {r.label}
              </button>
            ))}
            <button
              type="button"
              className={customRange ? "btn-primary" : "btn-secondary"}
              style={{ padding: "8px 12px", fontSize: 13 }}
              onClick={() => setCustomRange(!customRange)}
            >
              Custom
            </button>
          </div>
          {customRange && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 4px 0" }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Dari</span>
              <div style={{ width: 140 }}>
                <DateField value={customDari} onChange={(v) => { setCustomDari(v); setRangeIdx(-1); }} />
              </div>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>s.d.</span>
              <div style={{ width: 140 }}>
                <DateField value={customSampai} onChange={(v) => { setCustomSampai(v); setRangeIdx(-1); }} />
              </div>
            </div>
          )}
        </div>
      }
      stats={[
        { label: "Penjualan Kotor", value: rupiah(grossSales), icon: "trending_up", tone: "var(--color-primary)", onClick: () => setFormulaStat("Penjualan Kotor") },
        { label: "Penjualan Bersih", value: rupiah(netSales), icon: "payments", tone: "var(--color-income-green)", onClick: () => setFormulaStat("Penjualan Bersih") },
        { label: "Laba Kotor", value: rupiah(grossProfit), icon: "savings", tone: "var(--color-warning-amber)", onClick: () => setFormulaStat("Laba Kotor") },
        { label: "Keuntungan Bersih", value: rupiah(netProfit), icon: "account_balance", onClick: () => setFormulaStat("Keuntungan Bersih") },
        { label: "Retur", value: rupiah(totalRetur), icon: "undo", tone: "var(--color-expense-red)", onClick: () => setFormulaStat("Retur") },
        { label: "Pengeluaran", value: rupiah(totalExpenses), icon: "money_off", tone: "var(--color-expense-red)", onClick: () => setFormulaStat("Pengeluaran") },
        { label: "Transaksi", value: jmlTransaksi.toLocaleString("id-ID"), icon: "receipt_long", onClick: () => setFormulaStat("Transaksi") },
        { label: "Rata-rata / TRX", value: rupiah(avgOrderValue), icon: "calculate", onClick: () => setFormulaStat("Rata-rata / TRX") },
        { label: "Margin", value: `${profitMargin}%`, icon: "pie_chart", onClick: () => setFormulaStat("Margin") },
      ]}
    >
      <InfoNote icon="insights">
        Data dihitung ulang saat ganti rentang. Margin = laba kotor ÷ penjualan bersih.
        {profitPct > 0 ? ` Margin kotor periode: +${profitPct}%.` : ""}
      </InfoNote>

      {loading ? (
        <div className="loading-page">
          <div className="spinner" />
          <span>Memuat dashboard...</span>
        </div>
      ) : (
        <>
          <section className="sales-panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <p className="sales-page__eyebrow">PENJUALAN {(ranges[rangeIdx]?.label || "KUSTOM").toUpperCase()}</p>
            <h2 className="text-headline-lg" style={{ color: "var(--color-primary)", margin: "4px 0 12px" }}>
              {rupiah(monthSales)}
            </h2>
            {rangeIdx !== 0 && (
              <div
                style={{
                  width: "100%",
                  height: 140,
                  background: "var(--color-surface-container-low)",
                  borderRadius: 12,
                  position: "relative",
                  overflow: "hidden",
                  border: "1px solid var(--color-surface-border)",
                }}
              >
                {harian.length > 0 ? (
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: "100%", height: "100%", color: "var(--color-primary)" }}>
                    <path d={chartPath.area} fill="currentColor" fillOpacity="0.08" />
                    <path d={chartPath.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>
                    Belum ada data penjualan
                  </div>
                )}
              </div>
            )}
          </section>

          <div style={{ display: "grid", gap: "1rem" }}>
            <DataPanel
              toolbarExtra={
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {produkTab === "terlaris" && (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Tampilkan</span>
                      <input
                        type="number" min="1" max="500"
                        className="input-field"
                        style={{ width: 60, padding: "4px 6px", fontSize: 12 }}
                        value={produkLimit}
                        onChange={(e) => setProdukLimit(Number(e.target.value) || 50)}
                      />
                      <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>produk</span>
                    </div>
                  )}
                  {produkTab === "kurang_laris" && (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Penjualan &lt;</span>
                      <input
                        type="number" min="0"
                        className="input-field"
                        style={{ width: 60, padding: "4px 6px", fontSize: 12 }}
                        value={kurangLarisThreshold}
                        onChange={(e) => setKurangLarisThreshold(Number(e.target.value) || 0)}
                      />
                      <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>unit</span>
                    </div>
                  )}
                  <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => navigate("/produk")}>
                    Lihat Semua
                  </button>
                </div>
              }
              isEmpty={filteredProduk.length === 0}
              emptyIcon="star"
              emptyTitle="Belum ada data produk"
              emptyHint="Penjualan di rentang ini belum tercatat."
            >
              <div style={{ padding: "0 16px 8px", display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className={produkTab === "terlaris" ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "4px 12px", fontSize: 12 }}
                  onClick={() => setProdukTab("terlaris")}
                >
                  Produk Terlaris
                </button>
                <button
                  type="button"
                  className={produkTab === "kurang_laris" ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "4px 12px", fontSize: 12 }}
                  onClick={() => setProdukTab("kurang_laris")}
                >
                  Kurang Laris
                </button>
                <button
                  type="button"
                  className={produkTab === "semua" ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "4px 12px", fontSize: 12 }}
                  onClick={() => setProdukTab("semua")}
                >
                  Semua Produk
                </button>
              </div>
              <VirtualDataTable
                columns={terlarisColumns}
                rows={filteredProduk}
                rowKey={(p, i) => p.produk_id || p.id || i}
                sortable={["nama", "total_qty", "total_revenue", "stok"]}
                sortBy={produkSortBy}
                sortOrder={produkSortOrder}
                onSort={handleProdukSort}
                height="min(50vh, 480px)"
                emptyMessage="Belum ada data produk"
              />
            </DataPanel>

            <DataPanel
              toolbarExtra={
                <button type="button" className="btn-secondary" onClick={() => navigate("/riwayat")}>
                  Lihat Semua
                </button>
              }
              isEmpty={recent.length === 0}
              emptyIcon="history"
              emptyTitle="Belum ada transaksi"
              emptyHint="Transaksi terbaru akan muncul di sini."
            >
              <div style={{ padding: "0 16px 8px" }}>
                <p className="sales-page__eyebrow">TRANSAKSI TERBARU</p>
              </div>
              <DataTable columns={recentColumns} rows={recent} rowKey={(tx) => `${tx.tipe}-${tx.id}`} />
            </DataPanel>
          </div>
        </>
      )}

      {/* Popup formula statistik */}
      {formulaStat && FORMULAS[formulaStat] && (
        <div
          className="modal-overlay"
          onClick={closeFormula}
          style={{ zIndex: 9999 }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 400, padding: 24, borderRadius: 14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 28, color: "var(--color-primary)" }}
              >
                {FORMULAS[formulaStat].icon}
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{formulaStat}</h3>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
                  Ringkasan formula
                </p>
              </div>
            </div>
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                background: "var(--color-surface-container-high)",
                fontSize: 14,
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              {FORMULAS[formulaStat].formula}
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={closeFormula}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
