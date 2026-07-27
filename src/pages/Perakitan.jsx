import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";
import { formatDateTimeId } from "../utils/dateFormat";
import SearchSelect from "../components/SearchSelect";

export default function Perakitan() {
  const { addToast } = useToast();

  /** Daftar BOM aktif dari backend */
  const [bomList, setBomList] = useState([]);
  const [loading, setLoading] = useState(false);

  /** Form tambah BOM baru */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ produk_id: "", kode_bom: "", yield_qty: "1", gudang_id: "", catatan: "", items: [] });
  const [gudangList, setGudangList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [produkList, setProdukList] = useState([]);

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

  useEffect(() => {
    load();
    invoke("list_produk", { onlyActive: true }).then((data) => setProdukList(data || [])).catch(() => {});
    invoke("list_gudang").then((data) => setGudangList(data || [])).catch(() => {});
  }, []);

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
           yield_qty: Number(form.yield_qty || 1),
           gudang_id: form.gudang_id ? Number(form.gudang_id) : null,
           catatan: form.catatan.trim() || null,
           items: form.items.filter((item) => item.komponen_id && Number(item.qty_per_unit) > 0).map((item) => ({ komponen_id: Number(item.komponen_id), qty_per_unit: Number(item.qty_per_unit), satuan: item.satuan || null })),
         },
      });
      addToast("BOM berhasil ditambahkan", "success");
      setForm({ produk_id: "", kode_bom: "", yield_qty: "1", gudang_id: "", catatan: "", items: [] });
      setShowForm(false);
      load();
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, { komponen_id: "", qty_per_unit: "1", satuan: "" }] }));
  const setItem = (idx, field, value) => setForm((prev) => { const items = [...prev.items]; items[idx] = { ...items[idx], [field]: value }; return { ...prev, items }; });
  const removeItem = (idx) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  return (
    <PageShell
      eyebrow="PRODUKSI"
      title="Perakitan (BOM)"
      description="Bill of Materials — resep komponen untuk produk rakitan."
      actions={
        <>
          <button className="btn-primary sales-page__add" onClick={() => setShowForm((v) => !v)}>
          <span className="material-symbols-outlined">add</span>
          Tambah BOM
          </button>
        </>
      }
      stats={[
        { label: "Total BOM", value: bomList.length, icon: "precision_manufacturing" },
        { label: "Status", value: "Aktif", icon: "check_circle" },
        { label: "Produk Terdaftar", value: new Set(bomList.map((b) => b.produk_id)).size, icon: "category" },
      ]}
    >
      {/* Stats */}
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
               <span className="text-label-md">Nama Produk Jadi <span style={{ color: "var(--color-expense-red)" }}>*</span></span>
               <SearchSelect
                 value={form.produk_id}
                 onChange={(value) => setForm({ ...form, produk_id: value })}
                 placeholder="Pilih produk"
                 options={produkList.map((p) => ({ value: String(p.id), label: `${p.nama}${p.sku ? ` — ${p.sku}` : ""}` }))}
                 required
               />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="text-label-md">Kode BOM / SKU</span>
              <input className="input-field" placeholder="Contoh: PRD-KSP-001" value={form.kode_bom} onChange={(e) => setForm({ ...form, kode_bom: e.target.value })} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="text-label-md">Jumlah Hasil (Yield)</span>
              <input className="input-field" type="number" min={1} placeholder="1" value={form.yield_qty} onChange={(e) => setForm({ ...form, yield_qty: e.target.value })} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="text-label-md">Gudang / Outlet Sumber Stok</span>
              <SearchSelect value={form.gudang_id} onChange={(value) => setForm({ ...form, gudang_id: value })} placeholder="Pilih gudang" options={gudangList.map((g) => ({ value: String(g.id), label: g.nama }))} />
            </label>
            <fieldset style={{ border: "1px solid var(--color-surface-border)", borderRadius: 10, padding: "12px 10px" }}>
              <legend style={{ fontSize: 13, fontWeight: 600 }}>Detail Bahan Baku</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {form.items.map((item, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 32px", gap: 6, alignItems: "center" }}>
                    <SearchSelect value={item.komponen_id} onChange={(v) => setItem(idx, "komponen_id", v)} placeholder="Pilih bahan baku" options={produkList.map((p) => ({ value: String(p.id), label: `${p.nama}${p.sku ? ` — ${p.sku}` : ""}` }))} />
                    <input className="input-field" type="number" min="0" step="any" placeholder="Qty" value={item.qty_per_unit} onChange={(e) => setItem(idx, "qty_per_unit", e.target.value)} style={{ fontSize: 12 }} />
                    <input className="input-field" placeholder="Unit" value={item.satuan} onChange={(e) => setItem(idx, "satuan", e.target.value)} style={{ fontSize: 12 }} />
                    <button type="button" className="btn-icon" onClick={() => removeItem(idx)} title="Hapus"><span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-error)" }}>remove_circle</span></button>
                  </div>
                ))}
                <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "6px 10px" }} onClick={addItem}>+ Tambah Bahan</button>
              </div>
            </fieldset>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="text-label-md">Catatan / Instruksi</span>
              <textarea className="input-field" rows={2} placeholder="Potong stok otomatis di kasir saat transaksi penjualan selesai." value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
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
                  <th>Produk Jadi</th>
                  <th>Kode BOM / SKU</th>
                  <th>Yield</th>
                  <th>Gudang / Outlet</th>
                  <th>Total HPP</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bomList.map((bom) => (
                  <tr key={bom.id}>
                    <td style={{ fontWeight: 600 }}>#{bom.id}</td>
                    <td><strong>{bom.produk_nama}</strong><small style={{ display: "block", color: "var(--color-text-secondary)" }}>{bom.produk_sku || "Tanpa SKU"}</small></td>
                    <td>{bom.kode_bom || "—"}</td>
                    <td>{bom.yield_qty} porsi</td>
                    <td>{bom.gudang_nama || "Semua gudang"}</td>
                    <td>{rupiah(bom.total_hpp)}</td>
                    <td><StatusBadge label={bom.is_active ? "Aktif" : "Nonaktif"} tone={bom.is_active ? "success" : "neutral"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}
