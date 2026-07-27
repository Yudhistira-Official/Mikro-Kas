// ============================================================
// RiwayatPembelian.jsx — Riwayat pembelian supplier (PageKit)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, DataTable, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";
import DateField from "../components/DateField";
import { formatDateTimeId } from "../utils/dateFormat";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Halaman riwayat restock supplier dengan filter tanggal dan pencarian.
 */
export default function RiwayatPembelian() {
  const { addToast } = useToast();
  const [dari, setDari] = useState(today);
  const [sampai, setSampai] = useState(today);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke("list_transaksi", {
        tipe: "pembelian",
        dariTanggal: dari,
        sampaiTanggal: sampai,
        limit: 100,
      });
      setList(data);
    } catch (e) {
      addToast(`Gagal memuat riwayat pembelian: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, dari, sampai]);

  useEffect(() => { void load(); }, [load]);

  const { query, setQuery, filtered } = useSearchFilter(list, (t) =>
    `${t.supplier_nama || ""} ${t.catatan || ""} ${t.id}`
  );

  const total = filtered.reduce((s, t) => s + Number(t.total || 0), 0);

  const columns = [
    {
      key: "id",
      label: "No",
      render: (t) => <strong>#{t.id}</strong>,
    },
    {
      key: "supplier",
      label: "Supplier",
      render: (t) => t.supplier_nama || "Supplier umum",
    },
    {
      key: "tanggal",
      label: "Tanggal",
      render: (t) => formatDateTimeId(t.tanggal),
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      render: (t) => <strong style={{ color: "var(--color-income-green)" }}>{rupiah(t.total)}</strong>,
    },
    {
      key: "status",
      label: "Status",
      render: (t) => {
        if (t.status === "lunas") return <StatusBadge label="Lunas" tone="success" />;
        if (t.status === "belum_lunas") return <StatusBadge label="Belum Lunas" tone="warning" />;
        return <StatusBadge label="Lunas" tone="success" />;
      },
    },
    {
      key: "sisa",
      label: "Sisa",
      align: "right",
      render: (t) => {
        if (t.status === "belum_lunas" && t.sisa > 0) {
          return <span style={{ color: "var(--color-expense-red)" }}>{rupiah(t.sisa)}</span>;
        }
        return <span style={{ color: "var(--color-text-secondary)" }}>—</span>;
      },
    },
    {
      key: "catatan",
      label: "Catatan",
      render: (t) => t.catatan || "—",
    },
  ];

  return (
    <PageShell
      eyebrow="PEMBELIAN"
      title="Riwayat Pembelian Supplier"
      description="Daftar transaksi restock dari supplier. Filter tanggal untuk audit pembelian."
      stats={[
        { label: "Transaksi", value: filtered.length, icon: "receipt_long" },
        { label: "Total Nilai", value: rupiah(total), icon: "payments", tone: "var(--color-income-green)" },
        { label: "Periode", value: `${dari} → ${sampai}`, icon: "calendar_month" },
      ]}
    >
      <InfoNote icon="local_shipping">
        Data diambil dari transaksi tipe pembelian. Gunakan filter tanggal dan pencarian supplier untuk audit stok masuk.
      </InfoNote>

      <section className="sales-panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="input-label">Dari</label>
            <DateField value={dari} onChange={setDari} />
          </div>
          <div>
            <label className="input-label">Sampai</label>
            <DateField value={sampai} onChange={setSampai} />
          </div>
        </div>
      </section>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari supplier, catatan, atau no. transaksi..."
        onRefresh={load}
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon="local_shipping"
        emptyTitle="Belum ada pembelian"
        emptyHint="Ubah rentang tanggal atau lakukan restock di menu Pembelian."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(t) => t.id} />
      </DataPanel>
    </PageShell>
  );
}
