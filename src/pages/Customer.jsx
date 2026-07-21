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
import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

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
  const [form, setForm] = useState({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "", limit_kredit: 0 });

  const load = () => {
    setLoading(true);
    invoke("list_customer")
      .then(setList)
      .catch((e) => addToast(String(e), "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

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
        await invoke("update_customer", { id: editItem.id, input });
        addToast("Customer diperbarui", "success");
      } else {
        await invoke("create_customer", { input });
        addToast("Customer ditambahkan", "success");
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
    try {
      await invoke("delete_customer", { id });
      addToast("Customer terhapus", "success");
      setDetailItem(null);
      load();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const copyPhone = async (telp) => {
    if (!telp) {
      addToast("Nomor telepon kosong", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(telp);
      addToast("Nomor telepon disalin", "success");
    } catch (err) {
      addToast(`Gagal salin nomor: ${err}`, "error");
    }
  };

  const chatWA = async (telp) => {
    const num = waNumber(telp);
    if (!num) {
      addToast("Nomor telepon kosong", "error");
      return;
    }
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(`whatsapp://send?phone=${num}`);
    } catch (err) {
      addToast(`Gagal membuka WhatsApp: ${err}`, "error");
    }
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header & Aksi Utama */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="text-headline-md">Daftar Customer</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <button
          className="btn-secondary"
          onClick={() => {
            setEditItem(null);
            setForm({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "", limit_kredit: 0 });
            setShowForm(true);
          }}
        >
          + Tambah Customer
        </button>
        <button className="btn-primary" onClick={() => { setImportResult(null); setShowImportCSV(true); }}>
          Impor CSV
        </button>
      </div>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="empty-state" style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--color-text-tertiary)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "48px" }}>group</span>
          <p style={{ marginTop: "0.5rem" }}>Belum ada customer</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
          {list.map((c) => (
            <div
              key={c.id}
              className="list-dense-item"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1rem",
                borderBottom: "1px solid var(--color-surface-border)",
                cursor: "pointer",
              }}
              onClick={() => setDetailItem(c)}
            >
              <div>
                <p className="text-headline-sm" style={{ fontWeight: 700 }}>{c.nama}</p>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                  {c.telepon || "No Telepon"} · {c.alamat || "No Alamat"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-icon"
                  onClick={() => edit(c)}
                  title="Edit"
                >
                  <span className="material-symbols-outlined">edit</span>
                </button>
                <button
                  className="btn-icon"
                  onClick={() => hapus(c.id)}
                  style={{ color: "var(--color-expense-red)" }}
                  title="Hapus"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DETAIL CUSTOMER */}
      {detailItem && (
        <div className="modal-overlay" onClick={() => setDetailItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="text-headline-md">Detail Customer</h3>
              <button className="btn-icon" onClick={() => setDetailItem(null)}>
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
                  <button
                    className="btn-icon"
                    type="button"
                    onClick={() => copyPhone(detailItem.telepon)}
                    disabled={!detailItem.telepon}
                    title="Salin nomor telepon"
                    style={{ width: 30, height: 30, minWidth: 30 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span>
                  </button>
                  <p className="text-body-md">{detailItem.telepon || "-"}</p>
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
              <p className="text-label-md" style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>
                wa.me/{waNumber(detailItem.telepon)}
              </p>
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
            <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>{editItem ? "Edit Customer" : "Tambah Customer"}</h3>
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
                <input
                  className="input-field"
                  value={form.limit_kredit || 0}
                  onChange={e => setForm(prev => ({ ...prev, limit_kredit: Number(e.target.value.replace(/\D/g, "")) || 0 }))}
                  placeholder="500000"
                  inputMode="numeric"
                />
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
            <h3 className="text-headline-md">Import Customer CSV</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", margin: "0.25rem 0 1rem" }}>Unggah daftar customer dalam format CSV.</p>
            <div className="card" style={{ background: "var(--color-surface-container-low)", border: "1px dashed var(--color-primary)", padding: "1.25rem", textAlign: "center", cursor: "pointer", marginBottom: "0.75rem" }} onClick={handleImportCSV}>
              <span className="material-symbols-outlined" style={{ fontSize: "36px", color: "var(--color-primary)", marginBottom: "4px" }}>upload_file</span>
              <p className="text-headline-sm" style={{ color: "var(--color-primary)" }}>Pilih File CSV</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>Format: nama, telepon, alamat, deskripsi_tambahan</p>
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
    </div>
  );
}
