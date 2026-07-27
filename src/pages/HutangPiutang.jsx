// ============================================================
// HutangPiutang.jsx — Hutang supplier & piutang customer (PageKit).
//
// Commands: list_hutang_piutang, list_customer, list_supplier,
//   create_hutang_piutang, bayar_hutang_piutang, delete_hutang_piutang
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import RupiahInput from "../components/RupiahInput";
import SearchSelect from "../components/SearchSelect";
import { formatDateId } from "../utils/dateFormat";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge,
  useSearchFilter, rupiah,
} from "../components/PageKit";

/**
 * Hitung selisih hari jatuh tempo vs hari ini (null jika tanpa tanggal).
 */
function getDaysDiff(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}

/**
 * Halaman kelola hutang/piutang + cicilan + reminder jatuh tempo.
 */
export default function HutangPiutang() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("hutang");
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBayar, setShowBayar] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    tipe: "hutang", kontak_id: "", kontak_tipe: "supplier", jumlah: "", keterangan: "", jatuh_tempo: "",
  });
  const [bayarJumlah, setBayarJumlah] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hpData, custData, suppData] = await Promise.all([
        invoke("list_hutang_piutang"),
        invoke("list_customer"),
        invoke("list_supplier"),
      ]);
      setList(hpData);
      setCustomers(custData);
      setSuppliers(suppData);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const baseRows = list
    .filter((x) => x.tipe === tab)
    .filter((x) => statusFilter === "all" || (statusFilter === "belum_lunas" ? x.status !== "lunas" : x.status === "lunas"));

  const nameOf = useCallback((item) => {
    if (item.kontak_tipe === "customer") {
      return customers.find((c) => c.id === item.kontak_id)?.nama || `Pelanggan #${item.kontak_id}`;
    }
    return suppliers.find((s) => s.id === item.kontak_id)?.nama || `Supplier #${item.kontak_id}`;
  }, [customers, suppliers]);

  const { query, setQuery, filtered } = useSearchFilter(
    baseRows,
    (item) => `${nameOf(item)} ${item.keterangan || ""} ${item.jatuh_tempo || ""}`
  );

  const kontakList = form.kontak_tipe === "customer" ? customers : suppliers;
  const totalBelumLunas = baseRows
    .filter((x) => x.status !== "lunas")
    .reduce((sum, x) => sum + (x.jumlah - x.jumlah_bayar), 0);
  const totalLewatTempoCount = baseRows
    .filter((x) => x.status !== "lunas" && x.jatuh_tempo)
    .filter((x) => {
      const diff = getDaysDiff(x.jatuh_tempo);
      return diff !== null && diff < 0;
    }).length;

  /** Simpan catatan hutang/piutang baru. */
  const save = async (e) => {
    e.preventDefault();
    const jumlah = Number(form.jumlah);
    if (!jumlah || jumlah <= 0) return addToast("Jumlah harus diisi", "error");
    if (!form.kontak_id) return addToast("Kontak harus dipilih", "error");
    setSubmitting(true);
    try {
      await invoke("create_hutang_piutang", {
        input: {
          tipe: form.tipe,
          kontak_id: Number(form.kontak_id),
          kontak_tipe: form.kontak_tipe,
          jumlah,
          keterangan: form.keterangan.trim() || null,
          tanggal: null,
          jatuh_tempo: form.jatuh_tempo || null,
        },
      });
      addToast("Catatan ditambahkan", "success");
      setShowForm(false);
      setForm({
        tipe: tab,
        kontak_id: "",
        kontak_tipe: tab === "hutang" ? "supplier" : "customer",
        jumlah: "",
        keterangan: "",
        jatuh_tempo: "",
      });
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  /** Catat cicilan pembayaran. */
  const bayar = async (e) => {
    e.preventDefault();
    const nominal = Number(bayarJumlah);
    if (!nominal || nominal <= 0) return addToast("Nominal harus diisi", "error");
    setSubmitting(true);
    try {
      await invoke("bayar_hutang_piutang", { input: { id: selectedItem.id, jumlah_bayar: nominal } });
      addToast("Pembayaran cicilan berhasil dicatat", "success");
      setShowBayar(false);
      setBayarJumlah("");
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  /** Hapus catatan setelah konfirmasi. */
  const hapus = async (id) => {
    if (!window.confirm("Hapus catatan ini?")) return;
    try {
      await invoke("delete_hutang_piutang", { id });
      addToast("Terhapus", "success");
      load();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  /** Badge status jatuh tempo. */
  const dueBadge = (jatuhTempo, status) => {
    if (status === "lunas" || !jatuhTempo) return null;
    const diff = getDaysDiff(jatuhTempo);
    if (diff < 0) return <StatusBadge label={`Lewat ${Math.abs(diff)} hari`} tone="danger" />;
    if (diff === 0) return <StatusBadge label="Jatuh tempo hari ini" tone="warning" />;
    return <StatusBadge label={`${diff} hari lagi`} tone="primary" />;
  };

  const openForm = () => {
    setForm({
      tipe: tab,
      kontak_id: "",
      kontak_tipe: tab === "hutang" ? "supplier" : "customer",
      jumlah: "",
      keterangan: "",
      jatuh_tempo: "",
    });
    setShowForm(true);
  };

  const columns = [
    {
      key: "kontak", label: "Kontak",
      render: (item) => (
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <b>{nameOf(item)}</b>
            <StatusBadge label={item.status === "lunas" ? "Lunas" : "Belum lunas"} tone={item.status === "lunas" ? "success" : "warning"} />
            {dueBadge(item.jatuh_tempo, item.status)}
          </div>
          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
            {formatDateId(item.tanggal)}
            {item.jatuh_tempo ? ` · JT ${item.jatuh_tempo}` : ""}
            {item.keterangan ? ` · ${item.keterangan}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "nominal", label: "Nominal", align: "right",
      render: (item) => (
        <div>
          <div className="text-label-md">{rupiah(item.jumlah)} · bayar {rupiah(item.jumlah_bayar)}</div>
          <b style={{ color: item.status === "lunas" ? "#047857" : "#B91C1C" }}>
            {item.status === "lunas" ? "Lunas" : `Sisa ${rupiah(item.jumlah - item.jumlah_bayar)}`}
          </b>
        </div>
      ),
    },
    {
      key: "aksi", label: "", align: "right",
      render: (item) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {item.status !== "lunas" && (
            <button
              type="button"
              className="btn-icon"
              title="Bayar cicilan"
              onClick={() => { setSelectedItem(item); setBayarJumlah(""); setShowBayar(true); }}
            >
              <span className="material-symbols-outlined">payments</span>
            </button>
          )}
          <button type="button" className="btn-icon" onClick={() => hapus(item.id)} title="Hapus">
            <span className="material-symbols-outlined" style={{ color: "#B91C1C" }}>delete</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="KEUANGAN"
      title="Hutang & Piutang"
      description="Catat hutang ke supplier dan piutang dari pelanggan. Bayar cicilan kapan saja, pantau yang lewat tempo."
      actions={
        <button type="button" className="btn-primary" onClick={openForm}>
          <span className="material-symbols-outlined">add</span> Catatan
        </button>
      }
      stats={[
        {
          label: "Belum lunas",
          value: rupiah(totalBelumLunas),
          icon: "account_balance_wallet",
          tone: tab === "hutang" ? "#B91C1C" : "#047857",
        },
        {
          label: "Lewat tempo",
          value: `${totalLewatTempoCount} catatan`,
          icon: "event_busy",
          tone: totalLewatTempoCount > 0 ? "#B91C1C" : undefined,
        },
        { label: "Ditampilkan", value: filtered.length, icon: "list_alt" },
      ]}
    >
      <InfoNote>
        Hutang = utang toko ke supplier. Piutang = tagihan ke pelanggan. Isi jatuh tempo agar reminder muncul otomatis.
      </InfoNote>

      <div className="filter-row" style={{ marginBottom: 8 }}>
        <button type="button" className={`filter-chip${tab === "hutang" ? " active" : ""}`} onClick={() => setTab("hutang")}>Hutang (Supplier)</button>
        <button type="button" className={`filter-chip${tab === "piutang" ? " active" : ""}`} onClick={() => setTab("piutang")}>Piutang (Pelanggan)</button>
      </div>
      <div className="filter-row" style={{ marginBottom: 12 }}>
        {[
          { value: "all", label: "Semua" },
          { value: "belum_lunas", label: "Belum Lunas" },
          { value: "lunas", label: "Lunas" },
        ].map((f) => (
          <button key={f.value} type="button" className={`filter-chip${statusFilter === f.value ? " active" : ""}`} onClick={() => setStatusFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari nama kontak / keterangan..."
        onRefresh={load}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon="payments"
        emptyTitle={`Belum ada catatan ${tab === "hutang" ? "hutang" : "piutang"}`}
        emptyHint="Klik + Catatan untuk menambahkan."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(item) => item.id} />
      </DataPanel>

      {showForm && (
        <FormModal
          title="Tambah Catatan"
          description="Pilih tipe, kontak, nominal, dan opsional tanggal jatuh tempo."
          onClose={() => setShowForm(false)}
          onSubmit={save}
          submitLabel="Simpan"
          submitting={submitting}
        >
          <div className="filter-row">
            <button type="button" className={`filter-chip${form.tipe === "hutang" ? " active" : ""}`} onClick={() => setForm((p) => ({ ...p, tipe: "hutang", kontak_tipe: "supplier", kontak_id: "" }))}>Hutang</button>
            <button type="button" className={`filter-chip${form.tipe === "piutang" ? " active" : ""}`} onClick={() => setForm((p) => ({ ...p, tipe: "piutang", kontak_tipe: "customer", kontak_id: "" }))}>Piutang</button>
          </div>
          <label className="input-label">Pilih {form.kontak_tipe === "customer" ? "Pelanggan" : "Supplier"} *</label>
           <SearchSelect
             className="input-field"
             value={form.kontak_id}
             onChange={(value) => setForm((p) => ({ ...p, kontak_id: value }))}
             placeholder="— Pilih Kontak —"
             required
             options={kontakList.map((k) => ({ value: String(k.id), label: k.nama }))}
           />
          <label className="input-label">Jumlah nominal *</label>
          <RupiahInput value={form.jumlah} onChange={(val) => setForm((p) => ({ ...p, jumlah: val }))} placeholder="Nominal Rp" required />
          <label className="input-label">Tanggal Jatuh Tempo</label>
          <DateField value={form.jatuh_tempo} onChange={(v) => setForm((p) => ({ ...p, jatuh_tempo: v }))} />
          <label className="input-label">Keterangan</label>
          <input className="input-field" placeholder="Opsional" value={form.keterangan} onChange={(e) => setForm((p) => ({ ...p, keterangan: e.target.value }))} />
        </FormModal>
      )}

      {showBayar && selectedItem && (
        <FormModal
          title="Bayar Cicilan"
          description={`Sisa tagihan: ${rupiah(selectedItem.jumlah - selectedItem.jumlah_bayar)}`}
          onClose={() => setShowBayar(false)}
          onSubmit={bayar}
          submitLabel="Bayar"
          submitting={submitting}
        >
          <label className="input-label">Nominal Bayar *</label>
          <div style={{ display: "flex", gap: 6 }}>
            <RupiahInput style={{ flex: 1 }} placeholder="Nominal Rp" value={bayarJumlah} onChange={(val) => setBayarJumlah(val)} />
            <button
              type="button"
              className="btn-secondary"
              style={{ whiteSpace: "nowrap" }}
              onClick={() => setBayarJumlah(String(selectedItem.jumlah - selectedItem.jumlah_bayar))}
            >
              Bayar Lunas
            </button>
          </div>
        </FormModal>
      )}
    </PageShell>
  );
}
