import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (value) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

export default function SalesKomisi() {
  const { addToast } = useToast();
  const [sales, setSales] = useState([]);
  const [komisi, setKomisi] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nama: "", kode: "", telepon: "", email: "" });
  const [selectedSales, setSelectedSales] = useState(null);
  const [payment, setPayment] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [salesData, komisiData] = await Promise.all([
        invoke("list_sales"),
        invoke("list_komisi_terutang", { sales_id: null, status: null }),
      ]);
      setSales(salesData || []);
      setKomisi(komisiData || []);
    } catch (error) {
      addToast(String(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredSales = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sales.filter((item) => `${item.nama} ${item.kode || ""} ${item.telepon || ""} ${item.email || ""}`.toLowerCase().includes(term));
  }, [sales, query]);

  const openForm = (item = null) => {
    setEditing(item);
    setForm(item ? { nama: item.nama, kode: item.kode || "", telepon: item.telepon || "", email: item.email || "" } : { nama: "", kode: "", telepon: "", email: "" });
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.nama.trim()) return addToast("Nama sales wajib diisi", "error");
    const input = { nama: form.nama.trim(), kode: form.kode.trim() || null, telepon: form.telepon.trim() || null, email: form.email.trim() || null };
    try {
      if (editing) {
        const oldData = { ...editing };
        await invoke("update_sales", { id: editing.id, input });
        setShowForm(false);
        addToast("Data sales diperbarui", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("update_sales", {
              id: oldData.id,
              input: {
                nama: oldData.nama,
                kode: oldData.kode,
                telepon: oldData.telepon,
                email: oldData.email,
              },
            });
            load();
          },
        });
      } else {
        const createdId = await invoke("create_sales", { input });
        setShowForm(false);
        addToast("Sales ditambahkan", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("delete_sales", { id: createdId });
            load();
          },
        });
      }
      await load();
    } catch (error) { addToast(String(error), "error"); } 
  };

  const remove = async (id) => {
    if (!window.confirm("Nonaktifkan sales ini?")) return;
    const snapshot = sales.find((item) => item.id === id);
    if (!snapshot) return;
    try {
      await invoke("delete_sales", { id });
      addToast("Sales dinonaktifkan", "success", {
        label: "Urungkan",
        action: async () => {
          await invoke("create_sales", {
            input: {
              nama: snapshot.nama,
              kode: snapshot.kode,
              telepon: snapshot.telepon,
              email: snapshot.email,
            },
          });
          load();
        },
      });
      load();
    } catch (error) { addToast(String(error), "error"); }
  };

  const payCommission = async (item) => {
    const amount = Number(payment[item.id] || item.sisa || 0);
    if (amount <= 0 || amount > item.sisa) return addToast("Nominal pembayaran komisi tidak valid", "error");
    try {
      await invoke("bayar_komisi", { komisi_id: item.id, jumlah_bayar: amount });
      setPayment((prev) => ({ ...prev, [item.id]: "" }));
      addToast("Pembayaran komisi dicatat", "success");
      load();
    } catch (error) { addToast(String(error), "error"); }
  };

  const selectedCommissions = selectedSales ? komisi.filter((item) => item.sales_id === selectedSales.id) : [];
  const totalPending = komisi.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
  const totalPaid = komisi.reduce((sum, item) => sum + Number(item.sudah_dibayar || 0), 0);

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">MASTER DATA</p>
          <h1 className="text-headline-lg">Daftar Sales</h1>
          <p className="text-body-md sales-page__subtitle">Kelola tenaga penjualan, kontak, dan pembayaran komisi secara terpusat.</p>
        </div>
        <button className="btn-primary sales-page__add" onClick={() => openForm()}><span className="material-symbols-outlined">person_add</span>Tambah Sales</button>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined">groups</span><div><span>Sales Aktif</span><strong>{sales.length}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">pending_actions</span><div><span>Komisi Terutang</span><strong>{rupiah(totalPending)}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">payments</span><div><span>Komisi Terbayar</span><strong>{rupiah(totalPaid)}</strong></div></div>
      </section>

      <section className="sales-panel">
        <div className="sales-panel__toolbar"><div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, kode, telepon, atau email..." /></div><button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button></div>
        {loading ? <div className="loading-page"><div className="spinner" /></div> : filteredSales.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">groups</span><p>Belum ada data sales</p></div> : (
          <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Sales</th><th>Kode</th><th>Kontak</th><th>Komisi Terutang</th><th>Aksi</th></tr></thead><tbody>{filteredSales.map((item) => { const due = komisi.filter((row) => row.sales_id === item.id).reduce((sum, row) => sum + Number(row.sisa || 0), 0); return <tr key={item.id}><td><button className="sales-name" onClick={() => setSelectedSales(item)}><span className="sales-avatar">{item.nama.charAt(0).toUpperCase()}</span><span><strong>{item.nama}</strong><small>{item.email || "Tanpa email"}</small></span></button></td><td>{item.kode || "-"}</td><td>{item.telepon || "-"}</td><td className={due ? "sales-amount sales-amount--warning" : "sales-amount"}>{rupiah(due)}</td><td><div className="sales-row-actions"><button className="btn-icon" onClick={() => openForm(item)} title="Edit"><span className="material-symbols-outlined">edit</span></button><button className="btn-icon" onClick={() => remove(item.id)} title="Nonaktifkan"><span className="material-symbols-outlined">delete</span></button></div></td></tr>; })}</tbody></table></div>
        )}
      </section>

      {selectedSales && <div className="modal-overlay" onClick={() => setSelectedSales(null)}><div className="modal-content sales-commission-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">Komisi {selectedSales.nama}</h2><p className="text-body-md">Rincian komisi terutang per periode.</p></div><button className="btn-icon" onClick={() => setSelectedSales(null)}><span className="material-symbols-outlined">close</span></button></div>{selectedCommissions.length === 0 ? <div className="empty-state"><p>Belum ada komisi tercatat</p></div> : <div className="commission-list">{selectedCommissions.map((item) => <div className="commission-row" key={item.id}><div><strong>{item.periode}</strong><small>Total {rupiah(item.total_komisi)} · Sisa {rupiah(item.sisa)}</small></div><div className="commission-pay"><input className="input-field" inputMode="numeric" placeholder={String(item.sisa)} value={payment[item.id] || ""} onChange={(event) => setPayment((prev) => ({ ...prev, [item.id]: event.target.value.replace(/\D/g, "") }))} /><button className="btn-primary" onClick={() => payCommission(item)} disabled={item.sisa <= 0}>Bayar</button></div></div>)}</div>}</div></div>}

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">{editing ? "Edit Sales" : "Tambah Sales"}</h2><p className="text-body-md">Simpan identitas sales untuk transaksi dan komisi.</p></div><button className="btn-icon" onClick={() => setShowForm(false)}><span className="material-symbols-outlined">close</span></button></div><form onSubmit={save} className="sales-form"><label>Nama Sales *<input className="input-field" value={form.nama} onChange={(event) => setForm((prev) => ({ ...prev, nama: event.target.value }))} /></label><label>Kode Sales<input className="input-field" value={form.kode} onChange={(event) => setForm((prev) => ({ ...prev, kode: event.target.value }))} /></label><label>No. Telepon<input className="input-field" inputMode="tel" value={form.telepon} onChange={(event) => setForm((prev) => ({ ...prev, telepon: event.target.value }))} /></label><label>Email<input className="input-field" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button><button className="btn-primary">Simpan</button></div></form></div></div>}
    </div>
  );
}
