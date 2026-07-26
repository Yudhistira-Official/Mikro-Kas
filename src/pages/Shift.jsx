// Shift.jsx — Manajemen Shift: buka/tutup kasir harian, catat saldo awal/akhir, selisih kas.
// Design ref: Stitch — Shift Management.
import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

export default function Shift() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeShift, setActiveShift] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nama: "", saldo_awal: "" });
  const [closeForm, setCloseForm] = useState(null);
  const [closeData, setCloseData] = useState({ saldo_akhir: "", catatan: "" });

  const load = () => {
    setLoading(true);
    invoke("list_shift", {})
      .then((data) => {
        setList(data);
        const open = data.find((s) => s.status === "open");
        setActiveShift(open || null);
      })
      .catch((e) => addToast(`Gagal memuat shift: ${e}`, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const bukaShift = async () => {
    const nama = form.nama.trim() || `Shift ${new Date().toLocaleDateString("id-ID")}`;
    const saldo_awal = Number(form.saldo_awal) || 0;
    try {
      await invoke("buka_shift", { input: { nama, saldo_awal } });
      addToast("Shift berhasil dibuka", "success");
      setShowForm(false);
      setForm({ nama: "", saldo_awal: "" });
      load();
    } catch (e) {
      addToast(`Gagal buka shift: ${e}`, "error");
    }
  };

  const tutupShift = async () => {
    if (!closeForm) return;
    const saldo_akhir = Number(closeData.saldo_akhir);
    if (isNaN(saldo_akhir)) return addToast("Saldo akhir harus diisi", "error");
    try {
      await invoke("tutup_shift", { id: closeForm.id, saldo_akhir, catatan: closeData.catatan.trim() || null });
      addToast("Shift berhasil ditutup", "success");
      setCloseForm(null);
      setCloseData({ saldo_akhir: "", catatan: "" });
      load();
    } catch (e) {
      addToast(`Gagal tutup shift: ${e}`, "error");
    }
  };

  const selisihColor = (s) => s === 0 ? "var(--color-income-green)" : s > 0 ? "var(--color-warning-amber)" : "var(--color-expense-red)";
  const closedShifts = list.filter((s) => s.status !== "open");
  const totalPenjualan = list.reduce((sum, s) => sum + Number(s.total_penjualan || 0), 0);

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">OPERASIONAL KASIR</p>
          <h1 className="text-headline-lg">Manajemen Shift</h1>
          <p className="text-body-md sales-page__subtitle">Buka dan tutup shift kasir dengan pencatatan saldo yang rapi.</p>
        </div>
        {!activeShift && <button className="btn-primary sales-page__add" onClick={() => setShowForm(true)}><span className="material-symbols-outlined">add</span>Buka Shift</button>}
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: activeShift ? "var(--color-income-green)" : "var(--color-text-secondary)" }}>schedule</span><div><span>Status Saat Ini</span><strong style={{ color: activeShift ? "var(--color-income-green)" : undefined }}>{activeShift ? "Aktif" : "Tidak Aktif"}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">history</span><div><span>Riwayat Selesai</span><strong>{closedShifts.length}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">payments</span><div><span>Total Penjualan</span><strong>{rupiah(totalPenjualan)}</strong></div></div>
      </section>

      {activeShift && (
        <section className="sales-panel" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--color-primary)" }}>
          <div style={{ padding: "1rem 1.25rem", background: "var(--color-primary)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><p style={{ fontSize: "11px", opacity: 0.8, letterSpacing: "0.08em", fontWeight: 700 }}>SHIFT AKTIF</p><h2 className="text-headline-sm">{activeShift.nama}</h2></div>
            <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: "20px", padding: "4px 10px", fontSize: "11px", fontWeight: 700 }}>OPEN</span>
          </div>
          <div style={{ padding: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              <div><span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Saldo Awal</span><p style={{ fontSize: "18px", fontWeight: 700, marginTop: "3px" }}>{rupiah(activeShift.saldo_awal)}</p></div>
              <div><span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Dibuka</span><p style={{ fontSize: "14px", fontWeight: 600, marginTop: "5px" }}>{activeShift.opened_at}</p></div>
              <div><span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Penjualan</span><p style={{ fontSize: "18px", fontWeight: 700, marginTop: "3px" }}>{rupiah(activeShift.total_penjualan)}</p></div>
            </div>
            <button className="btn-primary" onClick={() => setCloseForm(activeShift)} style={{ width: "100%" }}><span className="material-symbols-outlined" style={{ fontSize: "17px", verticalAlign: "middle", marginRight: "5px" }}>lock</span>Tutup Shift</button>
          </div>
        </section>
      )}

      {!activeShift && !showForm && <div className="empty-state"><span className="material-symbols-outlined">schedule</span><h3>Belum ada shift aktif</h3><p>Buka shift untuk mulai mencatat aktivitas kasir.</p><button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: "12px" }}>Buka Shift</button></div>}

      {showForm && (
        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}><span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>lock_open</span><div><p className="sales-page__eyebrow">FORM SHIFT</p><h2 className="text-headline-sm">Buka Shift Baru</h2></div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div><label className="input-label">Nama Shift</label><input className="input-field" placeholder="Shift Pagi / Shift Malam" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
            <div><label className="input-label">Saldo Awal (Rp)</label><input className="input-field" type="number" min="0" placeholder="0" value={form.saldo_awal} onChange={(e) => setForm({ ...form, saldo_awal: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "8px" }}><button className="btn-primary" onClick={bukaShift} style={{ flex: 1 }}>Buka Shift</button><button className="btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Batal</button></div>
          </div>
        </section>
      )}

      {closeForm && (
        <div className="modal-overlay" onClick={() => setCloseForm(null)}><div className="modal-content sales-form-modal" onClick={(e) => e.stopPropagation()}>
          <div className="sales-modal__header"><div><p className="sales-page__eyebrow">TUTUP SHIFT</p><h2 className="text-headline-sm">{closeForm.nama}</h2></div><button className="icon-button" onClick={() => setCloseForm(null)}><span className="material-symbols-outlined">close</span></button></div>
          <div className="sales-form">
            <div style={{ background: "var(--color-surface-container)", padding: "12px", borderRadius: "10px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}><span className="text-label-md">Saldo Awal</span><strong>{rupiah(closeForm.saldo_awal)}</strong></div><div style={{ display: "flex", justifyContent: "space-between" }}><span className="text-label-md">Penjualan</span><strong>{rupiah(closeForm.total_penjualan)}</strong></div></div>
            <label>Saldo Akhir Fisik<input className="input-field" type="number" min="0" placeholder="Hitung uang di laci" value={closeData.saldo_akhir} onChange={(e) => setCloseData({ ...closeData, saldo_akhir: e.target.value })} /></label>
            <label>Catatan (opsional)<input className="input-field" placeholder="Shift lancar / ada kekurangan" value={closeData.catatan} onChange={(e) => setCloseData({ ...closeData, catatan: e.target.value })} /></label>
            <div className="sales-form__actions"><button className="btn-secondary" onClick={() => setCloseForm(null)}>Batal</button><button className="btn-primary" onClick={tutupShift}>Tutup Shift</button></div>
          </div>
        </div></div>
      )}

      <section className="sales-panel">
        <div className="sales-panel__toolbar"><div><p className="sales-page__eyebrow">HISTORI</p><h2 className="text-headline-sm">Riwayat Shift</h2></div><button className="btn-secondary" onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", padding: "7px 12px" }}><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>Refresh</button></div>
        {loading ? <div className="loading-page" style={{ minHeight: "140px" }}><div className="spinner" /><span>Memuat riwayat…</span></div> : list.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">history</span><p>Belum ada riwayat shift</p></div> : <div style={{ overflowX: "auto" }}><table className="sales-table"><thead><tr><th>Nama Shift</th><th>Status</th><th>Saldo Awal</th><th>Saldo Akhir</th><th>Penjualan</th><th>Selisih</th><th>Ditutup</th></tr></thead><tbody>{list.map((s) => <tr key={s.id}><td><strong>{s.nama}</strong></td><td><span className={`badge ${s.status === "open" ? "badge-success" : ""}`}>{s.status === "open" ? "OPEN" : "CLOSED"}</span></td><td>{rupiah(s.saldo_awal)}</td><td>{s.saldo_akhir != null ? rupiah(s.saldo_akhir) : "—"}</td><td>{rupiah(s.total_penjualan)}</td><td style={{ color: selisihColor(Number(s.selisih || 0)), fontWeight: 700 }}>{s.selisih != null ? rupiah(s.selisih) : "—"}</td><td style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{s.closed_at || "—"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
