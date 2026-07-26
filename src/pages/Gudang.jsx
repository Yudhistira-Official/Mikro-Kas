import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function Gudang() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nama: "", alamat: "" });

  const load = async () => {
    setLoading(true);
    try { setList(await invoke("list_gudang")); }
    catch (error) { addToast(String(error), "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((g) => `${g.nama} ${g.alamat || ""}`.toLowerCase().includes(query.toLowerCase())), [list, query]);
  const openForm = (item = null) => { setEditing(item); setForm(item ? { nama: item.nama, alamat: item.alamat || "" } : { nama: "", alamat: "" }); setShowForm(true); };
  const save = async (event) => {
    event.preventDefault();
    if (!form.nama.trim()) return addToast("Nama gudang wajib diisi", "error");
    try {
      if (editing) {
        const oldData = { ...editing };
        await invoke("update_gudang", { id: editing.id, nama: form.nama, alamat: form.alamat || null });
        addToast("Gudang diperbarui", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("update_gudang", { id: oldData.id, nama: oldData.nama, alamat: oldData.alamat });
            load();
          },
        });
      } else {
        const createdId = await invoke("create_gudang", { nama: form.nama, alamat: form.alamat || null });
        addToast("Gudang ditambahkan", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("delete_gudang", { id: createdId });
            load();
          },
        });
      }
      setShowForm(false); load();
    } catch (error) { addToast(String(error), "error"); }
  };
  const remove = async (item) => {
    if (item.is_default) return addToast("Gudang default tidak dapat dinonaktifkan", "error");
    if (!window.confirm(`Nonaktifkan gudang ${item.nama}?`)) return;
    const snapshot = { ...item };
    try {
      await invoke("delete_gudang", { id: item.id });
      addToast("Gudang dinonaktifkan", "success", {
        label: "Urungkan",
        action: async () => {
          await invoke("create_gudang", { nama: snapshot.nama, alamat: snapshot.alamat });
          load();
        },
      });
      load();
    } catch (error) { addToast(String(error), "error"); }
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header"><div><p className="sales-page__eyebrow">MASTER DATA</p><h1 className="text-headline-lg">Departemen / Gudang</h1><p className="text-body-md sales-page__subtitle">Kelola lokasi penyimpanan stok. Gudang default menjadi lokasi utama transaksi.</p></div><button className="btn-primary sales-page__add" onClick={() => openForm()}><span className="material-symbols-outlined">add_business</span>Tambah Gudang</button></header>
      <section className="sales-stats"><div className="sales-stat-card"><span className="material-symbols-outlined">warehouse</span><div><span>Total Gudang</span><strong>{list.length}</strong></div></div><div className="sales-stat-card"><span className="material-symbols-outlined">home_work</span><div><span>Gudang Default</span><strong>{list.filter((g) => g.is_default).length}</strong></div></div><div className="sales-stat-card"><span className="material-symbols-outlined">location_on</span><div><span>Dengan Alamat</span><strong>{list.filter((g) => g.alamat).length}</strong></div></div></section>
      <section className="sales-panel"><div className="sales-panel__toolbar"><div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama atau alamat gudang..." /></div><button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button></div>{loading ? <div className="loading-page"><div className="spinner" /></div> : filtered.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">warehouse</span><p>Belum ada gudang</p></div> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Gudang</th><th>Alamat</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{filtered.map((g) => <tr key={g.id}><td><div className="sales-name"><span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 18 }}>warehouse</span></span><span><strong>{g.nama}</strong><small>ID: {g.id}</small></span></div></td><td>{g.alamat || "-"}</td><td><span className="badge" style={{ background: g.is_default ? "var(--color-primary-fixed)" : "var(--color-surface-container-high)", color: g.is_default ? "var(--color-primary)" : "var(--color-text-secondary)" }}>{g.is_default ? "Default" : "Aktif"}</span></td><td><div className="sales-row-actions"><button className="btn-icon" onClick={() => openForm(g)} title="Edit"><span className="material-symbols-outlined">edit</span></button><button className="btn-icon" onClick={() => remove(g)} title="Nonaktifkan" disabled={g.is_default}><span className="material-symbols-outlined">delete</span></button></div></td></tr>)}</tbody></table></div>}</section>
      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content sales-form-modal" onClick={(e) => e.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">{editing ? "Edit Gudang" : "Tambah Gudang"}</h2><p className="text-body-md">Tentukan lokasi penyimpanan stok.</p></div><button className="btn-icon" onClick={() => setShowForm(false)}><span className="material-symbols-outlined">close</span></button></div><form onSubmit={save} className="sales-form"><label>Nama Gudang *<input className="input-field" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></label><label>Alamat<input className="input-field" value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button><button className="btn-primary">Simpan</button></div></form></div></div>}
    </div>
  );
}
