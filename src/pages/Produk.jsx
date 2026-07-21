// ============================================================
// Produk.jsx — CRUD produk, search, filter kategori, low-stock
// Design ref: ui-references/katalog-produk.html
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useToast } from "../hooks/useToast";
import { generateBarcodeSVG } from "../utils/barcode";
import BarcodeScanner from "../components/BarcodeScanner";

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

// Harga promo aktif jika harga_diskon diisi dan tanggal berlaku belum lewat.
const isDiskonAktif = (p) => Number(p.harga_diskon || 0) > 0 && (!p.diskon_berlaku_sampai || p.diskon_berlaku_sampai >= new Date().toISOString().slice(0, 10));
const hargaAktif = (p) => isDiskonAktif(p) ? Number(p.harga_diskon || 0) : Number(p.harga_jual || 0);

// Konversi Uint8Array dari plugin-fs menjadi base64 untuk dikirim ke Rust.
const bytesToBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export default function Produk() {
  const { addToast } = useToast();
  const [produk, setProduk] = useState([]);
  const [kategori, setKategori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kategoriId, setKategoriId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ stok_baru: "", alasan: "" });
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("produkView") || "card");
  // Barcode generator
  const [barcodeItem, setBarcodeItem] = useState(null);
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

  const openAdjust = (p) => {
    setAdjustProduct(p);
    setAdjustForm({ stok_baru: String(p.stok), alasan: "" });
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    if (!adjustProduct) return;
    try {
      // Penyesuaian stok manual wajib lewat command audit trail, bukan update_produk.
      await invoke("adjust_stock", { input: { produk_id: adjustProduct.id, stok_baru: Number(adjustForm.stok_baru || 0), alasan: adjustForm.alasan.trim() } });
      addToast("Stok disesuaikan dan audit dicatat", "success");
      setAdjustProduct(null);
      loadProduk();
    } catch (e) { addToast(`Gagal penyesuaian stok: ${e}`, "error"); }
  };

  // Import produk CSV: baca file via native dialog, kirim teks ke Rust untuk parse + upsert.
  const handleImportCSV = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv", "txt"] }],
      });
      if (!selected) return;
      const csvText = await readTextFile(selected);
      const res = await invoke("import_produk_csv", { csvText });
      setImportResult(res);
      addToast(`Import: ${res.dibuat} baru, ${res.diupdate} update, ${res.dilewati} lewat`, "success");
      loadProduk();
    } catch (e) {
      addToast(`Gagal import CSV: ${e}`, "error");
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

      {/* Aksi katalog massal: tambah manual atau import CSV sesuai desain Stitch Produk & Stok. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <button className="btn-secondary" onClick={() => { setEditId(null); setShowForm(true); }}>
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add</span>
          Tambah Produk
        </button>
        <button className="btn-primary" onClick={() => { setImportResult(null); setShowImportCSV(true); }}>
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>upload_file</span>
          Import CSV
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
            <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column", position: "relative", padding: "0.75rem", overflow: "hidden" }}>
              {/* Badge stok & promo */}
              {p.stok <= p.stok_minimum && p.stok > 0 && (
                <span className="badge badge-warning" style={{ position: "absolute", top: "8px", right: "8px", zIndex: 1 }}>Stok</span>
              )}
              {p.stok === 0 && (
                <span className="badge badge-empty" style={{ position: "absolute", top: "8px", right: "8px", zIndex: 1 }}>Kosong</span>
              )}
              {isDiskonAktif(p) && p.stok > 0 && (
                <span className="badge" style={{ position: "absolute", top: "8px", left: "8px", background: "rgba(239,68,68,0.14)", color: "var(--color-expense-red)", zIndex: 1 }}>Promo</span>
              )}
              {/* Section 1: Foto + Nama + Stok */}
              <div style={{ width: "100%", height: "92px", borderRadius: "14px", overflow: "hidden", background: "linear-gradient(135deg, var(--color-primary-container), var(--color-secondary-container))", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.5rem" }}>
                {p.foto_path ? (
                  <img src={convertFileSrc(p.foto_path)} alt={p.nama} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "28px" }}>image</span>
                )}
              </div>
              <p className="text-headline-sm" style={{ lineClamp: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: "2px" }}>{p.nama}</p>
              <span className="text-label-md" style={{ color: p.stok === 0 ? "var(--color-error)" : p.stok <= p.stok_minimum ? "var(--color-warning-amber)" : "var(--color-text-secondary)", fontSize: "11px" }}>
                Stok: {p.stok} {p.satuan}
              </span>
              {/* Section 2: SKU + Harga */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                {p.sku ? (
                  <span className="text-label-md" style={{ fontSize: "10px", background: "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px" }}>{p.sku}</span>
                ) : <span />}
                {isDiskonAktif(p) ? (
                  <div>
                    <span style={{ color: "var(--color-text-secondary)", textDecoration: "line-through", fontSize: "11px" }}>{rupiah(p.harga_jual)}</span>
                    <span style={{ color: "var(--color-expense-red)", fontWeight: 700, fontSize: "14px", marginLeft: "4px" }}>{rupiah(hargaAktif(p))}</span>
                  </div>
                ) : (
                  <span className="text-body-md" style={{ color: "var(--color-primary)", fontWeight: 600 }}>{rupiah(p.harga_jual)}</span>
                )}
              </div>
              {/* Section 3: Tombol CRUD */}
              <div style={{ display: "flex", gap: "4px", marginTop: "8px", justifyContent: "flex-end" }}>
                <button className="btn-icon" onClick={() => { setEditId(p.id); setShowForm(true); }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>edit</span>
                </button>
                {p.sku && (
                  <button className="btn-icon" onClick={() => setBarcodeItem(p)} title="Barcode">
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>barcode</span>
                  </button>
                )}
                <button className="btn-icon" onClick={() => openAdjust(p)} title="Penyesuaian Stok">
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>inventory</span>
                </button>
                <button className="btn-icon" onClick={() => handleDelete(p.id, p.nama)}>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-expense-red)" }}>delete</span>
                </button>
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
            <div key={p.id} className="list-dense-item" style={{ display: "flex", flexDirection: "column", padding: "0.75rem", borderBottom: "1px solid var(--color-surface-border)", background: p.stok === 0 ? "rgba(186,26,26,0.03)" : p.stok <= p.stok_minimum ? "rgba(245,158,11,0.03)" : "transparent" }}>
              {/* Section 1: Nama Produk + Stok */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "8px", overflow: "hidden", background: "linear-gradient(135deg, var(--color-primary-container), var(--color-secondary-container))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {p.foto_path ? (
                      <img src={convertFileSrc(p.foto_path)} alt={p.nama} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "16px" }}>image</span>
                    )}
                  </div>
                  <h3 className="text-headline-sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nama}</h3>
                </div>
                <span className="text-label-md" style={{ color: p.stok === 0 ? "var(--color-error)" : p.stok <= p.stok_minimum ? "var(--color-warning-amber)" : "var(--color-text-secondary)", fontSize: "11px", flexShrink: 0 }}>
                  Stok: {p.stok} {p.satuan}
                </span>
              </div>
              {/* Section 2: SKU + Harga */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                {p.sku ? (
                  <span className="text-label-md" style={{ fontSize: "10px", background: "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px" }}>{p.sku}</span>
                ) : <span />}
                <span className="text-body-md" style={{ color: isDiskonAktif(p) ? "var(--color-expense-red)" : "var(--color-primary)", fontWeight: 700 }}>
                  {rupiah(hargaAktif(p))}
                  {isDiskonAktif(p) && <span style={{ color: "var(--color-text-secondary)", textDecoration: "line-through", fontSize: "11px", marginLeft: "6px" }}>{rupiah(p.harga_jual)}</span>}
                </span>
              </div>
              {/* Section 3: Tombol CRUD */}
              <div style={{ display: "flex", gap: "2px", justifyContent: "flex-end" }}>
                <button className="btn-icon" onClick={() => { setEditId(p.id); setShowForm(true); }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>edit</span>
                </button>
                {p.sku && (
                  <button className="btn-icon" onClick={() => setBarcodeItem(p)} title="Barcode">
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>barcode</span>
                  </button>
                )}
                <button className="btn-icon" onClick={() => openAdjust(p)} title="Penyesuaian Stok">
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>inventory</span>
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
      {adjustProduct && (
        <div className="modal-overlay" onClick={() => setAdjustProduct(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-headline-md">Penyesuaian Stok</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", margin: "0.25rem 0 1rem" }}>{adjustProduct.nama} · Stok sekarang {adjustProduct.stok}</p>
            <form onSubmit={submitAdjust} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div><label className="input-label">Stok Baru</label><input className="input-field" inputMode="numeric" value={adjustForm.stok_baru} onChange={(e) => setAdjustForm((prev) => ({ ...prev, stok_baru: e.target.value.replace(/\D/g, "") }))} /></div>
              <div><label className="input-label">Alasan *</label><input className="input-field" value={adjustForm.alasan} onChange={(e) => setAdjustForm((prev) => ({ ...prev, alasan: e.target.value }))} placeholder="Contoh: opname, rusak, hilang" /></div>
              <div style={{ display: "flex", gap: "0.75rem" }}><button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setAdjustProduct(null)}>Batal</button><button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan Audit</button></div>
            </form>
          </div>
        </div>
      )}
      {showImportCSV && (
        <div className="modal-overlay" onClick={() => setShowImportCSV(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3 className="text-headline-md">Import Produk CSV</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", margin: "0.25rem 0 1rem" }}>Unggah daftar produk dalam format CSV.</p>
            <div className="card" style={{ background: "var(--color-surface-container-low)", border: "1px dashed var(--color-primary)", padding: "1.25rem", textAlign: "center", cursor: "pointer", marginBottom: "0.75rem" }} onClick={handleImportCSV}>
              <span className="material-symbols-outlined" style={{ fontSize: "36px", color: "var(--color-primary)", marginBottom: "4px" }}>upload_file</span>
              <p className="text-headline-sm" style={{ color: "var(--color-primary)" }}>Pilih File CSV</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>Format: nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum</p>
            </div>
            {importResult && (
              <div className="card" style={{ padding: "0.75rem", background: "var(--color-surface-container-lowest)", marginBottom: "0.75rem" }}>
                <h4 className="text-headline-sm" style={{ color: "var(--color-primary)" }}>Hasil Import:</h4>
                <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", fontSize: "13px" }}><span>Dibuat:</span><strong>{importResult.dibuat}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", fontSize: "13px" }}><span>Diupdate:</span><strong>{importResult.diupdate}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", fontSize: "13px" }}><span>Dilewati/Gagal:</span><strong style={{ color: "var(--color-expense-red)" }}>{importResult.dilewati}</strong></div>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div style={{ maxHeight: "80px", overflowY: "auto", fontSize: "11px", color: "var(--color-expense-red)", marginTop: "4px", background: "var(--color-surface-container-low)", padding: "4px", borderRadius: "4px" }}>
                    {importResult.errors.map((err, i) => <div key={i}>{err}</div>)}
                  </div>
                )}
              </div>
            )}
            <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setShowImportCSV(false)}>Tutup</button>
          </div>
        </div>
      )}
      {/* Barcode Generator Modal */}
      {barcodeItem && (
        <div className="modal-overlay" onClick={() => setBarcodeItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "95vw", width: "400px" }}>
            <h3 className="text-headline-md" style={{ marginBottom: "0.5rem" }}>Barcode Produk</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>{barcodeItem.nama} · SKU: {barcodeItem.sku}</p>
            <div
              className="card"
              style={{ padding: "0.75rem", textAlign: "center", background: "white", marginBottom: "0.75rem", overflow: "hidden", maxWidth: "100%" }}
              dangerouslySetInnerHTML={{ __html: generateBarcodeSVG(barcodeItem.sku, 340, 80) }}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setBarcodeItem(null)}>Tutup</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={async () => {
                try {
                  // Simpan SVG sebagai file via plugin dialog
                  const { save } = await import("@tauri-apps/plugin-dialog");
                  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                  const path = await save({
                    filters: [{ name: "SVG", extensions: ["svg"] }],
                    defaultPath: `barcode_${barcodeItem.sku}.svg`,
                  });
                  if (path) {
                    await writeTextFile(path, generateBarcodeSVG(barcodeItem.sku, 380, 90));
                    addToast("Barcode tersimpan", "success");
                  }
                } catch (err) {
                  addToast(`Gagal simpan: ${err}`, "error");
                }
              }}>Simpan SVG</button>
            </div>
          </div>
        </div>
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
  const [supplierList, setSupplierList] = useState([]);
  const [form, setForm] = useState({
    nama: "", kategori_id: null, supplier_id: null, sku: "", satuan: "pcs",
    harga_beli: "", harga_jual: "", stok: "", stok_minimum: "",
    harga_diskon: "", diskon_berlaku_sampai: "", satuan_multi_text: "",
  });
  // State khusus foto produk: path dari Rust (persisten) dan preview base64 lokal.
  const [fotoPath, setFotoPath] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoDirty, setFotoDirty] = useState(false);
  const [scanSkuOpen, setScanSkuOpen] = useState(false); // Modal scan barcode untuk SKU

  useEffect(() => { setKatList(kategori); }, [kategori]);
  useEffect(() => { invoke("list_supplier").then(setSupplierList).catch(console.error); }, []);

  useEffect(() => {
    if (editId) {
      invoke("get_produk", { id: editId }).then((p) => {
        setForm({
          nama: p.nama, kategori_id: p.kategori_id, supplier_id: p.supplier_id, sku: p.sku || "",
          satuan: p.satuan, harga_beli: String(p.harga_beli),
          harga_jual: String(p.harga_jual), stok: String(p.stok),
          stok_minimum: String(p.stok_minimum),
          harga_diskon: p.harga_diskon ? String(p.harga_diskon) : "",
          diskon_berlaku_sampai: p.diskon_berlaku_sampai || "",
          satuan_multi_text: p.satuan_multi ? (() => { try { return JSON.stringify(JSON.parse(p.satuan_multi), null, 2); } catch { return p.satuan_multi; } })() : "",
        });
        // Inisialisasi foto produk: konversi path absolut ke URL yang bisa dirender WebView.
        setFotoPath(p.foto_path || null);
        setFotoPreview(p.foto_path ? convertFileSrc(p.foto_path) : null);
        setFotoDirty(false);
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

  // Pilih foto produk lewat native file picker, simpan preview lokal.
  const pickFoto = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Gambar", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (!selected) return;
      const bytes = await readFile(selected);
      const blob = new Blob([bytes], { type: "image/jpeg" });
      setFotoPreview(URL.createObjectURL(blob));
      setFotoPath(selected);
      setFotoDirty(true);
    } catch (e) {
      addToast(`Gagal ambil foto: ${e}`, "error");
    }
  };

  const removeFoto = () => {
    setFotoPreview(null);
    setFotoPath(null);
    setFotoDirty(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) { addToast("Nama produk wajib diisi", "error"); return; }
    if (!form.harga_jual) { addToast("Harga jual wajib diisi", "error"); return; }
    let satuanMulti = null;
    if (form.satuan_multi_text.trim()) {
      try {
        // Aturan satuan tambahan: disimpan JSON agar schema tetap ringan dan offline-first.
        const parsed = JSON.parse(form.satuan_multi_text);
        satuanMulti = JSON.stringify(parsed.filter((r) => r.satuan && Number(r.konversi) > 1 && Number(r.harga_jual) > 0));
      } catch {
        addToast("Format satuan tambahan harus JSON array", "error");
        return;
      }
    }
    setSaving(true);
    try {
      const input = {
        nama: form.nama.trim(),
        kategori_id: form.kategori_id || null,
        supplier_id: form.supplier_id || null,
        sku: form.sku.trim() || null,
        satuan: form.satuan.trim() || "pcs",
        harga_beli: parseInt(form.harga_beli) || 0,
        harga_jual: parseInt(form.harga_jual),
        stok: parseInt(form.stok) || 0,
        stok_minimum: parseInt(form.stok_minimum) || 0,
        foto_path: fotoPath,
        satuan_multi: satuanMulti,
        harga_diskon: parseInt(form.harga_diskon) || 0,
        diskon_berlaku_sampai: form.diskon_berlaku_sampai || null,
      };
      let savedId = editId;
      if (editId) {
        await invoke("update_produk", { id: editId, input });
        addToast("Produk diupdate", "success");
      } else {
        const created = await invoke("create_produk", { input });
        savedId = created.id;
        addToast("Produk ditambahkan", "success");
      }
      // Jika ada foto baru yang dipilih, kirim base64 ke Rust untuk disimpan permanen.
      if (fotoDirty && fotoPath && savedId) {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(fotoPath);
        await invoke("save_produk_foto", { produkId: savedId, fotoBase64: bytesToBase64(bytes) });
      } else if (fotoDirty && !fotoPath && savedId) {
        await invoke("delete_produk_foto", { produkId: savedId });
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
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>
          {editId ? "Edit Produk" : "Tambah Produk"}
        </h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Section Foto Produk (Stok & Visual Gap KasGo) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "16px",
                background: fotoPreview ? "none" : "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                border: "2px solid var(--color-surface-container-high)",
                boxShadow: "var(--shadow-elevation-low)",
                position: "relative"
              }}
            >
              {fotoPreview ? (
                <img src={fotoPreview} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: "40px", color: "#ffffff" }}>image</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={pickFoto}>
                {fotoPreview ? "Ubah Foto" : "Pilih Foto"}
              </button>
              {fotoPreview && (
                <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px", color: "var(--color-expense-red)", borderColor: "var(--color-expense-red)" }} onClick={removeFoto}>
                  Hapus
                </button>
              )}
            </div>
          </div>

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
          <div>
            <label className="input-label">Supplier</label>
            <select className="input-field" value={form.supplier_id || ""} onChange={(e) => setForm((prev) => ({ ...prev, supplier_id: e.target.value ? parseInt(e.target.value) : null }))}>
              <option value="">— Pilih Supplier —</option>
              {supplierList.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="input-label">SKU</label>
              {/* SKU bisa diketik manual atau diisi dari scanner native camera yang sama dengan Kasir. */}
              <div style={{ display: "flex", gap: 6 }}>
                <input className="input-field" style={{ flex: 1 }} value={form.sku} onChange={set("sku")} placeholder="Opsional" />
                <button
                  type="button"
                  className="btn-icon"
                  title="Scan SKU dari barcode"
                  onClick={() => setScanSkuOpen(true)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>qr_code_scanner</span>
                </button>
              </div>
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
              <label className="input-label">Harga Diskon (Promo)</label>
              <input className="input-field" value={form.harga_diskon} onChange={setNum("harga_diskon")} placeholder="Opsional" inputMode="numeric" />
            </div>
            <div>
              <label className="input-label">Berlaku Sampai</label>
              <input className="input-field" type="date" value={form.diskon_berlaku_sampai} onChange={set("diskon_berlaku_sampai")} />
            </div>
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
          <div>
            <label className="input-label">Aturan Satuan Tambahan (JSON)</label>
            <textarea
              className="input-field"
              rows={3}
              style={{ fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
              value={form.satuan_multi_text}
              onChange={set("satuan_multi_text")}
              placeholder='Contoh: [{"satuan":"dus","konversi":12,"harga_jual":120000}]'
            />
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
      {scanSkuOpen && (
        <BarcodeScanner
          onDetected={(value) => {
            if (value && value.trim()) {
              setForm((prev) => ({ ...prev, sku: value.trim() }));
            }
            setScanSkuOpen(false);
          }}
          onClose={() => setScanSkuOpen(false)}
        />
      )}
    </>
  );
}
