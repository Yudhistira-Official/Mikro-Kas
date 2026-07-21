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
      await invoke("tutup_shift", {
        id: closeForm.id,
        saldo_akhir,
        catatan: closeData.catatan.trim() || null,
      });
      addToast("Shift berhasil ditutup", "success");
      setCloseForm(null);
      setCloseData({ saldo_akhir: "", catatan: "" });
      load();
    } catch (e) {
      addToast(`Gagal tutup shift: ${e}`, "error");
    }
  };

  const selisihColor = (s) => s === 0 ? "var(--color-success-green)" : s > 0 ? "var(--color-warning-amber)" : "var(--color-expense-red)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", position: "relative", minHeight: "60dvh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="text-headline-md">Shift Management</span>
        {!activeShift && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>Buka Shift</button>
        )}
      </div>

      {/* Status shift aktif */}
      {activeShift && (
        <div className="card" style={{ padding: "1.25rem", background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))", color: "white", borderRadius: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <p className="text-headline-sm">Shift Aktif</p>
            <span className="badge" style={{ background: "rgba(255,255,255,0.25)", color: "white", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>OPEN</span>
          </div>
          <p style={{ fontSize: "13px", opacity: 0.85, marginBottom: "8px" }}>{activeShift.nama}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
            <div><p style={{ fontSize: "11px", opacity: 0.7 }}>Saldo Awal</p><p style={{ fontSize: "16px", fontWeight: 700 }}>{rupiah(activeShift.saldo_awal)}</p></div>
            <div><p style={{ fontSize: "11px", opacity: 0.7 }}>Dibuka</p><p style={{ fontSize: "16px", fontWeight: 700 }}>{activeShift.opened_at}</p></div>
          </div>
          <button className="btn-secondary" onClick={() => setCloseForm(activeShift)} style={{ marginTop: "12px", width: "100%", background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
            Tutup Shift
          </button>
        </div>
      )}

      {!activeShift && !showForm && (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "48px", opacity: 0.3 }}>schedule</span>
          <p style={{ marginTop: "8px" }}>Belum ada shift aktif</p>
        </div>
      )}

      {/* Form buka shift */}
      {showForm && (
        <div className="card" style={{ padding: "1.25rem" }}>
          <p className="text-headline-sm" style={{ marginBottom: "12px" }}>Buka Shift Baru</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div><label className="input-label">Nama Shift</label><input className="input-field" placeholder="Shift Pagi / Shift Malam" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
            <div><label className="input-label">Saldo Awal (Rp)</label><input className="input-field" type="number" placeholder="0" value={form.saldo_awal} onChange={(e) => setForm({ ...form, saldo_awal: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-primary" onClick={bukaShift} style={{ flex: 1 }}>Buka Shift</button>
              <button className="btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tutup shift */}
      {closeForm && (
        <div className="card" style={{ padding: "1.25rem", border: "2px solid var(--color-tertiary)" }}>
          <p className="text-headline-sm" style={{ marginBottom: "12px" }}>Tutup Shift: {closeForm.nama}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: "var(--color-surface-container)", padding: "12px", borderRadius: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}><span className="text-label-md">Saldo Awal</span><span className="text-label-md">{rupiah(closeForm.saldo_awal)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="text-label-md">Penjualan (perkiraan)</span><span className="text-label-md">{rupiah(closeForm.total_penjualan)}</span></div>
            </div>
            <div><label className="input-label">Saldo Akhir Fisik (Rp)</label><input className="input-field" type="number" placeholder="Hitung uang di laci" value={closeData.saldo_akhir} onChange={(e) => setCloseData({ ...closeData, saldo_akhir: e.target.value })} /></div>
            <div><label className="input-label">Catatan (opsional)</label><input className="input-field" placeholder="Shift lancar / ada kekurangan" value={closeData.catatan} onChange={(e) => setCloseData({ ...closeData, catatan: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-primary" onClick={tutupShift} style={{ flex: 1 }}>Tutup Shift</button>
              <button className="btn-secondary" onClick={() => setCloseForm(null)} style={{ flex: 1 }}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Riwayat shift */}
      {list.length > 0 && (
        <>
          <p className="text-headline-sm">Riwayat Shift</p>
          {list.map((s) => (
            <div key={s.id} className="card" style={{ padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontWeight: 600 }}>{s.nama}</span>
                <span className="badge" style={{ background: s.status === "open" ? "var(--color-primary-container)" : "var(--color-surface-container-high)", color: s.status === "open" ? "var(--color-primary)" : "var(--color-text-secondary)", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>
                  {s.status === "open" ? "OPEN" : "CLOSED"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Awal: </span>{rupiah(s.saldo_awal)}</div>
                {s.saldo_akhir != null && <div><span style={{ color: "var(--color-text-secondary)" }}>Akhir: </span>{rupiah(s.saldo_akhir)}</div>}
                {s.total_penjualan > 0 && <div><span style={{ color: "var(--color-text-secondary)" }}>Penjualan: </span>{rupiah(s.total_penjualan)}</div>}
                {s.total_pengeluaran > 0 && <div><span style={{ color: "var(--color-text-secondary)" }}>Pengeluaran: </span>{rupiah(s.total_pengeluaran)}</div>}
                {s.closed_at && <div><span style={{ color: "var(--color-text-secondary)" }}>Ditutup: </span>{s.closed_at}</div>}
                {s.selisih !== 0 && <div style={{ color: selisihColor(s.selisih), fontWeight: 700 }}><span style={{ color: "var(--color-text-secondary)" }}>Selisih: </span>{rupiah(s.selisih)}</div>}
              </div>
              {s.catatan && <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "8px" }}>{s.catatan}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
