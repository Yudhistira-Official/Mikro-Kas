// ============================================================
// Keuangan.jsx — Manajemen arus kas toko (PageKit).
//
// Commands: get_ringkasan_kas, list_kas, create_kas, delete_kas
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import RupiahInput from "../components/RupiahInput";
import SearchSelect from "../components/SearchSelect";
import { formatDateTimeId } from "../utils/dateFormat";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge,
  useSearchFilter, rupiah,
} from "../components/PageKit";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const kategoriList = [
  "Penjualan", "Modal", "Gaji Karyawan", "Listrik & Air",
  "Sewa Tempat", "Stok Barang", "Transportasi", "Lainnya",
];

/**
 * Halaman manajemen keuangan: ringkasan periode, daftar kas, tambah pengeluaran, export CSV.
 */
export default function Keuangan() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("all");
  const [list, setList] = useState([]);
  const [total, setTotal] = useState({ pemasukan: 0, pengeluaran: 0 });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ tipe: "pengeluaran", jumlah: "", kategori: "Lainnya", keterangan: "" });
  const [dari, setDari] = useState(monthStart);
  const [sampai, setSampai] = useState(today);
  const [kategoriFilter, setKategoriFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    const range = { dari, sampai };
    Promise.all([
      invoke("get_ringkasan_kas", range),
      invoke("list_kas", range),
    ])
      .then(([ringkasan, rows]) => {
        setTotal(ringkasan);
        setList(rows);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dari, sampai]);

  useEffect(() => { load(); }, [load]);

  const baseRows = list
    .filter((item) => tab === "all" || item.tipe === tab)
    .filter((item) => kategoriFilter === "all" || item.kategori === kategoriFilter);

  const { query, setQuery, filtered } = useSearchFilter(
    baseRows,
    (item) => `${item.kategori || ""} ${item.keterangan || ""} ${item.tipe || ""}`
  );

  const saldo = total.pemasukan - total.pengeluaran;
  const kategoriRows = Object.values(filtered.reduce((acc, item) => {
    const key = `${item.tipe}:${item.kategori}`;
    acc[key] ||= { tipe: item.tipe, kategori: item.kategori, total: 0, count: 0 };
    acc[key].total += Number(item.jumlah || 0);
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);
  const kategoriOptions = ["all", ...Array.from(new Set(list.map((item) => item.kategori))).sort((a, b) => a.localeCompare(b))];

  /** Simpan pengeluaran manual (pemasukan biasanya dari penjualan). */
  const save = async (e) => {
    e.preventDefault();
    const jumlah = Number(form.jumlah);
    if (!jumlah || jumlah <= 0) return addToast("Nominal harus diisi", "error");
    setSubmitting(true);
    try {
      await invoke("create_kas", {
        input: {
          tipe: form.tipe,
          kategori: form.kategori,
          jumlah,
          keterangan: form.keterangan.trim() || null,
          tanggal: null,
        },
      });
      addToast("Catatan tersimpan", "success");
      setShowForm(false);
      setForm({ tipe: "pengeluaran", jumlah: "", kategori: "Lainnya", keterangan: "" });
      load();
    } catch (err) {
      { const _m=String(err); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(`Gagal: ${_m}`,"error"); };
    } finally {
      setSubmitting(false);
    }
  };

  /** Hapus entri pengeluaran (bukan retur penjualan). */
  const hapus = async (id) => {
    try {
      await invoke("delete_kas", { id });
      load();
      addToast("Terhapus", "success");
    } catch (err) {
      { const _m=String(err); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(`Gagal: ${_m}`,"error"); };
    }
  };

  /** Export baris terfilter ke CSV. */
  const exportCsv = () => {
    if (!filtered.length) return addToast("Tidak ada arus kas untuk diekspor", "error");
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Tanggal", "Tipe", "Kategori", "Jumlah", "Keterangan"],
      ...filtered.map((item) => [item.tanggal, item.tipe, item.kategori, item.jumlah, item.keterangan || ""]),
      ["TOTAL", "pemasukan", "", total.pemasukan, ""],
      ["TOTAL", "pengeluaran", "", total.pengeluaran, ""],
      ["SALDO", "", "", saldo, ""],
    ];
    const blob = new Blob([`\ufeff${rows.map((row) => row.map(esc).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Arus_Kas_${dari}_${sampai}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("CSV arus kas dibuat", "success");
  };

  const columns = [
    {
      key: "info", label: "Transaksi",
      render: (item) => (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="material-symbols-outlined" style={{ color: item.tipe === "pemasukan" ? "#047857" : "#B91C1C" }}>
            {item.tipe === "pemasukan" ? "arrow_downward" : "arrow_upward"}
          </span>
          <div>
            <b>{item.kategori}</b>
            <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
              {formatDateTimeId(item.tanggal)}
              {item.keterangan ? ` · ${item.keterangan}` : ""}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "tipe", label: "Tipe",
      render: (item) => (
        <StatusBadge label={item.tipe} tone={item.tipe === "pemasukan" ? "success" : "danger"} />
      ),
    },
    {
      key: "jumlah", label: "Jumlah", align: "right",
      render: (item) => (
        <b style={{ color: item.tipe === "pemasukan" ? "#047857" : "#B91C1C" }}>
          {item.tipe === "pemasukan" ? "+" : "-"}{rupiah(item.jumlah)}
        </b>
      ),
    },
    {
      key: "aksi", label: "", align: "right",
      render: (item) => (
        item.tipe === "pengeluaran" && item.id > 0 && item.kategori !== "Retur Penjualan" ? (
          <button type="button" className="btn-icon" onClick={() => hapus(item.id)} title="Hapus">
            <span className="material-symbols-outlined" style={{ color: "#B91C1C" }}>delete</span>
          </button>
        ) : null
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="KEUANGAN"
      title="Manajemen Keuangan"
      description="Pantau pemasukan dan pengeluaran per periode. Pemasukan penjualan masuk otomatis; catat pengeluaran manual di sini."
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
          <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined">add</span> Pengeluaran
          </button>
        </>
      }
      stats={[
        { label: "Saldo periode", value: rupiah(saldo), icon: "account_balance", tone: saldo >= 0 ? "#047857" : "#B91C1C" },
        { label: "Pemasukan", value: rupiah(total.pemasukan), icon: "trending_up", tone: "#047857" },
        { label: "Pengeluaran", value: rupiah(total.pengeluaran), icon: "trending_down", tone: "#B91C1C" },
      ]}
    >
      <InfoNote>
        Filter tanggal memuat ulang ringkasan dari server. Entri retur penjualan tidak bisa dihapus di sini — edit lewat halaman Retur.
      </InfoNote>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 16, marginBottom: 12 }}>
        <div>
          <label className="input-label">Dari</label>
          <DateField value={dari} onChange={setDari} />
        </div>
        <div>
          <label className="input-label">Sampai</label>
          <DateField value={sampai} onChange={setSampai} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="input-label">Kategori</label>
          <SearchSelect
            className="input-field"
            value={kategoriFilter}
            onChange={setKategoriFilter}
            placeholder="Semua kategori"
            options={kategoriOptions.map((k) => ({ value: k, label: k === "all" ? "Semua kategori" : k }))}
          />
        </div>
      </div>

      {kategoriRows.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <p className="text-headline-sm" style={{ marginBottom: 12 }}>Ringkasan per Kategori</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {kategoriRows.slice(0, 6).map((row) => (
              <div key={`${row.tipe}:${row.kategori}`} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <b>{row.kategori}</b>
                  <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{row.count} transaksi · {row.tipe}</div>
                </div>
                <span style={{ fontWeight: 800, color: row.tipe === "pemasukan" ? "#047857" : "#B91C1C" }}>{rupiah(row.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="filter-row" style={{ marginBottom: 12 }}>
        {[
          ["all", "Semua"],
          ["pemasukan", "Pemasukan"],
          ["pengeluaran", "Pengeluaran"],
        ].map(([key, label]) => (
          <button key={key} type="button" className={`filter-chip${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari kategori / keterangan..."
        onRefresh={load}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon="account_balance_wallet"
        emptyTitle="Belum ada catatan"
        emptyHint="Ubah rentang tanggal atau tambah pengeluaran."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(item) => item.id} />
      </DataPanel>

      {showForm && (
        <FormModal
          title="Tambah Pengeluaran"
          description="Pemasukan penjualan dicatat otomatis. Gunakan form ini untuk biaya operasional."
          onClose={() => setShowForm(false)}
          onSubmit={save}
          submitLabel="Simpan"
          submitting={submitting}
        >
          <label className="input-label">Nominal *</label>
          <RupiahInput
            value={form.jumlah}
            onChange={(val) => setForm((prev) => ({ ...prev, jumlah: val }))}
            required
          />
          <label className="input-label">Kategori</label>
           <SearchSelect
             value={form.kategori}
             onChange={(value) => setForm((prev) => ({ ...prev, kategori: value }))}
             options={kategoriList.map((k) => ({ value: k, label: k }))}
             placeholder="Pilih kategori"
           />
          <label className="input-label">Keterangan</label>
          <input
            className="input-field"
            placeholder="Opsional"
            value={form.keterangan}
            onChange={(e) => setForm((prev) => ({ ...prev, keterangan: e.target.value }))}
          />
        </FormModal>
      )}
    </PageShell>
  );
}
