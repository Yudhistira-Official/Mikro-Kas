import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function Pengiriman() {
  const { addToast } = useToast();
  const [data, setData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ transaksi_id: "", alamat_kirim: "", kota: "", provinsi: "", kode_pos: "", ekspedisi: "", no_resi: "", catatan: "" });

  const load = async () => {
    setLoading(true);
    try {
      const rows = await invoke("list_pengiriman");
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data;
    return data.filter((item) => `${item.transaksi_id} ${item.no_resi || ""} ${item.ekspedisi || ""} ${item.kota || ""} ${item.status}`.toLowerCase().includes(term));
  }, [data, query]);

  const statusCount = (status) => data.filter((item) => item.status === status).length;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.transaksi_id) return addToast("ID Transaksi wajib diisi", "error");
    try {
      await invoke("create_pengiriman", {
        transaksi_id: Number(form.transaksi_id),
        alamat_kirim: form.alamat_kirim.trim() || null,
        kota: form.kota.trim() || null,
        provinsi: form.provinsi.trim() || null,
        kode_pos: form.kode_pos.trim() || null,
        ekspedisi: form.ekspedisi.trim() || null,
        no_resi: form.no_resi.trim() || null,
        catatan: form.catatan.trim() || null,
      });
      setShowForm(false);
      setForm({ transaksi_id: "", alamat_kirim: "", kota: "", provinsi: "", kode_pos: "", ekspedisi: "", no_resi: "", catatan: "" });
      addToast("Pengiriman ditambahkan", "success");
      load();
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await invoke("update_pengiriman_status", { id, status });
      addToast("Status pengiriman diperbarui", "success");
      load();
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  const statusLabel = { diproses: "Diproses", dikirim: "Dikirim", diterima: "Diterima", batal: "Batal" };
  const statusColor = { diproses: "#f59e0b", dikirim: "#3b82f6", diterima: "#22c55e", batal: "#ef4444" };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">OPERASIONAL</p>
          <h1 className="text-headline-lg">Pengiriman</h1>
          <p className="text-body-md sales-page__subtitle">Kelola alamat tujuan, nomor resi, dan status pengiriman pesanan.</p>
        </div>
        <button className="btn-primary sales-page__add" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined">add</span>Tambah Pengiriman
        </button>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined">local_shipping</span><div><span>Total Pengiriman</span><strong>{data.length}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">pending</span><div><span>Diproses</span><strong>{statusCount("diproses")}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">inventory_2</span><div><span>Dikirim</span><strong>{statusCount("dikirim")}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">task_alt</span><div><span>Diterima</span><strong>{statusCount("diterima")}</strong></div></div>
      </section>

      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari ID transaksi, resi, ekspedisi, atau kota..." /></div>
          <button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button>
        </div>
        {loading ? <div className="loading-page"><div className="spinner" /></div> : filtered.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">local_shipping</span><p>Belum ada data pengiriman</p></div> : (
          <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Transaksi</th><th>Tujuan</th><th>Ekspedisi</th><th>No. Resi</th><th>Tgl. Kirim</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
            {filtered.map((item) => <tr key={item.id}>
              <td><div className="sales-name" style={{ cursor: "default" }}><span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt_long</span></span><span><strong>#{item.transaksi_id}</strong><small>{item.catatan || "Tanpa catatan"}</small></span></div></td>
              <td><strong>{item.kota || "-"}</strong><small style={{ display: "block", color: "var(--color-text-secondary)", fontSize: 11 }}>{item.provinsi || item.alamat_kirim || "-"}</small></td>
              <td>{item.ekspedisi || "-"}</td>
              <td style={{ fontWeight: 600 }}>{item.no_resi || "-"}</td>
              <td style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{item.tgl_kirim?.slice(0, 10) || "-"}</td>
              <td><span style={{ color: statusColor[item.status] || "var(--color-text-secondary)", fontWeight: 700, fontSize: 12 }}>{statusLabel[item.status] || item.status}</span></td>
              <td><div className="sales-row-actions"><select className="input-field" style={{ minWidth: 110, padding: "6px 8px", fontSize: 12 }} value={item.status} onChange={(e) => updateStatus(item.id, e.target.value)}><option value="diproses">Diproses</option><option value="dikirim">Dikirim</option><option value="diterima">Diterima</option><option value="batal">Batal</option></select></div></td>
            </tr>)}
          </tbody></table></div>
        )}
      </section>

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">Tambah Pengiriman</h2><p className="text-body-md">Masukkan detail tujuan pengiriman pesanan.</p></div><button className="btn-icon" onClick={() => setShowForm(false)}><span className="material-symbols-outlined">close</span></button></div><form onSubmit={handleSubmit} className="sales-form">
        <label className="input-label">ID Transaksi *<input className="input-field" inputMode="numeric" placeholder="Masukkan ID transaksi" value={form.transaksi_id} onChange={(e) => setForm((p) => ({ ...p, transaksi_id: e.target.value.replace(/\D/g, "") }))} /></label>
        <label className="input-label">Alamat Kirim<input className="input-field" placeholder="Alamat lengkap" value={form.alamat_kirim} onChange={(e) => setForm((p) => ({ ...p, alamat_kirim: e.target.value }))} /></label>
        <label className="input-label">Kota<input className="input-field" value={form.kota} onChange={(e) => setForm((p) => ({ ...p, kota: e.target.value }))} /></label>
        <label className="input-label">Provinsi<input className="input-field" value={form.provinsi} onChange={(e) => setForm((p) => ({ ...p, provinsi: e.target.value }))} /></label>
        <label className="input-label">Kode Pos<input className="input-field" inputMode="numeric" value={form.kode_pos} onChange={(e) => setForm((p) => ({ ...p, kode_pos: e.target.value }))} /></label>
        <label className="input-label">Ekspedisi<input className="input-field" placeholder="JNE, J&T, SiCepat..." value={form.ekspedisi} onChange={(e) => setForm((p) => ({ ...p, ekspedisi: e.target.value }))} /></label>
        <label className="input-label">No. Resi<input className="input-field" value={form.no_resi} onChange={(e) => setForm((p) => ({ ...p, no_resi: e.target.value }))} /></label>
        <label className="input-label">Catatan<input className="input-field" value={form.catatan} onChange={(e) => setForm((p) => ({ ...p, catatan: e.target.value }))} /></label>
        <div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button><button type="submit" className="btn-primary">Simpan</button></div>
      </form></div></div>}
    </div>
  );
}
