// ============================================================
// Pesanan.jsx — Pesanan pelanggan + DP/down payment.
//
// Tujuan:
//   - Mencatat pre-order pelanggan sebelum jadi transaksi penjualan.
//   - Menyimpan total, DP, sisa bayar, jatuh tempo, status.
//   - Tidak mengurangi stok otomatis; stok baru berubah saat kasir checkout.
//
// UX:
//   - Tab Open/Selesai/Batal.
//   - Summary cepat untuk total nilai pesanan, DP, sisa bayar.
//   - Form ringkas sesuai desain Stitch "Pesanan Pelanggan + DP".
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
const statusLabel = { open: "Open", selesai: "Selesai", batal: "Batal" };

export default function Pesanan() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: "", nama_pemesan: "", total: "", dp: "", jatuh_tempo: "", catatan: "" });

  const load = async () => {
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
  };

  useEffect(() => { load(); }, [tab]);

  const summary = useMemo(() => rows.reduce((acc, row) => ({
    total: acc.total + Number(row.total || 0),
    dp: acc.dp + Number(row.dp || 0),
    sisa: acc.sisa + Number(row.sisa || 0),
  }), { total: 0, dp: 0, sisa: 0 }), [rows]);

  const setNumber = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value.replace(/\D/g, "") }));
  const setText = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const pickCustomer = (value) => {
    const customer = customers.find((c) => String(c.id) === value);
    setForm((prev) => ({
      ...prev,
      customer_id: value,
      nama_pemesan: customer?.nama || prev.nama_pemesan,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.nama_pemesan.trim()) return addToast("Nama pemesan wajib diisi", "error");
    const total = Number(form.total || 0);
    const dp = Number(form.dp || 0);
    if (dp > total) return addToast("DP tidak boleh lebih besar dari total", "error");
    try {
      await invoke("create_pesanan_customer", {
        input: {
          customer_id: form.customer_id ? Number(form.customer_id) : null,
          nama_pemesan: form.nama_pemesan.trim(),
          total,
          dp,
          jatuh_tempo: form.jatuh_tempo || null,
          catatan: form.catatan.trim() || null,
        },
      });
      setForm({ customer_id: "", nama_pemesan: "", total: "", dp: "", jatuh_tempo: "", catatan: "" });
      setShowForm(false);
      addToast("Pesanan disimpan", "success");
      load();
    } catch (e) {
      addToast(`Gagal simpan: ${e}`, "error");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await invoke("update_status_pesanan_customer", { id, status });
      addToast(`Pesanan ${statusLabel[status].toLowerCase()}`, "success");
      load();
    } catch (e) {
      addToast(`Gagal ubah status: ${e}`, "error");
    }
  };

  const remove = async (id) => {
    if (!confirm("Hapus pesanan ini?")) return;
    try {
      await invoke("delete_pesanan_customer", { id });
      addToast("Pesanan dihapus", "success");
      load();
    } catch (e) {
      addToast(`Gagal hapus: ${e}`, "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "88px" }}>
      <div>
        <p className="text-headline-md">Pesanan Pelanggan</p>
        <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>Pre-order + DP sebelum checkout kasir.</p>
      </div>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", padding: "0.5rem", background: "var(--color-surface-container-low)" }}>
        {["open", "selesai", "batal"].map((s) => (
          <button key={s} className={tab === s ? "btn-primary" : "btn-secondary"} onClick={() => setTab(s)}>{statusLabel[s]}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
        <SummaryCard label="Total" value={rupiah(summary.total)} color="var(--color-primary)" />
        <SummaryCard label="DP" value={rupiah(summary.dp)} color="var(--color-income-green)" />
        <SummaryCard label="Sisa" value={rupiah(summary.sisa)} color="var(--color-warning-amber)" />
      </div>

      <button className="btn-primary" onClick={() => setShowForm(true)} style={{ width: "100%" }}>+ Tambah Pesanan</button>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><span className="material-symbols-outlined">assignment</span><p className="text-body-md">Belum ada pesanan</p></div>
      ) : (
        rows.map((row) => <PesananCard key={row.id} row={row} onStatus={updateStatus} onDelete={remove} />)
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>Tambah Pesanan Baru</h3>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="input-label">Pilih Pelanggan</label>
                <select className="input-field" value={form.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
                  <option value="">— Manual / pelanggan baru —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
                </select>
              </div>
              <div><label className="input-label">Nama Pemesan *</label><input className="input-field" value={form.nama_pemesan} onChange={setText("nama_pemesan")} placeholder="Nama pelanggan" /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div><label className="input-label">Total Pesanan</label><input className="input-field" inputMode="numeric" value={form.total} onChange={setNumber("total")} placeholder="0" /></div>
                <div><label className="input-label">DP / Uang Muka</label><input className="input-field" inputMode="numeric" value={form.dp} onChange={setNumber("dp")} placeholder="0" /></div>
              </div>
              <div><label className="input-label">Jatuh Tempo</label><input className="input-field" type="date" value={form.jatuh_tempo} onChange={setText("jatuh_tempo")} /></div>
              <div><label className="input-label">Catatan Item</label><textarea className="input-field" rows={3} value={form.catatan} onChange={setText("catatan")} placeholder="Contoh: 2 box snack, ambil Jumat sore" /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
                <button type="submit" className="btn-primary">Simpan Pesanan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: "0.75rem", background: "var(--color-surface-container-lowest)" }}>
      <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <p className="text-headline-sm" style={{ color, marginTop: "0.25rem" }}>{value}</p>
    </div>
  );
}

function PesananCard({ row, onStatus, onDelete }) {
  const sisaColor = row.sisa > 0 ? "var(--color-warning-amber)" : "var(--color-income-green)";
  return (
    <div className="card" style={{ padding: "1rem", borderLeft: `4px solid ${sisaColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
        <div>
          <p className="text-headline-sm">{row.nama_pemesan}</p>
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.2rem" }}>{row.customer_nama || "Pelanggan manual"}</p>
        </div>
        <span className="badge" style={{ background: "rgba(6,182,212,0.16)", color: "var(--color-secondary)" }}>{statusLabel[row.status]}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginTop: "0.85rem" }}>
        <SummaryMini label="Total" value={rupiah(row.total)} />
        <SummaryMini label="DP" value={rupiah(row.dp)} />
        <SummaryMini label="Sisa" value={rupiah(row.sisa)} color={sisaColor} />
      </div>
      {row.jatuh_tempo && <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.75rem" }}>Jatuh tempo: {row.jatuh_tempo}</p>}
      {row.catatan && <p className="text-body-md" style={{ marginTop: "0.5rem" }}>{row.catatan}</p>}
      <div style={{ display: "grid", gridTemplateColumns: row.status === "open" ? "1fr 1fr 44px" : "1fr 44px", gap: "0.5rem", marginTop: "0.85rem" }}>
        {row.status === "open" && <button className="btn-primary" onClick={() => onStatus(row.id, "selesai")}>Selesai</button>}
        {row.status === "open" && <button className="btn-secondary" onClick={() => onStatus(row.id, "batal")}>Batal</button>}
        {row.status !== "open" && <button className="btn-secondary" onClick={() => onStatus(row.id, "open")}>Buka Lagi</button>}
        <button className="btn-icon" onClick={() => onDelete(row.id)} aria-label="hapus pesanan"><span className="material-symbols-outlined" style={{ color: "var(--color-expense-red)" }}>delete</span></button>
      </div>
    </div>
  );
}

function SummaryMini({ label, value, color = "var(--color-text-primary)" }) {
  return <div><p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{label}</p><p className="text-body-md" style={{ color, fontWeight: 700 }}>{value}</p></div>;
}
