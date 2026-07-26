import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import decodeQrImage from "../utils/decodeQrImage";

/**
 * Halaman multi-profil QRIS statis.
 * CRUD dan pemilihan profil aktif tetap menggunakan command backend yang ada.
 */
export default function TokoSetup() {
  const { addToast } = useToast();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nama: "", merchant: "", qris: "" });
  const [formPreview, setFormPreview] = useState(null);
  const [decoding, setDecoding] = useState(false);
  const [showTextPaste, setShowTextPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke("list_qris_profile");
      setProfiles(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
      addToast(`Gagal memuat profil QRIS: ${error}`, "error");
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const resetForm = () => {
    setEditId(null);
    setForm({ nama: "", merchant: "", qris: "" });
    setFormPreview(null);
    setShowTextPaste(false);
    setPasteText("");
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (profile) => {
    setEditId(profile.id);
    setForm({ nama: profile.nama, merchant: profile.merchant_name || "", qris: profile.qris_statis });
    setFormPreview(null);
    setShowTextPaste(false);
    setPasteText("");
    setShowForm(true);
  };

  const parseMerchant = async (qris) => {
    try {
      const meta = await invoke("parse_qris", { qris });
      if (meta?.merchant_name) {
        setForm((prev) => ({ ...prev, merchant: meta.merchant_name.trim() }));
        addToast(`Merchant terdeteksi: ${meta.merchant_name}`, "success");
      }
    } catch (error) {
      invoke("write_log", { msg: `QR_UPLOAD: parse metadata gagal: ${String(error).slice(0, 300)}` }).catch(() => {});
    }
  };

  const chooseImage = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({ multiple: false, directory: false, filters: [{ name: "Gambar", extensions: ["png", "jpg", "jpeg", "webp"] }] });
      if (!selected) return;
      setDecoding(true);
      const bytes = await readFile(selected);
      const blob = new Blob([bytes], { type: "image/png" });
      setFormPreview(URL.createObjectURL(blob));
      const text = await decodeQrImage(blob);
      setForm((prev) => ({ ...prev, qris: text }));
      await parseMerchant(text);
      addToast("QRIS terbaca dari gambar", "success");
    } catch (err) {
      addToast(err.message || "Gagal membaca gambar QRIS", "error");
    } finally {
      setDecoding(false);
    }
  };

  const usePastedText = () => {
    const cleaned = pasteText.trim();
    if (!cleaned) return addToast("Tempel string QRIS terlebih dahulu", "error");
    if (cleaned.length < 20) return addToast("String QRIS terlalu pendek", "error");
    setForm((prev) => ({ ...prev, qris: cleaned }));
    setShowTextPaste(false);
    setPasteText("");
    parseMerchant(cleaned);
    addToast("QRIS statis diterima", "success");
  };

  const save = async (event) => {
    event.preventDefault();
    const nama = form.nama.trim();
    const qris = form.qris.trim();
    if (!nama) return addToast("Nama profil wajib diisi", "error");
    if (!qris) return addToast("QRIS statis wajib diisi", "error");
    setSaving(true);
    try {
      await invoke("save_qris_profile", { id: editId, input: { nama, merchant_name: form.merchant.trim() || null, qris_statis: qris } });
      addToast(editId ? "Profil diperbarui" : "Profil baru tersimpan", "success");
      setShowForm(false);
      await loadProfiles();
    } catch (err) {
      addToast(`Gagal: ${err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (id) => {
    if (!confirm("Hapus profil QRIS ini?")) return;
    try {
      await invoke("delete_qris_profile", { id });
      addToast("Profil dihapus", "success");
      loadProfiles();
    } catch (err) { addToast(`Gagal: ${err}`, "error"); }
  };

  const setActive = async (id) => {
    try {
      await invoke("set_active_qris_profile", { id });
      addToast("Profil aktif diubah", "success");
      loadProfiles();
    } catch (err) { addToast(`Gagal: ${err}`, "error"); }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "var(--color-accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "22px", color: "#fff" }}>storefront</span>
          </div>
          <div>
             <h1 className="text-headline-md">Profil QRIS Pembayaran</h1>
             <p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>Kelola profil QRIS statis yang digunakan untuk pembayaran pelanggan</p>
          </div>
        </div>
        <button className="btn-primary" style={{ padding: "8px 14px", minHeight: 0, fontSize: "13px" }} onClick={openNew}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span> Baru
        </button>
      </header>

      <div style={{ background: "var(--color-primary-fixed)", borderRadius: "12px", padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "20px" }}>touch_app</span>
        <p style={{ fontSize: "12px", color: "var(--color-primary-container)", lineHeight: "1.5" }}>
          Ketuk profil untuk menjadikannya QRIS aktif. Profil aktif dipakai otomatis saat pembayaran QRIS.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "52px", color: "var(--color-text-secondary)", opacity: 0.4 }}>qr_code_2</span>
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: "10px" }}>Belum ada profil QRIS</p>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>Tambahkan QRIS statis untuk mulai menerima pembayaran</p>
          <button className="btn-primary" style={{ marginTop: "1rem" }} onClick={openNew}>Tambah Profil Pertama</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {profiles.map((profile) => (
            <div key={profile.id} className="card" style={{ display: "flex", alignItems: "center", gap: "12px", border: profile.is_active ? "2px solid var(--color-primary)" : "1px solid var(--color-surface-border)", cursor: "pointer", padding: "14px" }} onClick={() => !profile.is_active && setActive(profile.id)}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: profile.is_active ? "var(--color-primary)" : "var(--color-surface-container-high)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: "22px", color: profile.is_active ? "#fff" : "var(--color-text-secondary)" }}>qr_code_2</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "14px" }}>{profile.nama}</strong>
                  {profile.is_active && <span className="chip chip-green" style={{ padding: "2px 8px" }}>Aktif</span>}
                </div>
                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "3px" }}>
                  {profile.merchant_name || "Nama merchant belum diisi"}
                </p>
                <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontFamily: "monospace", marginTop: "2px" }}>{profile.qris_statis.slice(0, 28)}…</p>
              </div>
              <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <button className="btn-icon" onClick={() => openEdit(profile)} title="Edit" aria-label={`Edit ${profile.nama}`}><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>edit</span></button>
                <button className="btn-icon" onClick={() => deleteProfile(profile.id)} title="Hapus" aria-label={`Hapus ${profile.nama}`}><span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-error)" }}>delete</span></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h2 className="text-headline-sm">{editId ? "Edit Profil QRIS" : "Tambah Profil QRIS"}</h2>
                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>Simpan QRIS statis untuk digunakan di kasir</p>
              </div>
              <button className="btn-icon" onClick={() => setShowForm(false)} aria-label="Tutup"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={save}>
              <label style={{ display: "block", marginBottom: "14px" }}>
                <span className="input-label">Nama Profil *</span>
                <input className="input-field" value={form.nama} onChange={(e) => setForm((p) => ({ ...p, nama: e.target.value }))} placeholder="Contoh: QRIS Toko Utama" autoFocus />
                <span style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>Nama internal untuk membedakan profil</span>
              </label>
              <label style={{ display: "block", marginBottom: "14px" }}>
                <span className="input-label">Nama Merchant</span>
                <input className="input-field" value={form.merchant} onChange={(e) => setForm((p) => ({ ...p, merchant: e.target.value }))} placeholder="Otomatis terisi dari QRIS" />
              </label>
              <div style={{ marginBottom: "16px" }}>
                <span className="input-label">QRIS Statis *</span>
                {form.qris && <div style={{ background: "rgba(16, 185, 129, 0.1)", borderRadius: "8px", padding: "8px 10px", margin: "6px 0", display: "flex", gap: "6px", alignItems: "center" }}><span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--color-income-green)" }}>check_circle</span><span style={{ fontSize: "11px", color: "var(--color-income-green)" }}>QRIS siap disimpan</span></div>}
                <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: "6px", fontSize: "13px" }} onClick={chooseImage} disabled={decoding}><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add_photo_alternate</span>{decoding ? "Membaca QR…" : "Upload Gambar QRIS"}</button>
                <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: "6px", fontSize: "13px" }} onClick={() => setShowTextPaste((v) => !v)}><span className="material-symbols-outlined" style={{ fontSize: "18px" }}>content_paste</span>{showTextPaste ? "Tutup Paste Teks" : "Paste String QRIS"}</button>
                {showTextPaste && <div style={{ marginTop: "8px" }}><textarea className="input-field" rows={3} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Tempel string QRIS (0002010102...)" style={{ fontFamily: "monospace", fontSize: "11px" }} /><button type="button" className="btn-primary" style={{ width: "100%", marginTop: "6px", fontSize: "13px" }} onClick={usePastedText}>Gunakan String Ini</button></div>}
                {formPreview && <img src={formPreview} alt="Preview QRIS" style={{ display: "block", width: "96px", height: "96px", objectFit: "contain", margin: "10px auto 0", borderRadius: "8px" }} />}
              </div>
              <div style={{ display: "flex", gap: "10px" }}><button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Batal</button><button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={saving || decoding || !form.nama.trim() || !form.qris.trim()}>{saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>save</span>}{editId ? " Simpan Perubahan" : " Simpan Profil"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
