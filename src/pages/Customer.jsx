// ============================================================
// Customer.jsx — CRUD customer + detail, Chat WA, dan Import CSV massal.
//
// Fitur:
//   - List customer (klik row → buka modal detail)
//   - Form tambah/edit: nama, telepon, alamat, deskripsi tambahan
//   - Detail customer: tampilkan semua info + tombol salin nomor + Chat WA
//   - Import CSV: membaca file CSV secara native, parse & upsert data customer.
//
// Design ref: Stitch — "Import Customer CSV" & "Daftar Customer" (violet-cyan).
// ============================================================
import { useMemo, useState, useEffect } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DropZoneImport from "../components/DropZoneImport";
import RupiahInput from "../components/RupiahInput";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";
import { VirtualDataTable } from "../components/VirtualDataTable";

// Helper: normalisasi nomor telepon ke format wa.me
// "0812345678" → "62812345678" (ganti 0 depan dengan 62, hapus non-digit)
const waNumber = (telp) => {
  if (!telp) return "";
  let digits = String(telp).replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  return digits;
};

export default function Customer() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;
  const [form, setForm] = useState({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "", limit_kredit: 0 });

  const load = (offset = 0, append = false, searchValue = query) => {
    if (!append) setLoading(true);
    invoke("list_customer", { search: searchValue || null, limit: PAGE_SIZE, offset })
      .then((data) => { setList((prev) => append ? [...prev, ...data] : data); setHasMore(data.length >= PAGE_SIZE); })
      .catch((e) => { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => load(0, false, query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) return addToast("Nama harus diisi", "error");
    try {
      const input = {
        nama: form.nama.trim(),
        telepon: form.telepon.trim() || null,
        alamat: form.alamat.trim() || null,
        deskripsi_tambahan: form.deskripsi_tambahan.trim() || null,
        limit_kredit: Number(form.limit_kredit || 0),
      };
      if (editItem) {
        const oldData = { ...editItem };
        await invoke("update_customer", { id: editItem.id, input });
        addToast("Customer diperbarui", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("update_customer", {
              id: oldData.id,
              input: {
                nama: oldData.nama,
                telepon: oldData.telepon,
                alamat: oldData.alamat,
                deskripsi_tambahan: oldData.deskripsi_tambahan,
                limit_kredit: oldData.limit_kredit,
              },
            });
            load();
          },
        });
      } else {
        const created = await invoke("create_customer", { input });
        addToast("Customer ditambahkan", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("delete_customer", { id: created.id });
            load();
          },
        });
      }
      setShowForm(false);
      setEditItem(null);
      setForm({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "", limit_kredit: 0 });
      load();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const edit = (item) => {
    setEditItem(item);
    setForm({
      nama: item.nama,
      telepon: item.telepon || "",
      alamat: item.alamat || "",
      deskripsi_tambahan: item.deskripsi_tambahan || "",
      limit_kredit: item.limit_kredit || 0,
    });
    setShowForm(true);
    setDetailItem(null);
  };

  const hapus = async (id) => {
    if (!window.confirm("Hapus customer ini?")) return;
    const snapshot = list.find((c) => c.id === id);
    if (!snapshot) return;
    try {
      await invoke("delete_customer", { id });
      setDetailItem(null);
      load();
      addToast("Customer terhapus", "success", {
        label: "Urungkan",
        action: async () => {
          await invoke("create_customer", {
            input: {
              nama: snapshot.nama,
              telepon: snapshot.telepon,
              alamat: snapshot.alamat,
              deskripsi_tambahan: snapshot.deskripsi_tambahan,
              limit_kredit: snapshot.limit_kredit,
            },
          });
          load();
        },
      });
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const whatsappLink = (telp) => {
    const num = waNumber(telp);
    return num ? `https://wa.me/${num}` : "";
  };

  const copyWALink = async (telp) => {
    const link = whatsappLink(telp);
    if (!link) {
      addToast("Nomor telepon kosong", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      addToast("Link WhatsApp disalin", "success");
    } catch (err) {
      addToast(`Gagal salin link WhatsApp: ${err}`, "error");
    }
  };

  const chatWA = async (telp) => {
    const link = whatsappLink(telp);
    if (!link) {
      addToast("Nomor telepon kosong", "error");
      return;
    }
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(link);
    } catch (err) {
      addToast(`Gagal membuka WhatsApp: ${err}`, "error");
    }
  };

  const handleImportText = async (csvText) => {
    const res = await invoke("import_customer_csv", { csvText });
    setImportResult(res);
    addToast(`Import: ${res.dibuat} baru, ${res.diupdate} update`, "success");
    load();
  };

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
      const res = await invoke("import_customer_csv", { csvText });
      setImportResult(res);
      addToast(`Import: ${res.dibuat} baru, ${res.diupdate} update`, "success");
      load();
    } catch (e) {
      addToast(`Gagal import CSV: ${e}`, "error");
    }
  };

  // Escape key closes active modal — does not close during save operations
  useEffect(() => {
    /**
     * Handles Escape keydown to close the currently open modal.
     * Prevents closing while an import operation is in progress.
     */
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        if (showForm) setShowForm(false);
        else if (showImportCSV) setShowImportCSV(false);
        else if (detailItem) setDetailItem(null);
      }
    };
    if (showForm || showImportCSV || detailItem) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showForm, showImportCSV, detailItem]);

  const filteredCustomers = useMemo(() => list.filter((c) => `${c.nama} ${c.telepon || ""} ${c.alamat || ""}`.toLowerCase().includes(query.toLowerCase())), [list, query]);
  const customerColumns = [
    { key: "nama", label: "Pelanggan", render: (c) => <button className="sales-name" onClick={() => setDetailItem(c)}><span className="sales-avatar">{c.nama.charAt(0).toUpperCase()}</span><span><strong>{c.nama}</strong><small>{c.deskripsi_tambahan || "Pelanggan"}</small></span></button> },
    { key: "telepon", label: "Telepon", render: (c) => c.telepon || "-" },
    { key: "alamat", label: "Alamat", render: (c) => c.alamat || "-" },
    { key: "limit_kredit", label: "Limit Kredit", render: (c) => Number(c.limit_kredit) > 0 ? `Rp ${Number(c.limit_kredit).toLocaleString("id-ID")}` : "-" },
    { key: "aksi", label: "Aksi", render: (c) => <div className="sales-row-actions">{c.telepon && <button className="btn-icon" onClick={() => chatWA(c.telepon)} title="Chat WhatsApp"><span className="material-symbols-outlined">chat</span></button>}<button className="btn-icon" onClick={() => edit(c)} title="Edit"><span className="material-symbols-outlined">edit</span></button><button className="btn-icon" onClick={() => hapus(c.id)} title="Hapus"><span className="material-symbols-outlined">delete</span></button></div> },
  ];

  return (
    <PageShell
      eyebrow="MASTER DATA"
      title="Daftar Pelanggan"
      description="Menampilkan, menambah, mengubah, dan menghapus data pelanggan / customer."
      actions={
        <>
          <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary sales-page__add" onClick={() => { setImportResult(null); setShowImportCSV(true); }}><span className="material-symbols-outlined">upload_file</span>Impor CSV</button>
          <button className="btn-primary sales-page__add" onClick={() => { setEditItem(null); setForm({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "", limit_kredit: 0 }); setShowForm(true); }}><span className="material-symbols-outlined">person_add</span>Tambah Pelanggan</button>
          </div>
        </>
      }
      stats={[
        { label: "Total Pelanggan", value: list.length, icon: "group" },
        { label: "Punya Limit Kredit", value: list.filter(c => Number(c.limit_kredit) > 0).length, icon: "credit_card" },
        { label: "Punya Telepon", value: list.filter(c => c.telepon).length, icon: "phone" },
      ]}
    >
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, telepon, atau alamat..." /></div>
          <button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button>
        </div>
        <VirtualDataTable columns={customerColumns} rows={filteredCustomers} rowKey={(c) => c.id} loading={loading} hasMore={hasMore} onEndReached={() => { if (!loading && hasMore) load(list.length, true, query); }} emptyMessage="Belum ada pelanggan" />
      </section>

      {/* MODAL DETAIL CUSTOMER */}
      {detailItem && (
        <div className="modal-overlay" onClick={() => setDetailItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="text-headline-md">Detail Customer</h3>
<button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setDetailItem(null)}>
                 <span className="material-symbols-outlined">close</span>
              </button>
            </div>

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

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
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
              <div>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Limit Kredit</p>
                <p className="text-body-md">{detailItem.limit_kredit > 0 ? `Rp ${Number(detailItem.limit_kredit).toLocaleString("id-ID")}` : "Tidak terbatas"}</p>
              </div>
            </div>

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

            <button
              className="btn-secondary"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => edit(detailItem)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 4 }}>edit</span>
              Edit Customer
            </button>
          </div>
        </div>
      )}

      {/* MODAL FORM TAMBAH/EDIT */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="text-headline-md" style={{ margin: 0 }}>{editItem ? "Edit Customer" : "Tambah Customer"}</h3>
              <button type="button" className="btn-icon" aria-label="Tutup" onClick={() => { setShowForm(false); setEditItem(null); }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="input-label">Nama *</label>
                <input className="input-field" value={form.nama} onChange={e => setForm(prev => ({ ...prev, nama: e.target.value }))} placeholder="Nama customer" />
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
                  placeholder="Catatan tambahan tentang customer (opsional)"
                  rows={3}
                  style={{ resize: "vertical", minHeight: 70 }}
                />
              </div>
              <div>
                <label className="input-label">Limit Kredit (Rp)</label>
                <RupiahInput value={form.limit_kredit || 0} onChange={(val) => setForm(prev => ({ ...prev, limit_kredit: Number(val) || 0 }))} placeholder="500000" />
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                  Batas maksimal piutang yang diizinkan. 0 = tanpa batas.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Batal</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORT CSV */}
      {showImportCSV && (
        <div className="modal-overlay" onClick={() => setShowImportCSV(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="text-headline-md">Import Customer CSV</h3>
              <button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setShowImportCSV(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", margin: "0.25rem 0 1rem" }}>Unggah daftar customer dalam format CSV.</p>
            <DropZoneImport
              title="Pilih atau Drop File CSV di sini"
              subtitle="Format: nama, telepon, alamat, deskripsi_tambahan"
              onText={async (text) => { try { await handleImportText(text); } catch(e) { { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }; } }}
            />
            {importResult && (
              <div className="card" style={{ padding: "0.75rem", marginBottom: "0.75rem" }}>
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
    </PageShell>
  );
}
