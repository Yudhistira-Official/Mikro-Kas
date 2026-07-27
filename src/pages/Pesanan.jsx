// ============================================================
// Pesanan.jsx — Pesanan pelanggan + DP (PageKit)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import SearchSelect from "../components/SearchSelect";
import RupiahInput from "../components/RupiahInput";
import {
  PageShell,
  DataPanel,
  DataTable,
  FormModal,
  InfoNote,
  StatusBadge,
  useSearchFilter,
  rupiah,
} from "../components/PageKit";

const statusLabel = { open: "Open", selesai: "Selesai", batal: "Batal" };
const statusTone = { open: "primary", selesai: "success", batal: "danger" };

/**
 * Halaman pre-order pelanggan: total, DP, sisa, jatuh tempo, status.
 * Stok belum berkurang sampai checkout kasir.
 */
export default function Pesanan() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    nama_pemesan: "",
    no_hp: "",
    total: "",
    dp: "",
    jatuh_tempo: "",
    catatan: "",
  });
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustNama, setNewCustNama] = useState("");
  const [newCustTelepon, setNewCustTelepon] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pesanan, customer] = await Promise.all([
        invoke("list_pesanan_customer", { status: tab }),
        invoke("list_customer"),
      ]);
      setRows(pesanan);
      setCustomers(customer);
    } catch (e) {
      addToast(`Gagal memuat pesanan: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          total: acc.total + Number(row.total || 0),
          dp: acc.dp + Number(row.dp || 0),
          sisa: acc.sisa + Number(row.sisa || 0),
        }),
        { total: 0, dp: 0, sisa: 0 }
      ),
    [rows]
  );

  const { query, setQuery, filtered } = useSearchFilter(
    rows,
    (row) => `${row.nama_pemesan || ""} ${row.catatan || ""} ${row.id}`
  );

  const setNumber = (field) => (event) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value.replace(/\D/g, "") }));
  const setText = (field) => (event) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const pickCustomer = (value) => {
    const customer = customers.find((c) => String(c.id) === value);
    setForm((prev) => ({
      ...prev,
      customer_id: value,
      nama_pemesan: customer?.nama || prev.nama_pemesan,
      no_hp: customer?.telepon || prev.no_hp,
    }));
  };

  const resetForm = () =>
    setForm({
      customer_id: "",
      nama_pemesan: "",
      no_hp: "",
      total: "",
      dp: "",
      jatuh_tempo: "",
      catatan: "",
    });

  const createCustomer = async () => {
    if (!newCustNama.trim()) return addToast("Nama customer wajib diisi", "error");
    try {
      const created = await invoke("create_customer", {
        input: { nama: newCustNama.trim(), telepon: newCustTelepon.trim() || null, alamat: null, deskripsi_tambahan: null, limit_kredit: 0 },
      });
      setCustomers((prev) => [...prev, created].sort((a, b) => a.nama.localeCompare(b.nama)));
      pickCustomer(String(created.id));
      setShowNewCustomer(false);
      setNewCustNama("");
      setNewCustTelepon("");
      addToast("Customer ditambahkan", "success");
    } catch (e) {
      addToast(`Gagal tambah customer: ${e}`, "error");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.nama_pemesan.trim()) return addToast("Nama pemesan wajib diisi", "error");
    const total = Number(form.total || 0);
    const dp = Number(form.dp || 0);
    if (total <= 0) return addToast("Total pesanan harus lebih dari 0", "error");
    if (dp > total) return addToast("DP tidak boleh lebih besar dari total", "error");
    setSubmitting(true);
    try {
      await invoke("create_pesanan_customer", {
        input: {
          customer_id: form.customer_id ? Number(form.customer_id) : null,
           nama_pemesan: form.nama_pemesan.trim(),
           no_hp: form.no_hp.trim() || null,
           total,
          dp,
          jatuh_tempo: form.jatuh_tempo || null,
          catatan: form.catatan.trim() || null,
        },
      });
      addToast("Pesanan dicatat", "success");
      setShowForm(false);
      resetForm();
      setTab("open");
      await load();
    } catch (e) {
      addToast(`Gagal simpan pesanan: ${e}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const onStatus = async (id, status) => {
    try {
      await invoke("update_status_pesanan_customer", { id, status });
      addToast(`Status → ${statusLabel[status] || status}`, "success");
      await load();
    } catch (e) {
      addToast(`Gagal ubah status: ${e}`, "error");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Hapus pesanan ini?")) return;
    try {
      await invoke("delete_pesanan_customer", { id });
      addToast("Pesanan dihapus", "success");
      await load();
    } catch (e) {
      addToast(`Gagal hapus: ${e}`, "error");
    }
  };

  const columns = [
    {
      key: "id",
      label: "ID",
      render: (row) => <strong>#{row.id}</strong>,
    },
    {
      key: "nama",
      label: "Pemesan",
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.nama_pemesan}</div>
          {row.catatan && (
            <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
              {row.catatan}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      render: (row) => rupiah(row.total),
    },
    {
      key: "dp",
      label: "DP",
      align: "right",
      render: (row) => <span style={{ color: "var(--color-income-green)" }}>{rupiah(row.dp)}</span>,
    },
    {
      key: "sisa",
      label: "Sisa",
      align: "right",
      render: (row) => (
        <strong style={{ color: Number(row.sisa) > 0 ? "var(--color-warning-amber)" : "var(--color-income-green)" }}>
          {rupiah(row.sisa)}
        </strong>
      ),
    },
    {
      key: "jatuh_tempo",
      label: "Jatuh Tempo",
      render: (row) => row.jatuh_tempo || "—",
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <StatusBadge label={statusLabel[row.status] || row.status} tone={statusTone[row.status] || "neutral"} />
      ),
    },
    {
      key: "aksi",
      label: "Aksi",
      render: (row) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {row.status === "open" && (
            <>
              <button type="button" className="btn-primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => onStatus(row.id, "selesai")}>
                Selesai
              </button>
              <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => onStatus(row.id, "batal")}>
                Batal
              </button>
            </>
          )}
          {row.status !== "open" && (
            <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => onStatus(row.id, "open")}>
              Buka Lagi
            </button>
          )}
          <button type="button" className="btn-icon" onClick={() => onDelete(row.id)} aria-label="hapus pesanan">
            <span className="material-symbols-outlined" style={{ color: "var(--color-expense-red)", fontSize: 18 }}>
              delete
            </span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="PENJUALAN"
      title="Pesanan Pelanggan + DP"
      description="Catat pre-order sebelum jadi penjualan. Stok belum berkurang sampai checkout di kasir."
      actions={
        <button
          type="button"
          className="btn-primary sales-page__add"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <span className="material-symbols-outlined">add</span>
          Pesanan Baru
        </button>
      }
      stats={[
        { label: "Nilai Pesanan", value: rupiah(summary.total), icon: "shopping_bag" },
        { label: "Total DP", value: rupiah(summary.dp), icon: "payments", tone: "var(--color-income-green)" },
        { label: "Sisa Bayar", value: rupiah(summary.sisa), icon: "account_balance_wallet", tone: "var(--color-warning-amber)" },
        { label: "Jumlah", value: filtered.length, icon: "list_alt" },
      ]}
    >
      <InfoNote icon="info">
        Tab Open / Selesai / Batal memfilter status. DP dicatat di sini; pelunasan dan stok diproses saat kasir.
      </InfoNote>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" }}>
        {["open", "selesai", "batal"].map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "btn-primary" : "btn-secondary"}
            onClick={() => setTab(key)}
          >
            {statusLabel[key]}
          </button>
        ))}
      </div>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari pemesan, catatan, atau ID..."
        onRefresh={load}
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon="assignment"
        emptyTitle="Belum ada pesanan"
        emptyHint="Tambah pesanan baru atau pilih tab status lain."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(row) => row.id} />
      </DataPanel>

      {showForm && (
        <FormModal
          title="Pesanan Baru"
          description="Isi total estimasi dan DP. Sisa bayar dihitung otomatis."
          onClose={() => {
            setShowForm(false);
            resetForm();
          }}
          onSubmit={submit}
          submitLabel="Simpan Pesanan"
          submitting={submitting}
        >
          <div>
            <label className="input-label">Pelanggan (opsional)</label>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <SearchSelect
                className="input-field"
                value={form.customer_id}
                onChange={(value) => pickCustomer(value)}
                placeholder="— Tanpa master pelanggan —"
                options={[{ value: "", label: "— Tanpa master pelanggan —" }, ...customers.map((c) => ({ value: String(c.id), label: c.nama }))]}
              />
              <button type="button" className="btn-icon" onClick={() => { setShowNewCustomer(!showNewCustomer); setNewCustNama(""); setNewCustTelepon(""); }} title="Tambah Customer Baru">
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>add_circle</span>
              </button>
            </div>
            {showNewCustomer && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", padding: "8px", borderRadius: "8px", background: "var(--color-surface-container-low)" }}>
                <input className="input-field" style={{ fontSize: "13px" }} placeholder="Nama customer *" value={newCustNama} onChange={(e) => setNewCustNama(e.target.value)} autoFocus />
                <input className="input-field" style={{ fontSize: "13px" }} placeholder="No. HP" value={newCustTelepon} onChange={(e) => setNewCustTelepon(e.target.value.replace(/\D/g, ""))} />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button type="button" className="btn-primary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={createCustomer}>Buat</button>
                  <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={() => setShowNewCustomer(false)}>Batal</button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="input-label">Nama Pemesan *</label>
            <input className="input-field" value={form.nama_pemesan} onChange={setText("nama_pemesan")} placeholder="Nama pemesan" />
          </div>
          <div>
            <label className="input-label">No. HP</label>
            <input className="input-field" value={form.no_hp} onChange={(e) => setForm((p) => ({ ...p, no_hp: e.target.value.replace(/\D/g, "") }))} placeholder="Auto-fill dari pelanggan" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="input-label">Total *</label>
              <RupiahInput value={form.total} onChange={(val) => setForm((p) => ({ ...p, total: val }))} required />
            </div>
            <div>
              <label className="input-label">DP</label>
              <RupiahInput value={form.dp} onChange={(val) => setForm((p) => ({ ...p, dp: val }))} />
            </div>
          </div>
          <div>
            <label className="input-label">Jatuh Tempo</label>
            <DateField value={form.jatuh_tempo} onChange={(v) => setText("jatuh_tempo")({ target: { value: v } })} />
          </div>
          <div>
            <label className="input-label">Catatan</label>
            <textarea className="input-field" rows={2} value={form.catatan} onChange={setText("catatan")} placeholder="Opsional" />
          </div>
          {(Number(form.total) > 0 || Number(form.dp) > 0) && (
            <div className="store-profile-help">
              <span className="material-symbols-outlined">calculate</span>
              <span>
                Sisa bayar: <strong>{rupiah(Math.max(0, Number(form.total || 0) - Number(form.dp || 0)))}</strong>
              </span>
            </div>
          )}
        </FormModal>
      )}
    </PageShell>
  );
}
