// ============================================================
// Kas.jsx — Catat pemasukan & pengeluaran non-transaksi (PageKit).
//
// Commands: list_kas, create_kas, delete_kas
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import RupiahInput from "../components/RupiahInput";
import { formatDateId } from "../utils/dateFormat";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge,
  useSearchFilter, rupiah,
} from "../components/PageKit";

const today = () => new Date().toISOString().slice(0, 10);
const KATEGORI_LIST = ["Listrik", "Air", "Sewa", "Gaji", "Modal", "Transport", "Makanan", "Lainnya"];

/**
 * Halaman kas: daftar entri + form catat pemasukan/pengeluaran.
 */
export default function Kas() {
  const { addToast } = useToast();
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipe: "pemasukan", kategori: "", jumlah: "", keterangan: "", tanggal: today(),
  });

  const load = useCallback(() => {
    setLoading(true);
    invoke("list_kas", { tipe: filter })
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const { query, setQuery, filtered } = useSearchFilter(
    entries,
    (e) => `${e.kategori || ""} ${e.keterangan || ""} ${e.tipe || ""}`
  );

  const totalPemasukan = entries.filter((e) => e.tipe === "pemasukan").reduce((s, e) => s + e.jumlah, 0);
  const totalPengeluaran = entries.filter((e) => e.tipe === "pengeluaran").reduce((s, e) => s + e.jumlah, 0);

  /** Hapus entri kas setelah konfirmasi. */
  const handleDelete = async (id) => {
    if (!confirm("Hapus entri kas ini?")) return;
    try {
      await invoke("delete_kas", { id });
      addToast("Entri dihapus", "success");
      load();
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
    }
  };

  /** Simpan entri kas baru. */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.jumlah || parseInt(form.jumlah, 10) <= 0) {
      return addToast("Jumlah harus diisi", "error");
    }
    if (!form.kategori.trim()) {
      return addToast("Kategori harus diisi", "error");
    }
    setSaving(true);
    try {
      await invoke("create_kas", {
        input: {
          tipe: form.tipe,
          kategori: form.kategori.trim(),
          jumlah: parseInt(form.jumlah, 10),
          keterangan: form.keterangan.trim() || null,
          tanggal: form.tanggal || null,
        },
      });
      addToast("Entri kas disimpan", "success");
      setShowForm(false);
      setForm({ tipe: "pemasukan", kategori: "", jumlah: "", keterangan: "", tanggal: today() });
      load();
    } catch (err) {
      addToast(`Gagal: ${err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "info", label: "Entri",
      render: (e) => (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="material-symbols-outlined" style={{ color: e.tipe === "pemasukan" ? "#047857" : "#B91C1C" }}>
            {e.tipe === "pemasukan" ? "trending_up" : "trending_down"}
          </span>
          <div>
            <b>{e.kategori}</b>
            <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
              {formatDateId(e.tanggal)}
              {e.keterangan ? ` · ${e.keterangan}` : ""}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "tipe", label: "Tipe",
      render: (e) => <StatusBadge label={e.tipe} tone={e.tipe === "pemasukan" ? "success" : "danger"} />,
    },
    {
      key: "jumlah", label: "Jumlah", align: "right",
      render: (e) => (
        <b style={{ color: e.tipe === "pemasukan" ? "#047857" : "#B91C1C" }}>
          {e.tipe === "pemasukan" ? "+" : "-"} {rupiah(e.jumlah)}
        </b>
      ),
    },
    {
      key: "aksi", label: "", align: "right",
      render: (e) => (
        <button type="button" className="btn-icon" onClick={() => handleDelete(e.id)} title="Hapus">
          <span className="material-symbols-outlined" style={{ color: "#B91C1C" }}>delete</span>
        </button>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="KEUANGAN"
      title="Kas"
      description="Catat uang masuk/keluar di luar transaksi penjualan: modal, biaya operasional, atau pemasukan lain."
      actions={
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setForm({ tipe: "pemasukan", kategori: "", jumlah: "", keterangan: "", tanggal: today() });
            setShowForm(true);
          }}
        >
          <span className="material-symbols-outlined">add</span> Catat Kas
        </button>
      }
      stats={[
        { label: "Pemasukan", value: rupiah(totalPemasukan), icon: "trending_up", tone: "#047857" },
        { label: "Pengeluaran", value: rupiah(totalPengeluaran), icon: "trending_down", tone: "#B91C1C" },
        { label: "Saldo tampilan", value: rupiah(totalPemasukan - totalPengeluaran), icon: "account_balance_wallet" },
      ]}
    >
      <InfoNote>
        Filter tipe memuat ulang dari server. Untuk laporan per periode lengkap, buka Manajemen Keuangan.
      </InfoNote>

      <div className="filter-row" style={{ marginBottom: 12 }}>
        {[
          { label: "Semua", value: null },
          { label: "Pemasukan", value: "pemasukan" },
          { label: "Pengeluaran", value: "pengeluaran" },
        ].map((f) => (
          <button key={f.label} type="button" className={`filter-chip${filter === f.value ? " active" : ""}`} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari kategori / keterangan..."
        onRefresh={load}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon="account_balance"
        emptyTitle="Belum ada catatan kas"
        emptyHint="Klik Catat Kas untuk menambah entri."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(e) => e.id} />
      </DataPanel>

      {showForm && (
        <FormModal
          title="Catat Kas"
          description="Pilih tipe, kategori, nominal, dan tanggal."
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
          submitLabel="Simpan"
          submitting={saving}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={form.tipe === "pemasukan" ? "btn-primary" : "btn-secondary"} style={{ flex: 1 }} onClick={() => setForm((p) => ({ ...p, tipe: "pemasukan" }))}>
              + Pemasukan
            </button>
            <button type="button" className={form.tipe === "pengeluaran" ? "btn-primary" : "btn-secondary"} style={{ flex: 1 }} onClick={() => setForm((p) => ({ ...p, tipe: "pengeluaran" }))}>
              − Pengeluaran
            </button>
          </div>
          <label className="input-label">Kategori *</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {KATEGORI_LIST.map((k) => (
              <button
                key={k}
                type="button"
                className={`filter-chip${form.kategori === k ? " active" : ""}`}
                onClick={() => setForm((p) => ({ ...p, kategori: k }))}
              >
                {k}
              </button>
            ))}
          </div>
          <input className="input-field" placeholder="Atau ketik manual..." value={form.kategori} onChange={(e) => setForm((p) => ({ ...p, kategori: e.target.value }))} />
          <label className="input-label">Jumlah *</label>
          <RupiahInput value={form.jumlah} onChange={(val) => setForm((p) => ({ ...p, jumlah: val }))} required />
          <label className="input-label">Keterangan</label>
          <input className="input-field" value={form.keterangan} onChange={(e) => setForm((p) => ({ ...p, keterangan: e.target.value }))} placeholder="Opsional" />
          <label className="input-label">Tanggal</label>
          <DateField value={form.tanggal} onChange={(v) => setForm((p) => ({ ...p, tanggal: v }))} />
        </FormModal>
      )}
    </PageShell>
  );
}
