import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, FormModal, InfoNote, useSearchFilter, rupiah } from "../components/PageKit";
import { VirtualDataTable } from "../components/VirtualDataTable";
import { formatDateId } from "../utils/dateFormat";
import SearchSelect from "../components/SearchSelect";

export default function Pengiriman() {
  const { addToast } = useToast();
  const [data, setData] = useState([]);
  const [headerStats, setHeaderStats] = useState({ total: 0, diproses: 0, dikirim: 0, diterima: 0 });
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ transaksi_id: "", alamat_kirim: "", kota: "", provinsi: "", kode_pos: "", ekspedisi: "", no_resi: "", catatan: "" });

  const load = async (offset = 0, append = false) => {
    if (!append) invoke("get_pengiriman_stats").then((s) => setHeaderStats({
      total: Number(s?.total||0),
      diproses: Number(s?.diproses||0),
      dikirim: Number(s?.dikirim||0),
      diterima: Number(s?.diterima||0),
    })).catch(() => {});
    if (!append) setLoading(true);
    try {
      const rows = await invoke("list_pengiriman", { limit: 50, offset });
      const next = Array.isArray(rows) ? rows : [];
      setData((current) => append ? [...current, ...next] : next);
      setHasMore(next.length === 50);
    } catch (e) {
      { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Escape closes the form modal when no submission is in progress.
  useEffect(() => {
    /** Handles Escape for the shipping form modal. */
    const handleEscape = (event) => { if (event.key === "Escape" && showForm) setShowForm(false); };
    if (showForm) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showForm]);

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
      { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); };
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await invoke("update_pengiriman_status", { id, status });
      addToast("Status pengiriman diperbarui", "success");
      load();
    } catch (e) {
      { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); };
    }
  };

  const statusLabel = { diproses: "Diproses", dikirim: "Dikirim", diterima: "Diterima", batal: "Batal" };
  const statusColor = { diproses: "#f59e0b", dikirim: "#3b82f6", diterima: "#22c55e", batal: "#ef4444" };
  const columns = [
    { key: "transaksi_id", label: "Transaksi", render: (item) => <div className="sales-name" style={{ cursor: "default" }}><span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt_long</span></span><span><strong>#{item.transaksi_id}</strong><small>{item.catatan || "Tanpa catatan"}</small></span></div> },
    { key: "tujuan", label: "Tujuan", render: (item) => <><strong>{item.kota || "-"}</strong><small style={{ display: "block", color: "var(--color-text-secondary)", fontSize: 11 }}>{item.provinsi || item.alamat_kirim || "-"}</small></> },
    { key: "ekspedisi", label: "Ekspedisi" },
    { key: "no_resi", label: "No. Resi", render: (item) => item.no_resi || "-" },
    { key: "tgl_kirim", label: "Tgl. Kirim", render: (item) => formatDateId(item.tgl_kirim) },
    { key: "status", label: "Status", render: (item) => <span style={{ color: statusColor[item.status] || "var(--color-text-secondary)", fontWeight: 700, fontSize: 12 }}>{statusLabel[item.status] || item.status}</span> },
    { key: "aksi", label: "Aksi", render: (item) => <SearchSelect style={{ minWidth: 140 }} value={item.status} onChange={(value) => updateStatus(item.id, value)} options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} placeholder="Status" /> },
  ];

  return (
    <PageShell
      eyebrow="OPERASIONAL"
      title="Pengiriman"
      description="Kelola alamat tujuan, nomor resi, dan status pengiriman pesanan."
      actions={
        <>
          <button className="btn-primary sales-page__add" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined">add</span>Tambah Pengiriman
          </button>
        </>
      }
      stats={[
        { label: "Total Pengiriman", value: headerStats.total, icon: "local_shipping" },
        { label: "Diproses", value: headerStats.diproses, icon: "pending" },
        { label: "Dikirim", value: headerStats.dikirim, icon: "inventory_2" },
        { label: "Diterima", value: headerStats.diterima, icon: "task_alt" },
      ]}
    >
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari ID transaksi, resi, ekspedisi, atau kota..." /></div>
          <button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button>
        </div>
        {loading ? <div className="loading-page"><div className="spinner" /></div> : filtered.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">local_shipping</span><p>Belum ada data pengiriman</p></div> : (
          <VirtualDataTable
            columns={columns}
            rows={filtered}
            rowKey={(item) => item.id}
            loading={loading}
            hasMore={hasMore}
            onEndReached={() => { if (!loading && hasMore) load(data.length, true); }}
            emptyMessage="Belum ada data pengiriman"
          />
        )}
      </section>

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content" onClick={(e) => e.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">Tambah Pengiriman</h2><p className="text-body-md">Masukkan detail tujuan pengiriman pesanan.</p></div><button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setShowForm(false)}><span className="material-symbols-outlined">close</span></button></div><form onSubmit={handleSubmit} className="sales-form">
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
    </PageShell>
  );
}
