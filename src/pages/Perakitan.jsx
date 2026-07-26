import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function Perakitan() {
  const { addToast } = useToast();

  /** Daftar BOM aktif dari backend */
  const [bomList, setBomList] = useState([]);
  const [loading, setLoading] = useState(false);

  /** Form tambah BOM baru */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ produk_id: "", kode_bom: "", keterangan: "" });
  const [saving, setSaving] = useState(false);

  /** Muat semua BOM dari backend */
  const load = async () => {
    setLoading(true);
    try {
      const data = await invoke("list_bom");
      setBomList(Array.isArray(data) ? data : []);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /** Buat BOM baru */
  const handleCreate = async (e) => {
    e.preventDefault();
    const produkId = Number(form.produk_id);
    if (!produkId) return addToast("Produk ID wajib diisi", "error");
    setSaving(true);
    try {
      await invoke("create_bom", {
        input: {
          produk_id: produkId,
          kode_bom: form.kode_bom.trim() || null,
          keterangan: form.keterangan.trim() || null,
        },
      });
      addToast("BOM berhasil ditambahkan", "success");
      setForm({ produk_id: "", kode_bom: "", keterangan: "" });
      setShowForm(false);
      load();
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">PRODUKSI</p>
          <h1 className="text-headline-lg">Perakitan (BOM)</h1>
          <p className="text-body-md sales-page__subtitle">Bill of Materials — resep komponen untuk produk rakitan.</p>
        </div>
        <button className="btn-primary sales-page__add" onClick={() => setShowForm((v) => !v)}>
          <span className="material-symbols-outlined">add</span>
          Tambah BOM
        </button>
      </header>

      {/* Stats */}
      <section className="sales-stats">
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">precision_manufacturing</span>
          <div><span>Total BOM</span><strong>{bomList.length}</strong></div>
        </div>
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">check_circle</span>
          <div><span>Status</span><strong>Aktif</strong></div>
        </div>
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">category</span>
          <div><span>Produk Terdaftar</span><strong>{new Set(bomList.map((b) => b.produk_id)).size}</strong></div>
        </div>
      </section>

      {/* Form tambah BOM */}
      {showForm && (
        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>add_circle</span>
            <div>
              <p className="sales-page__eyebrow">FORM INPUT</p>
              <h2 className="text-headline-sm">Tambah BOM Baru</h2>
            </div>
          </div>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="text-label-md">Produk ID <span style={{ color: "var(--color-expense-red)" }}>*</span></span>
              <input
                className="input-field"
                type="number"
                required
                placeholder="Masukkan ID produk"
                value={form.produk_id}
                onChange={(e) => setForm({ ...form, produk_id: e.target.value })}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="text-label-md">Kode BOM</span>
              <input
                className="input-field"
                type="text"
                placeholder="Contoh: BOM-001 (opsional)"
                value={form.kode_bom}
                onChange={(e) => setForm({ ...form, kode_bom: e.target.value })}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="text-label-md">Keterangan</span>
              <input
                className="input-field"
                type="text"
                placeholder="Deskripsi singkat (opsional)"
                value={form.keterangan}
                onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
              />
            </label>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? "Menyimpan…" : "Simpan BOM"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
            </div>
          </form>
        </section>
      )}

      {/* Tabel BOM */}
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div>
            <p className="sales-page__eyebrow">DAFTAR BOM</p>
            <h2 className="text-headline-sm">Bill of Materials Aktif</h2>
          </div>
          <button className="btn-secondary" onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", padding: "7px 12px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
            {loading ? "Memuat…" : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div className="loading-page" style={{ minHeight: "140px" }}><div className="spinner" /><span>Memuat data BOM…</span></div>
        ) : bomList.length === 0 ? (
          <div className="empty-state">
            <span className="material-symbols-outlined">precision_manufacturing</span>
            <p>Belum ada BOM terdaftar</p>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: "12px", fontSize: "13px", padding: "8px 16px" }}>Tambah BOM Pertama</button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sales-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produk ID</th>
                  <th>Kode BOM</th>
                  <th>Keterangan</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {bomList.map((bom) => (
                  <tr key={bom.id}>
                    <td style={{ fontWeight: 600 }}>#{bom.id}</td>
                    <td>{bom.produk_id}</td>
                    <td>{bom.kode_bom || <span style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>—</span>}</td>
                    <td>{bom.keterangan || <span style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>—</span>}</td>
                    <td style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{bom.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
