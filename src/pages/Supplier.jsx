// ============================================================
// Supplier.jsx — CRUD supplier + detail & chat WhatsApp
//
// Fitur:
//   - List supplier (klik row → buka modal detail)
//   - Form tambah/edit: nama, telepon, alamat, deskripsi tambahan
//   - Detail supplier: tampilkan semua info + tombol salin nomor + Chat WA
//   - Tombol WA membuka whatsapp://send?phone=<nomor> via Tauri opener
//     agar keluar dari WebView dan langsung menuju aplikasi WhatsApp
// ============================================================
import { useMemo, useState, useEffect } from "react";
import { VirtualDataTable } from "../components/VirtualDataTable";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";
import RupiahInput from "../components/RupiahInput";
import SearchSelect from "../components/SearchSelect";

// Helper: normalisasi nomor telepon ke format wa.me
// "0812345678" → "62812345678" (ganti 0 depan dengan 62, hapus non-digit)
const waNumber = (telp) => {
  if (!telp) return "";
  let digits = String(telp).replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("62")) { /* sudah format 62 */ }
  else digits = "62" + digits;
  return digits;
};

export default function Supplier() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [headerStats, setHeaderStats] = useState({ total: 0, punya_telepon: 0, punya_alamat: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null); // supplier yg dilihat di modal detail
  const [openDetailSections, setOpenDetailSections] = useState({ info: true, harga: true });
  const toggleSection = (key) => setOpenDetailSections(prev => ({ ...prev, [key]: !prev[key] }));
  const [form, setForm] = useState({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "" });
  // Catatan Harga Supplier
  const [hargaList, setHargaList] = useState([]);
  const [produkAll, setProdukAll] = useState([]);
  const [hargaForm, setHargaForm] = useState({ produk_id: "", harga: "", satuan: "pcs", catatan: "" });

  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  // -------------------------------------------------------
  // LOAD — ambil semua supplier dari backend.
  // -------------------------------------------------------
  const loadHeaderStats = () => {
    invoke("get_supplier_stats")
      .then((s) => setHeaderStats({
        total: Number(s?.total || 0),
        punya_telepon: Number(s?.punya_telepon || 0),
        punya_alamat: Number(s?.punya_alamat || 0),
      }))
      .catch(() => {});
  };

  const load = (offset = 0, append = false, searchValue = query) => {
    if (!append) { setLoading(true); loadHeaderStats(); }
    invoke("list_supplier", { search: searchValue || null, limit: PAGE_SIZE, offset })
      .then((data) => { setList((prev) => append ? [...prev, ...data] : data); setHasMore(data.length >= PAGE_SIZE); })
      .catch(e => { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => load(0, false, query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Load produk untuk dropdown catatan harga
  useEffect(() => {
    invoke("list_produk", { onlyActive: true })
      .then(setProdukAll)
      .catch(() => {});
  }, []);

  // Load catatan harga ketika detailItem berubah
  useEffect(() => {
    if (detailItem?.id) {
      invoke("list_catatan_harga_supplier", { supplier_id: detailItem.id })
        .then(setHargaList)
        .catch(() => setHargaList([]));
    } else {
      setHargaList([]);
    }
  }, [detailItem?.id]);

  // -------------------------------------------------------
  // SAVE HARGA — tambah catatan harga baru
  // -------------------------------------------------------
  const saveHarga = async (e) => {
    e.preventDefault();
    if (!hargaForm.produk_id || !hargaForm.harga) return addToast("Produk dan harga wajib diisi", "error");
    try {
      const hargaInput = {
        supplier_id: detailItem.id,
        produk_id: Number(hargaForm.produk_id),
        harga: Number(hargaForm.harga),
        satuan: hargaForm.satuan || "pcs",
        catatan: hargaForm.catatan || null,
      };
      const createdHarga = await invoke("create_catatan_harga_supplier", { input: hargaInput });
      addToast("Catatan harga ditambahkan", "success", {
        label: "Urungkan",
        action: async () => {
          await invoke("delete_catatan_harga_supplier", { id: createdHarga.id });
          setHargaList((prev) => prev.filter((h) => h.id !== createdHarga.id));
        },
      });
      setHargaForm({ produk_id: "", harga: "", satuan: "pcs", catatan: "" });
      // Refresh list
      invoke("list_catatan_harga_supplier", { supplier_id: detailItem.id })
        .then(setHargaList)
        .catch(() => {});
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const hapusHarga = async (id) => {
    if (!window.confirm("Hapus catatan harga ini?")) return;
    const snapshot = hargaList.find((h) => h.id === id);
    if (!snapshot) return;
    try {
      await invoke("delete_catatan_harga_supplier", { id });
      setHargaList((prev) => prev.filter((h) => h.id !== id));
      addToast("Catatan harga dihapus", "success", {
        label: "Urungkan",
        action: async () => {
          const restored = await invoke("create_catatan_harga_supplier", {
            input: {
              supplier_id: snapshot.supplier_id,
              produk_id: snapshot.produk_id,
              harga: snapshot.harga,
              satuan: snapshot.satuan,
              catatan: snapshot.catatan,
            },
          });
          setHargaList((prev) => [...prev, restored]);
        },
      });
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  // -------------------------------------------------------
  // SAVE — simpan supplier baru atau update existing.
  // -------------------------------------------------------
  const save = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) return addToast("Nama harus diisi", "error");
    try {
      const input = {
        nama: form.nama.trim(),
        telepon: form.telepon.trim() || null,
        alamat: form.alamat.trim() || null,
        deskripsi_tambahan: form.deskripsi_tambahan.trim() || null,
      };
      if (editItem) {
        const oldData = { ...editItem };
        await invoke("update_supplier", { id: editItem.id, input });
        addToast("Supplier diperbarui", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("update_supplier", {
              id: oldData.id,
              input: {
                nama: oldData.nama,
                telepon: oldData.telepon,
                alamat: oldData.alamat,
                deskripsi_tambahan: oldData.deskripsi_tambahan,
              },
            });
            load();
          },
        });
      } else {
        const created = await invoke("create_supplier", { input });
        addToast("Supplier ditambahkan", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("delete_supplier", { id: created.id });
            load();
          },
        });
      }
      setShowForm(false);
      setEditItem(null);
      setForm({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "" });
      load();
    } catch (err) { addToast(String(err), "error"); }
  };

  // -------------------------------------------------------
  // EDIT — buka form dengan data existing.
  // -------------------------------------------------------
  const edit = (item) => {
    setEditItem(item);
    setForm({
      nama: item.nama,
      telepon: item.telepon || "",
      alamat: item.alamat || "",
      deskripsi_tambahan: item.deskripsi_tambahan || "",
    });
    setShowForm(true);
    setDetailItem(null);
  };

  // -------------------------------------------------------
  // HAPUS — delete supplier by id.
  // -------------------------------------------------------
  const hapus = async (id) => {
    if (!window.confirm("Hapus supplier ini?")) return;
    const snapshot = list.find((s) => s.id === id);
    if (!snapshot) return;
    try {
      await invoke("delete_supplier", { id });
      setDetailItem(null);
      load();
      addToast("Supplier terhapus", "success", {
        label: "Urungkan",
        action: async () => {
          await invoke("create_supplier", {
            input: {
              nama: snapshot.nama,
              telepon: snapshot.telepon,
              alamat: snapshot.alamat,
              deskripsi_tambahan: snapshot.deskripsi_tambahan,
            },
          });
          load();
        },
      });
    } catch (err) { addToast(String(err), "error"); }
  };

  // -------------------------------------------------------
  // CHAT WA — buka browser default ke wa.me
  // -------------------------------------------------------
  const whatsappLink = (telp) => {
    const num = waNumber(telp);
    return num ? `https://wa.me/${num}` : "";
  };

  const copyWALink = async (telp) => {
    const link = whatsappLink(telp);
    if (!link) return addToast("Nomor telepon kosong", "error");
    try {
      await navigator.clipboard.writeText(link);
      addToast("Link WhatsApp disalin", "success");
    } catch (err) {
      addToast(`Gagal salin link WhatsApp: ${err}`, "error");
    }
  };

  const chatWA = async (telp) => {
    const link = whatsappLink(telp);
    if (!link) return addToast("Nomor telepon kosong", "error");
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(link);
    } catch (err) {
      addToast(`Gagal membuka WhatsApp: ${err}`, "error");
    }
  };

  // Close modals on Escape key
  useEffect(() => {
    /**
     * Handles Escape keydown to close the currently open modal.
     */
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        if (showForm) setShowForm(false);
        else if (detailItem) setDetailItem(null);
      }
    };
    if (showForm || detailItem) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showForm, detailItem]);

  const filteredSuppliers = useMemo(() => list.filter((s) => `${s.nama} ${s.telepon || ""} ${s.alamat || ""}`.toLowerCase().includes(query.toLowerCase())), [list, query]);
  const supplierColumns = [
    { key: "nama", label: "Supplier", render: (s) => <button className="sales-name" onClick={() => setDetailItem(s)}><span className="sales-avatar">{s.nama.charAt(0).toUpperCase()}</span><span><strong>{s.nama}</strong><small>{s.deskripsi_tambahan || "Supplier"}</small></span></button> },
    { key: "telepon", label: "Telepon", render: (s) => s.telepon || "-" },
    { key: "alamat", label: "Alamat", render: (s) => s.alamat || "-" },
    { key: "aksi", label: "Aksi", render: (s) => <div className="sales-row-actions">{s.telepon && <button className="btn-icon" onClick={(e) => { e.stopPropagation(); chatWA(s.telepon); }} title="Chat WhatsApp"><span className="material-symbols-outlined">chat</span></button>}<button className="btn-icon" onClick={(e) => { e.stopPropagation(); edit(s); }} title="Edit"><span className="material-symbols-outlined">edit</span></button><button className="btn-icon" onClick={(e) => { e.stopPropagation(); hapus(s.id); }} title="Hapus"><span className="material-symbols-outlined">delete</span></button></div> },
  ];

  return (
    <PageShell
      eyebrow="MASTER DATA"
      title="Daftar Supplier"
      description="Menampilkan, menambah, mengubah, dan menghapus data supplier / pemasok barang."
      actions={
        <>
          <button className="btn-primary sales-page__add" onClick={() => { setEditItem(null); setForm({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "" }); setShowForm(true); }}>
          <span className="material-symbols-outlined">add</span>Tambah Supplier
          </button>
        </>
      }
      stats={[
        { label: "Total Supplier", value: headerStats.total, icon: "local_shipping" },
        { label: "Punya Telepon", value: headerStats.punya_telepon, icon: "phone" },
        { label: "Punya Alamat", value: headerStats.punya_alamat, icon: "location_on" },
      ]}
    >
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, telepon, atau alamat..." /></div>
          <button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button>
        </div>
        <VirtualDataTable columns={supplierColumns} rows={filteredSuppliers} rowKey={(s) => s.id} loading={loading} hasMore={hasMore} onEndReached={() => { if (!loading && hasMore) load(list.length, true, query); }} emptyMessage="Belum ada supplier" />
      </section>

      {/* MODAL DETAIL SUPPLIER */}
      {detailItem && (
        <div className="modal-overlay" onClick={() => setDetailItem(null)}>
          <div className="modal-content supplier-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 430 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="text-headline-md">Detail Supplier</h3>
<button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setDetailItem(null)}>
                 <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Avatar + Nama */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--color-primary-container)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--color-primary)", fontSize: 24, fontWeight: 700,
              }}>
                {detailItem.nama.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-headline-sm">{detailItem.nama}</p>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                  ID: {detailItem.id}
                </p>
              </div>
            </div>

             <div className="supplier-info-section">
               <button type="button" className="supplier-section-toggle" onClick={() => toggleSection("info")}>
                 <span>Info Supplier</span>
                 <span className="material-symbols-outlined">{openDetailSections.info ? "expand_less" : "expand_more"}</span>
               </button>
               {openDetailSections.info && (
                 <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
             {/* Info grid */}
             <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
              <div>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Nama</p>
                <p className="text-body-md">{detailItem.nama || "-"}</p>
              </div>
              <div>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Nomor Telepon</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <p className="text-body-md">{detailItem.telepon || "-"}</p>
                  {detailItem.telepon && (
                    <button className="btn-icon" type="button" onClick={() => copyWALink(detailItem.telepon)} title="Salin link WhatsApp" style={{ width: 28, height: 28, minWidth: 28 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>content_copy</span>
                    </button>
                  )}
                </div>
              </div>
              <div>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Alamat</p>
                <p className="text-body-md">{detailItem.alamat || "-"}</p>
              </div>
              <div>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Deskripsi Tambahan</p>
                <p className="text-body-md" style={{ whiteSpace: "pre-wrap" }}>
                  {detailItem.deskripsi_tambahan || "-"}
                </p>
              </div>
            </div>

            {/* Tombol Chat WA */}
            <button
              className="btn-primary"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: "#25D366",
                borderColor: "#25D366",
                marginBottom: "0.5rem",
              }}
              onClick={() => chatWA(detailItem.telepon)}
              disabled={!detailItem.telepon}
            >
              <span className="material-symbols-outlined">chat</span>
              Chat WhatsApp
            </button>
            {detailItem.telepon && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--color-text-secondary)" }}>
                <p className="text-label-md">{whatsappLink(detailItem.telepon)}</p>
                <button className="btn-icon" type="button" onClick={() => copyWALink(detailItem.telepon)} title="Salin link WhatsApp" style={{ width: 28, height: 28, minWidth: 28 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>content_copy</span>
                </button>
              </div>
            )}

            {/* Tombol Edit */}
            <button
              className="btn-secondary"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => edit(detailItem)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 4 }}>edit</span>
              Edit Supplier
            </button>

             </div>
             )}
             </div>

             {/* == Catatan Harga Supplier == */}
             <div className="supplier-price-section">
               <button type="button" className="supplier-section-toggle" onClick={() => toggleSection("harga")}>
                 <span>Catatan Harga Supplier</span>
                 <span className="material-symbols-outlined">{openDetailSections.harga ? "expand_less" : "expand_more"}</span>
               </button>
               {openDetailSections.harga && (
               <div style={{ marginTop: "0.75rem" }}>

              {/* Form tambah */}
              <form onSubmit={saveHarga} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem", padding: "0.75rem", borderRadius: "8px" }}>
                  <SearchSelect
                    className="input-field supplier-product-select"
                    value={hargaForm.produk_id}
                    onChange={(value) => setHargaForm((prev) => ({ ...prev, produk_id: value }))}
                    placeholder="Ketik nama atau SKU produk..."
                    options={produkAll.map((p) => ({ value: String(p.id), label: `${p.nama}${p.sku ? ` — ${p.sku}` : ""}` }))}
                    required
                  />
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem" }}>
                  <RupiahInput value={hargaForm.harga} onChange={(val) => setHargaForm((p) => ({ ...p, harga: val }))} placeholder="Harga satuan" required />
                  <input className="input-field" value={hargaForm.satuan} onChange={(e) => setHargaForm((p) => ({ ...p, satuan: e.target.value }))} placeholder="pcs" />
                </div>
                <input className="input-field" value={hargaForm.catatan} onChange={(e) => setHargaForm((p) => ({ ...p, catatan: e.target.value }))} placeholder="Catatan (opsional)" />
                <button type="submit" className="btn-primary" style={{ width: "100%" }}>+ Tambah</button>
              </form>

              {/* List */}
              {hargaList.length === 0 ? (
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Belum ada catatan harga</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {hargaList.map((h) => (
                     <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", background: "var(--color-surface)", borderRadius: "8px" }}>
                      <div>
                        <p className="text-body-sm" style={{ fontWeight: 500 }}>{h.produk_nama}</p>
                        <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Rp {Number(h.harga).toLocaleString("id-ID")}/{h.satuan}{h.catatan ? ` · ${h.catatan}` : ""}</p>
                      </div>
                      <button className="btn-icon" onClick={() => hapusHarga(h.id)} style={{ color: "var(--color-expense-red)" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
               )}
               </div>
               )}
             </div>
           </div>
         </div>
       )}

       {/* MODAL FORM TAMBAH/EDIT */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="text-headline-md" style={{ margin: 0 }}>{editItem ? "Edit Supplier" : "Tambah Supplier"}</h3>
              <button type="button" className="btn-icon" aria-label="Tutup" onClick={() => { setShowForm(false); setEditItem(null); }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="input-label">Nama *</label>
                <input className="input-field" value={form.nama} onChange={e => setForm(prev => ({ ...prev, nama: e.target.value }))} placeholder="Nama supplier" />
              </div>
              <div>
                <label className="input-label">Nomor Telepon</label>
                <input className="input-field" value={form.telepon} onChange={e => setForm(prev => ({ ...prev, telepon: e.target.value }))} placeholder="Contoh: 0812345678" inputMode="tel" />
              </div>
              <div>
                <label className="input-label">Alamat</label>
                <input className="input-field" value={form.alamat} onChange={e => setForm(prev => ({ ...prev, alamat: e.target.value }))} placeholder="Alamat lengkap" />
              </div>
              <div>
                <label className="input-label">Deskripsi Tambahan</label>
                <textarea
                  className="input-field"
                  value={form.deskripsi_tambahan}
                  onChange={e => setForm(prev => ({ ...prev, deskripsi_tambahan: e.target.value }))}
                  placeholder="Catatan tambahan tentang supplier (opsional)"
                  rows={3}
                  style={{ resize: "vertical", minHeight: 70 }}
                />
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Batal</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
