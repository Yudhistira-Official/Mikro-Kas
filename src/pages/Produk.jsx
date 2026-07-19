// ============================================================
// Produk.jsx — CRUD produk, search, filter kategori, low-stock
// Design ref: ui-references/katalog-produk.html
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

export default function Produk() {
  const { addToast } = useToast();
  const [produk, setProduk] = useState([]);
  const [kategori, setKategori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kategoriId, setKategoriId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("produkView") || "card");

  // Toggle tampilan: card (2-col grid) vs list (dense row)
  const toggleView = () => {
    const next = viewMode === "card" ? "list" : "card";
    setViewMode(next);
    localStorage.setItem("produkView", next);
  };

  const loadProduk = useCallback(() => {
    setLoading(true);
    invoke("list_produk", { search: search || null, kategoriId: kategoriId, onlyActive: true })
      .then(setProduk)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, kategoriId]);

  useEffect(() => {
    Promise.all([
      invoke("list_produk", { onlyActive: true }),
      invoke("list_kategori"),
    ])
      .then(([p, k]) => {
        setProduk(p);
        setKategori(k);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProduk(); }, [loadProduk]);

  const handleDelete = async (id, nama) => {
    if (!confirm(`Hapus produk "${nama}"?`)) return;
    try {
      await invoke("delete_produk", { id });
      addToast("Produk dihapus", "success");
      loadProduk();
    } catch (e) {
      addToast(`Gagal hapus: ${e}`, "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Search bar */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          className="input-field"
          style={{ flex: 1 }}
          placeholder="Cari produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-icon" onClick={toggleView} title={viewMode === "card" ? "Tampilan List" : "Tampilan Card"}>
          <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
            {viewMode === "card" ? "view_list" : "grid_view"}
          </span>
        </button>
      </div>

      {/* Filter kategori */}
      <div className="filter-row hide-scroll">
        <button className={`filter-chip${kategoriId === null ? " active" : ""}`} onClick={() => setKategoriId(null)}>
          Semua
        </button>
        {kategori.map((k) => (
          <button key={k.id} className={`filter-chip${kategoriId === k.id ? " active" : ""}`} onClick={() => setKategoriId(k.id)}>
            {k.nama}
          </button>
        ))}
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : produk.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">inventory_2</span>
          <p className="text-body-md">Belum ada produk</p>
          <button className="btn-primary" onClick={() => { setEditId(null); setShowForm(true); }}>
            + Tambah Produk
          </button>
        </div>
      ) : viewMode === "card" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          {produk.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column", position: "relative", padding: "0.75rem" }}>
              {p.stok <= p.stok_minimum && p.stok > 0 && (
                <span className="badge badge-warning" style={{ position: "absolute", top: "8px", right: "8px" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>warning</span>
                  Stok
                </span>
              )}
              {p.stok === 0 && (
                <span className="badge badge-empty" style={{ position: "absolute", top: "8px", right: "8px" }}>
                  Kosong
                </span>
              )}
              <div style={{ flex: 1 }}>
                <p className="text-headline-sm" style={{ lineClamp: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {p.nama}
                </p>
                <p className="text-body-md" style={{ color: "var(--color-primary)", fontWeight: 600, marginTop: "4px" }}>
                  {rupiah(p.harga_jual)}
                </p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                <span className="text-label-md" style={{ color: p.stok <= p.stok_minimum ? "var(--color-warning-amber)" : "var(--color-text-secondary)" }}>
                  Stok: {p.stok} {p.satuan}
                </span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button className="btn-icon" onClick={() => { setEditId(p.id); setShowForm(true); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>edit</span>
                  </button>
                  <button className="btn-icon" onClick={() => handleDelete(p.id, p.nama)}>
                    <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-expense-red)" }}>delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {/* Add card */}
          <button
            className="card"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", border: "2px dashed var(--color-primary-container)", cursor: "pointer", minHeight: "140px", background: "transparent" }}
            onClick={() => { setEditId(null); setShowForm(true); }}
          >
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "32px" }}>add</span>
            <p className="text-headline-sm" style={{ color: "var(--color-primary)" }}>Tambah</p>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
          {produk.map((p) => (
            <div key={p.id} className="list-dense-item" style={{ display: "flex", alignItems: "center", justifyContent: "between", padding: "0.75rem", borderBottom: "1px solid var(--color-surface-border)", background: p.stok === 0 ? "rgba(186,26,26,0.03)" : p.stok <= p.stok_minimum ? "rgba(245,158,11,0.03)" : "transparent" }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                  <h3 className="text-headline-sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginRight: "8px" }}>{p.nama}</h3>
                  <span className="text-body-md" style={{ color: "var(--color-primary)", fontWeight: 600 }}>{rupiah(p.harga_jual)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {p.sku && <span className="text-label-md" style={{ fontSize: "10px", background: "var(--color-surface-container-high)", px: "4px", py: "1px", borderRadius: "4px" }}>{p.sku}</span>}
                  <span className="text-label-md" style={{ color: p.stok === 0 ? "var(--color-error)" : p.stok <= p.stok_minimum ? "var(--color-warning-amber)" : "var(--color-text-secondary)" }}>
                    Stok: {p.stok} {p.satuan}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "2px" }}>
                <button className="btn-icon" onClick={() => { setEditId(p.id); setShowForm(true); }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>edit</span>
                </button>
                <button className="btn-icon" onClick={() => handleDelete(p.id, p.nama)}>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-expense-red)" }}>delete</span>
                </button>
              </div>
            </div>
          ))}
          <div className="list-dense-item" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0.75rem", cursor: "pointer", color: "var(--color-primary)", background: "rgba(0,32,69,0.02)" }} onClick={() => { setEditId(null); setShowForm(true); }}>
            <span className="material-symbols-outlined" style={{ fontSize: "20px", marginRight: "6px" }}>add_circle</span>
            <span className="text-headline-sm">Tambah Produk Baru</span>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <ProdukForm
          editId={editId}
          kategori={kategori}
          onClose={() => { setShowForm(false); setEditId(null); }}
          onSaved={() => { setShowForm(false); setEditId(null); loadProduk(); }}
          onCategoryCreated={(newCategory) => {
            // Sinkronkan kategori parent agar filter produk langsung tersedia.
            setKategori((prev) => [...prev, newCategory].sort((a, b) => a.nama.localeCompare(b.nama)));
          }}
        />
      )}
    </div>
  );
}

function ProdukForm({ editId, kategori, onClose, onSaved, onCategoryCreated }) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showNewKat, setShowNewKat] = useState(false);
  const [newKatNama, setNewKatNama] = useState("");
  const [katList, setKatList] = useState(kategori);
  const [form, setForm] = useState({
    nama: "", kategori_id: null, sku: "", satuan: "pcs",
    harga_beli: "", harga_jual: "", stok: "", stok_minimum: "",
  });

  useEffect(() => { setKatList(kategori); }, [kategori]);

  useEffect(() => {
    if (editId) {
      invoke("get_produk", { id: editId }).then((p) => {
        setForm({
          nama: p.nama, kategori_id: p.kategori_id, sku: p.sku || "",
          satuan: p.satuan, harga_beli: String(p.harga_beli),
          harga_jual: String(p.harga_jual), stok: String(p.stok),
          stok_minimum: String(p.stok_minimum),
        });
      }).catch(console.error);
    }
  }, [editId]);

  const handleNewKat = async () => {
    const nama = newKatNama.trim();
    if (!nama) { addToast("Nama kategori wajib diisi", "error"); return; }
    // Cek duplikat lokal untuk respons instan.
    if (katList.some((k) => k.nama.toLowerCase() === nama.toLowerCase())) {
      addToast("Nama kategori sudah ada", "error");
      return;
    }
    try {
      const k = await invoke("create_kategori", { input: { nama } });
      setKatList((prev) => [...prev, k].sort((a, b) => a.nama.localeCompare(b.nama)));
      // Parent juga diperbarui agar filter kategori tidak stale setelah modal ditutup.
      onCategoryCreated(k);
      setForm((prev) => ({ ...prev, kategori_id: k.id }));
      setNewKatNama("");
      setShowNewKat(false);
      addToast(`Kategori "${k.nama}" ditambahkan`, "success");
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) { addToast("Nama produk wajib diisi", "error"); return; }
    if (!form.harga_jual) { addToast("Harga jual wajib diisi", "error"); return; }
    setSaving(true);
    try {
      const input = {
        nama: form.nama.trim(),
        kategori_id: form.kategori_id || null,
        sku: form.sku.trim() || null,
        satuan: form.satuan || "pcs",
        harga_beli: parseInt(form.harga_beli) || 0,
        harga_jual: parseInt(form.harga_jual),
        stok: parseInt(form.stok) || 0,
        stok_minimum: parseInt(form.stok_minimum) || 0,
      };
      if (editId) {
        await invoke("update_produk", { id: editId, input });
        addToast("Produk diupdate", "success");
      } else {
        await invoke("create_produk", { input });
        addToast("Produk ditambahkan", "success");
      }
      onSaved();
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
    }
    setSaving(false);
  };

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const setNum = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value.replace(/\D/g, "") }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>
          {editId ? "Edit Produk" : "Tambah Produk"}
        </h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label className="input-label">Nama Produk *</label>
            <input className="input-field" value={form.nama} onChange={set("nama")} placeholder="Nama produk" />
          </div>
          <div>
            <label className="input-label">Kategori</label>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <select className="input-field" style={{ flex: 1 }} value={form.kategori_id || ""} onChange={(e) => setForm((prev) => ({ ...prev, kategori_id: e.target.value ? parseInt(e.target.value) : null }))}>
                <option value="">— Pilih Kategori —</option>
                {katList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
              <button type="button" className="btn-icon" onClick={() => setShowNewKat(!showNewKat)} title="Tambah Kategori Baru">
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>add_circle</span>
              </button>
            </div>
            {showNewKat && (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <input className="input-field" style={{ flex: 1, fontSize: "13px" }} placeholder="Nama kategori baru" value={newKatNama} onChange={(e) => setNewKatNama(e.target.value)} autoFocus />
                <button type="button" className="btn-primary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={handleNewKat}>Buat</button>
                <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={() => { setShowNewKat(false); setNewKatNama(""); }}>Batal</button>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="input-label">SKU</label>
              <input className="input-field" value={form.sku} onChange={set("sku")} placeholder="Opsional" />
            </div>
            <div>
              <label className="input-label">Satuan</label>
              <select className="input-field" value={form.satuan} onChange={set("satuan")}>
                <option value="pcs">pcs</option>
                <option value="kg">kg</option>
                <option value="liter">liter</option>
                <option value="dus">dus</option>
                <option value="pack">pack</option>
                <option value="botol">botol</option>
                <option value="sachet">sachet</option>
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Harga Beli</label>
            <input className="input-field" value={form.harga_beli} onChange={setNum("harga_beli")} placeholder="0" inputMode="numeric" />
          </div>
          <div>
            <label className="input-label">Harga Jual *</label>
            <input className="input-field" value={form.harga_jual} onChange={setNum("harga_jual")} placeholder="Contoh: 5000" inputMode="numeric" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="input-label">Stok Awal</label>
              <input className="input-field" value={form.stok} onChange={setNum("stok")} placeholder="0" inputMode="numeric" />
            </div>
            <div>
              <label className="input-label">Stok Minimum</label>
              <input className="input-field" value={form.stok_minimum} onChange={setNum("stok_minimum")} placeholder="0" inputMode="numeric" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>Batal</button>
            <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
              {saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : (editId ? "Simpan" : "Tambah")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
