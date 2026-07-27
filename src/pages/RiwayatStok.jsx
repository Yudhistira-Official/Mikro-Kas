// ============================================================
// RiwayatStok.jsx — Audit trail penyesuaian stok (PageKit).
//
// Commands: list_stock_adjustments, reverse_stock_adjustment
// ============================================================
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import {
  PageShell, DataPanel, DataTable, InfoNote, StatusBadge, useSearchFilter,
} from "../components/PageKit";
import { formatDateTimeId } from "../utils/dateFormat";

/**
 * Halaman riwayat penyesuaian stok (opname, rusak, koreksi manual).
 * Tab Audit = penyesuaian asli; Tab Reversal = jejak pengembalian.
 */
export default function RiwayatStok() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reversingId, setReversingId] = useState(null);
  const [tab, setTab] = useState("audit"); // "audit" | "reversal"

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke("list_stock_adjustments");
      setList(data);
    } catch (e) {
      addToast(`Gagal memuat riwayat stok: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  // Audit asli (bukan baris reversal)
  const audits = useMemo(() => list.filter((x) => x.reverse_of_id == null), [list]);
  // Baris reversal saja
  const reversals = useMemo(() => list.filter((x) => x.reverse_of_id != null), [list]);

  const activeList = tab === "audit" ? audits : reversals;

  const { query, setQuery, filtered } = useSearchFilter(
    activeList,
    (item) => `${item.produk_nama || ""} ${item.alasan || ""} ${item.reverse_of_id || ""}`
  );

  const handleReverse = async (item, pin = null) => {
    if (item.is_reversed || item.reverse_of_id != null || reversingId) return;
    if (!window.confirm(`Kembalikan audit ${item.produk_nama}? Stok akan disesuaikan ${item.selisih > 0 ? "-" : "+"}${Math.abs(item.selisih)} unit.`)) return;
    setReversingId(item.id);
    try {
      await invoke("reverse_stock_adjustment", { input: { adjustmentId: item.id, adminPin: pin } });
      addToast("Audit stok berhasil dikembalikan", "success");
      await load();
      setTab("reversal");
    } catch (e) {
      const message = String(e?.message || e);
      if (message.includes("Melebihi batas 48 jam") || message.includes("Stok sudah berubah")) {
        const adminPin = window.prompt(`${message}\nMasukkan PIN Admin untuk override:`);
        if (adminPin) return handleReverse(item, adminPin);
      }
      addToast(`Gagal mengembalikan audit: ${message}`, "error");
    } finally {
      setReversingId(null);
    }
  };

  const totalMasuk = audits.filter((x) => x.selisih > 0).reduce((sum, x) => sum + x.selisih, 0);
  const totalKeluar = audits.filter((x) => x.selisih < 0).reduce((sum, x) => sum + Math.abs(x.selisih), 0);

  const auditColumns = [
    {
      key: "produk", label: "Produk",
      render: (item) => (
        <div>
          <b>{item.produk_nama}</b>
          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
            {item.stok_sebelum} → {item.stok_sesudah} unit
            {item.alasan ? ` · ${item.alasan}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "waktu", label: "Waktu",
      render: (item) => <span className="text-label-md">{formatDateTimeId(item.created_at)}</span>,
    },
    {
      key: "selisih", label: "Selisih", align: "right",
      render: (item) => (
        <StatusBadge
          label={item.selisih > 0 ? `+${item.selisih}` : String(item.selisih)}
          tone={item.selisih > 0 ? "success" : "danger"}
        />
      ),
    },
    {
      key: "aksi", label: "Aksi", align: "center",
      render: (item) => {
        if (item.is_reversed) return <StatusBadge label="Dikembalikan" tone="neutral" />;
        return (
          <button
            className="btn-secondary"
            onClick={() => handleReverse(item)}
            disabled={reversingId === item.id}
            style={{ fontSize: "13px", padding: "4px 10px" }}
          >
            {reversingId === item.id ? "..." : "Kembalikan"}
          </button>
        );
      },
    },
  ];

  const reversalColumns = [
    {
      key: "produk", label: "Produk",
      render: (item) => (
        <div>
          <b>{item.produk_nama}</b>
          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
            {item.stok_sebelum} → {item.stok_sesudah} unit
            {item.alasan ? ` · ${item.alasan}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "asal", label: "Audit Asal",
      render: (item) => <span className="text-label-md">#{item.reverse_of_id}</span>,
    },
    {
      key: "waktu", label: "Waktu",
      render: (item) => <span className="text-label-md">{formatDateTimeId(item.created_at)}</span>,
    },
    {
      key: "selisih", label: "Selisih", align: "right",
      render: (item) => (
        <StatusBadge
          label={item.selisih > 0 ? `+${item.selisih}` : String(item.selisih)}
          tone={item.selisih > 0 ? "success" : "danger"}
        />
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="STOK"
      title="Riwayat & Audit Stok"
      description="Jejak penyesuaian stok manual: opname, barang rusak, dan koreksi. Reversal dicatat di tab terpisah."
      actions={
        <Link to="/stock-opname" className="btn-primary">
          <span className="material-symbols-outlined">fact_check</span>
          Stok Opname
        </Link>
      }
      stats={[
        { label: "Total audit", value: `${audits.length} kali`, icon: "fact_check" },
        { label: "Stok masuk", value: `+${totalMasuk}`, icon: "add_circle", tone: "#047857" },
        { label: "Stok keluar", value: `-${totalKeluar}`, icon: "remove_circle", tone: "#B91C1C" },
        { label: "Reversal", value: `${reversals.length} kali`, icon: "undo", tone: "#3B82F6" },
      ]}
    >
      <InfoNote>
        Tab Audit = penyesuaian asli. Tab Reversal = jejak pengembalian (stok dikoreksi dengan delta lawan).
      </InfoNote>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className={tab === "audit" ? "btn-primary" : "btn-secondary"}
          onClick={() => { setTab("audit"); setQuery(""); }}
        >
          Audit ({audits.length})
        </button>
        <button
          type="button"
          className={tab === "reversal" ? "btn-primary" : "btn-secondary"}
          onClick={() => { setTab("reversal"); setQuery(""); }}
        >
          Reversal ({reversals.length})
        </button>
      </div>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder={tab === "audit" ? "Cari produk atau alasan..." : "Cari produk / audit asal..."}
        onRefresh={load}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon={tab === "audit" ? "inventory" : "undo"}
        emptyTitle={tab === "audit" ? "Belum ada riwayat penyesuaian stok" : "Belum ada riwayat reversal"}
        emptyHint={tab === "audit" ? "Lakukan stock opname atau sesuaikan stok dari halaman Produk." : "Kembalikan audit dari tab Audit untuk membuat jejak di sini."}
      >
        <DataTable
          columns={tab === "audit" ? auditColumns : reversalColumns}
          rows={filtered}
          rowKey={(item) => item.id}
        />
      </DataPanel>
    </PageShell>
  );
}
