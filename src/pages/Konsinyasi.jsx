import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const emptyMasuk = { nomor: "", tanggal: new Date().toISOString().slice(0, 10), supplier_id: "", total_item: "", catatan: "" };
const emptyKeluar = { nomor: "", tanggal: new Date().toISOString().slice(0, 10), penerima_nama: "", penerima_telepon: "", total_item: "", catatan: "" };

export default function Konsinyasi() {
  const { addToast } = useToast();
  const [masuk, setMasuk] = useState([]);
  const [keluar, setKeluar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("masuk");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyMasuk);

  const load = async () => {
    setLoading(true);
    try {
      const [m, k] = await Promise.all([invoke("list_konsinyasi_masuk"), invoke("list_konsinyasi_keluar")]);
      setMasuk(Array.isArray(m) ? m : []);
      setKeluar(Array.isArray(k) ? k : []);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = activeTab === "masuk" ? masuk : keluar;
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => `${item.nomor} ${item.tanggal} ${item.status} ${item.penerima_nama || ""} ${item.catatan || ""}`.toLowerCase().includes(term));
  }, [rows, query]);

  const totalItems = [...masuk, ...keluar].reduce((sum, item) => sum + Number(item.total_item || 0), 0);

  const openForm = (type) => {
    setActiveTab(type);
    setForm(type === "masuk" ? { ...emptyMasuk } : { ...emptyKeluar });
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.nomor.trim() || !form.tanggal) return addToast("Nomor dan tanggal wajib diisi", "error");
    if (activeTab === "keluar" && !form.penerima_nama.trim()) return addToast("Nama penerima wajib diisi", "error");
    try {
      if (activeTab === "masuk") {
        await invoke("create_konsinyasi_masuk", { input: { nomor: form.nomor.trim(), tanggal: form.tanggal, supplier_id: form.supplier_id ? Number(form.supplier_id) : null, total_item: form.total_item ? Number(form.total_item) : null, catatan: form.catatan.trim() || null } });
      } else {
        await invoke("create_konsinyasi_keluar", { input: { nomor: form.nomor.trim(), tanggal: form.tanggal, penerima_nama: form.penerima_nama.trim(), penerima_telepon: form.penerima_telepon.trim() || null, total_item: form.total_item ? Number(form.total_item) : null, catatan: form.catatan.trim() || null } });
      }
      setShowForm(false);
      addToast(`Konsinyasi ${activeTab} ditambahkan`, "success");
      load();
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">INVENTORI</p>
          <h1 className="text-headline-lg">Konsinyasi</h1>
          <p className="text-body-md sales-page__subtitle">Kelola barang konsinyasi masuk dari supplier dan keluar ke penerima.</p>
        </div>
        <div className="sales-page__add"><button className="btn-secondary" onClick={() => openForm("masuk")}><span className="material-symbols-outlined">move_to_inbox</span>Barang Masuk</button><button className="btn-primary" onClick={() => openForm("keluar")}><span className="material-symbols-outlined">outbox</span>Barang Keluar</button></div>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined">move_to_inbox</span><div><span>Konsinyasi Masuk</span><strong>{masuk.length}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">outbox</span><div><span>Konsinyasi Keluar</span><strong>{keluar.length}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">inventory_2</span><div><span>Total Item</span><strong>{totalItems.toLocaleString("id-ID")}</strong></div></div>
      </section>

      <section className="sales-panel">
        <div className="sales-panel__toolbar"><div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nomor, penerima, status, atau catatan..." /></div><button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button></div>
        <div style={{ display: "flex", gap: 4, padding: "10px 16px", borderBottom: "1px solid var(--color-surface-border)" }}><button className={activeTab === "masuk" ? "btn-primary" : "btn-secondary"} onClick={() => setActiveTab("masuk")}>Konsinyasi Masuk ({masuk.length})</button><button className={activeTab === "keluar" ? "btn-primary" : "btn-secondary"} onClick={() => setActiveTab("keluar")}>Konsinyasi Keluar ({keluar.length})</button></div>
        {loading ? <div className="loading-page"><div className="spinner" /></div> : filtered.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">inventory_2</span><p>Belum ada data konsinyasi {activeTab}</p></div> : (
          <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Nomor</th><th>Tanggal</th><th>{activeTab === "masuk" ? "Supplier" : "Penerima"}</th><th>Total Item</th><th>Status</th><th>Catatan</th><th>Dibuat</th></tr></thead><tbody>
            {filtered.map((item) => <tr key={item.id}><td><div className="sales-name" style={{ cursor: "default" }}><span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>{activeTab === "masuk" ? "move_to_inbox" : "outbox"}</span></span><span><strong>{item.nomor}</strong><small>{activeTab === "keluar" ? item.penerima_telepon || "Tanpa telepon" : `Supplier #${item.supplier_id || "-"}`}</small></span></div></td><td>{item.tanggal}</td><td>{activeTab === "masuk" ? (item.supplier_id ? `Supplier #${item.supplier_id}` : "-") : item.penerima_nama}</td><td style={{ fontWeight: 700 }}>{Number(item.total_item || 0).toLocaleString("id-ID")}</td><td><span style={{ color: item.status === "selesai" ? "#22c55e" : "#f59e0b", fontWeight: 700, fontSize: 12, textTransform: "capitalize" }}>{item.status}</span></td><td style={{ color: "var(--color-text-secondary)" }}>{item.catatan || "-"}</td><td style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{item.created_at?.slice(0, 10) || "-"}</td></tr>)}
          </tbody></table></div>
        )}
      </section>

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">Konsinyasi {activeTab === "masuk" ? "Masuk" : "Keluar"}</h2><p className="text-body-md">Catat header transaksi konsinyasi.</p></div><button className="btn-icon" onClick={() => setShowForm(false)}><span className="material-symbols-outlined">close</span></button></div><form onSubmit={handleSubmit} className="sales-form">
        <label className="input-label">Nomor *<input className="input-field" placeholder="Contoh: KON-2026-001" value={form.nomor} onChange={(e) => setForm((p) => ({ ...p, nomor: e.target.value }))} /></label>
        <label className="input-label">Tanggal *<input className="input-field" type="date" value={form.tanggal} onChange={(e) => setForm((p) => ({ ...p, tanggal: e.target.value }))} /></label>
        {activeTab === "masuk" ? <label className="input-label">ID Supplier<input className="input-field" inputMode="numeric" placeholder="Opsional" value={form.supplier_id} onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value.replace(/\D/g, "") }))} /></label> : <><label className="input-label">Nama Penerima *<input className="input-field" value={form.penerima_nama} onChange={(e) => setForm((p) => ({ ...p, penerima_nama: e.target.value }))} /></label><label className="input-label">Telepon Penerima<input className="input-field" inputMode="tel" value={form.penerima_telepon} onChange={(e) => setForm((p) => ({ ...p, penerima_telepon: e.target.value }))} /></label></>}
        <label className="input-label">Total Item<input className="input-field" inputMode="numeric" placeholder="0" value={form.total_item} onChange={(e) => setForm((p) => ({ ...p, total_item: e.target.value.replace(/\D/g, "") }))} /></label>
        <label className="input-label">Catatan<input className="input-field" value={form.catatan} onChange={(e) => setForm((p) => ({ ...p, catatan: e.target.value }))} /></label>
        <div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button><button type="submit" className="btn-primary">Simpan</button></div>
      </form></div></div>}
    </div>
  );
}
