// ============================================================
// Kas.jsx — Pencatatan pemasukan & pengeluaran non-transaksi
// Design ref: similar to dashboard card style
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");
const today = () => new Date().toISOString().slice(0, 10);

export default function Kas() {
  const { addToast } = useToast();
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState(null); // null | pemasukan | pengeluaran
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    invoke("list_kas", { tipe: filter })
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm("Hapus entri kas ini?")) return;
    try {
      await invoke("delete_kas", { id });
      addToast("Entri dihapus", "success");
      load();
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
    }
  };

  const totalPemasukan = entries.filter((e) => e.tipe === "pemasukan").reduce((s, e) => s + e.jumlah, 0);
  const totalPengeluaran = entries.filter((e) => e.tipe === "pengeluaran").reduce((s, e) => s + e.jumlah, 0);

  const kategoriList = ["Listrik", "Air", "Sewa", "Gaji", "Modal", "Transport", "Makanan", "Lainnya"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="card">
          <p className="text-label-md" style={{ color: "var(--color-income-green)" }}>Pemasukan</p>
          <p className="text-headline-md" style={{ color: "var(--color-income-green)" }}>{rupiah(totalPemasukan)}</p>
        </div>
        <div className="card">
          <p className="text-label-md" style={{ color: "var(--color-expense-red)" }}>Pengeluaran</p>
          <p className="text-headline-md" style={{ color: "var(--color-expense-red)" }}>{rupiah(totalPengeluaran)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-row">
        {[
          { label: "Semua", value: null },
          { label: "Pemasukan", value: "pemasukan" },
          { label: "Pengeluaran", value: "pengeluaran" },
        ].map((f) => (
          <button key={f.label} className={`filter-chip${filter === f.value ? " active" : ""}`} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Entries list */}
      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">account_balance</span>
          <p className="text-body-md">Belum ada catatan kas</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {entries.map((e) => (
            <div key={e.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className={`material-symbols-outlined ${e.tipe === "pemasukan" ? "text-income-green" : "text-expense-red"}`}
                  style={{ fontSize: "20px" }}>
                  {e.tipe === "pemasukan" ? "trending_up" : "trending_down"}
                </span>
                <div>
                  <p className="text-body-md">{e.kategori}</p>
                  <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{e.tanggal.slice(0, 10)}{e.keterangan ? ` · ${e.keterangan}` : ""}</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={`text-headline-sm ${e.tipe === "pemasukan" ? "text-income-green" : "text-expense-red"}`}>
                  {e.tipe === "pemasukan" ? "+" : "-"} {rupiah(e.jumlah)}
                </span>
                <button className="btn-icon" style={{ width: "28px", height: "28px" }} onClick={() => handleDelete(e.id)}>
                  <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--color-expense-red)" }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <KasForm
          kategoriList={kategoriList}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {/* FAB */}
      <button
        style={{
          position: "fixed", bottom: "96px", right: "16px",
          width: "56px", height: "56px", borderRadius: "50%",
          background: "var(--color-primary)", color: "white",
          border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 40,
        }}
        onClick={() => setShowForm(true)}
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
}

function KasForm({ kategoriList, onClose, onSaved }) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipe: "pemasukan", kategori: "", jumlah: "", keterangan: "", tanggal: today(),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.jumlah || parseInt(form.jumlah) <= 0) {
      addToast("Jumlah harus diisi", "error");
      return;
    }
    if (!form.kategori.trim()) {
      addToast("Kategori harus diisi", "error");
      return;
    }
    setSaving(true);
    try {
      await invoke("create_kas", {
        input: {
          tipe: form.tipe,
          kategori: form.kategori.trim(),
          jumlah: parseInt(form.jumlah),
          keterangan: form.keterangan.trim() || null,
          tanggal: form.tanggal || null,
        },
      });
      addToast("Entri kas disimpan", "success");
      onSaved();
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>Catat Kas</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={`btn-${form.tipe === "pemasukan" ? "primary" : "secondary"}`} style={{ flex: 1 }} onClick={() => setForm((p) => ({ ...p, tipe: "pemasukan" }))}>
              + Pemasukan
            </button>
            <button type="button" className={`btn-${form.tipe === "pengeluaran" ? "primary" : "secondary"}`} style={{ flex: 1 }} onClick={() => setForm((p) => ({ ...p, tipe: "pengeluaran" }))}>
              - Pengeluaran
            </button>
          </div>
          <div>
            <label className="input-label">Kategori</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
              {kategoriList.map((k) => (
                <button key={k} type="button" className={`chip ${form.kategori === k ? "chip-blue" : ""}`}
                  style={{ cursor: "pointer", border: form.kategori === k ? "1px solid var(--color-primary)" : "1px solid var(--color-surface-border)" }}
                  onClick={() => setForm((p) => ({ ...p, kategori: k }))}>
                  {k}
                </button>
              ))}
            </div>
            <input className="input-field" placeholder="Atau ketik manual..." value={form.kategori}
              onChange={(e) => setForm((p) => ({ ...p, kategori: e.target.value }))} />
          </div>
          <div>
            <label className="input-label">Jumlah (Rp)</label>
            <input className="input-field" inputMode="numeric" value={form.jumlah}
              onChange={(e) => setForm((p) => ({ ...p, jumlah: e.target.value.replace(/\D/g, "") }))}
              placeholder="0" />
          </div>
          <div>
            <label className="input-label">Keterangan</label>
            <input className="input-field" value={form.keterangan}
              onChange={(e) => setForm((p) => ({ ...p, keterangan: e.target.value }))}
              placeholder="Opsional" />
          </div>
          <div>
            <label className="input-label">Tanggal</label>
            <input className="input-field" type="date" value={form.tanggal}
              onChange={(e) => setForm((p) => ({ ...p, tanggal: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>Batal</button>
            <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
              {saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
