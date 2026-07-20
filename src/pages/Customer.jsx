// ============================================================
// Customer.jsx — CRUD customer + detail & chat WhatsApp
//
// Fitur:
//   - List customer (klik row → buka modal detail)
//   - Form tambah/edit: nama, telepon, alamat, deskripsi tambahan
//   - Detail customer: tampilkan semua info + tombol salin nomor + Chat WA
//   - Tombol WA membuka whatsapp://send?phone=<nomor> via Tauri opener
//     agar keluar dari WebView dan langsung menuju aplikasi WhatsApp
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
  else if (digits.startsWith("62")) { /* sudah format 62 */ }
  else digits = "62" + digits;
  return digits;
};

export default function Customer() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null); // customer yg dilihat di modal detail
  const [form, setForm] = useState({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "" });

  // -------------------------------------------------------
  // LOAD — ambil semua customer dari backend.
  // -------------------------------------------------------
  const load = () => {
    setLoading(true);
    invoke("list_customer")
      .then(setList)
      .catch(e => addToast(String(e), "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // -------------------------------------------------------
  // SAVE — simpan customer baru atau update existing.
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
        await invoke("update_customer", { id: editItem.id, input });
        addToast("Customer diperbarui", "success");
      } else {
        await invoke("create_customer", { input });
        addToast("Customer ditambahkan", "success");
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
  // HAPUS — delete customer by id.
  // -------------------------------------------------------
  const hapus = async (id) => {
    if (!window.confirm("Hapus customer ini?")) return;
    try {
      await invoke("delete_customer", { id });
      addToast("Customer terhapus", "success");
      setDetailItem(null);
      load();
    } catch (err) { addToast(String(err), "error"); }
  };

  // -------------------------------------------------------
  // COPY PHONE — salin nomor telepon mentah ke clipboard.
  // -------------------------------------------------------
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

  // -------------------------------------------------------
  // CHAT WA — buka aplikasi WhatsApp, bukan WebView bawaan.
  // -------------------------------------------------------
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="text-headline-md">Daftar Customer</h2>
        <button className="btn-primary" onClick={() => {
          setEditItem(null);
          setForm({ nama: "", telepon: "", alamat: "", deskripsi_tambahan: "" });
          setShowForm(true);
        }}>
          + Customer
        </button>
      </div>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">group</span>
          <p>Belum ada customer</p>
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
                <p className="text-headline-sm">{c.nama}</p>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                  {c.telepon || "No Telepon"} · {c.alamat || "No Alamat"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className="btn-icon"
                  onClick={(e) => { e.stopPropagation(); edit(c); }}
                  title="Edit"
                >
                  <span className="material-symbols-outlined">edit</span>
                </button>
                <button
                  className="btn-icon"
                  onClick={(e) => { e.stopPropagation(); hapus(c.id); }}
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
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="text-headline-md">Detail Customer</h3>
              <button className="btn-icon" onClick={() => setDetailItem(null)}>
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

            {/* Info grid */}
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
              <p className="text-label-md" style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>
                wa.me/{waNumber(detailItem.telepon)}
              </p>
            )}

            {/* Tombol Edit */}
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
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Batal</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}