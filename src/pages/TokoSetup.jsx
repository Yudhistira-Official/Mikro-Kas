// AturQris.jsx — Manajemen multi-profil QRIS statis.
// Setiap profil menyimpan nama, nama merchant, dan string QRIS statis.
// User bisa: buat, edit, hapus, pilih profil aktif.
// Decode gambar QRIS + fallback paste teks langsung untuk Android WebView.
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { useNavigate } from "react-router-dom";
import decodeQrImage from "../utils/decodeQrImage";

export default function TokoSetup() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);

  // Form fields
  const [formNama, setFormNama] = useState("");
  const [formMerchant, setFormMerchant] = useState("");
  const [formQris, setFormQris] = useState("");
  const [formPreview, setFormPreview] = useState(null);
  const [decoding, setDecoding] = useState(false);
  const [showTextPaste, setShowTextPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Loading harus selalu ditutup, termasuk saat database lama belum punya tabel profile.
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

  // Buka form untuk buat baru
  const openNew = () => {
    setEditId(null);
    setFormNama("");
    setFormMerchant("");
    setFormQris("");
    setFormPreview(null);
    setShowTextPaste(false);
    setPasteText("");
    setShowForm(true);
  };

  // Buka form untuk edit
  const openEdit = (p) => {
    setEditId(p.id);
    setFormNama(p.nama);
    setFormMerchant(p.merchant_name || "");
    setFormQris(p.qris_statis);
    setFormPreview(null);
    setShowTextPaste(false);
    setPasteText("");
    setShowForm(true);
  };

  // Handle upload menggunakan native dialog picker agar kompatibel dengan Android content:// URI
  // dan mem-bypass pembatasan WebView Samsung sandbox (NotReadableError).
  const pilihGambarDialog = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      
      invoke("write_log", { msg: "QR_UPLOAD: native dialog open dipicu" }).catch(() => {});
      
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Gambar", extensions: ["png", "jpg", "jpeg", "webp"] }]
      });

      if (!selected) {
        invoke("write_log", { msg: "QR_UPLOAD: dialog dibatalkan oleh user" }).catch(() => {});
        return;
      }

      setDecoding(true);
      const isContentUri = selected.startsWith("content://");
      invoke("write_log", { msg: `QR_UPLOAD: dialog terpilih; path=${selected.slice(0, 120)}; tipe=${isContentUri ? "AndroidContentUri" : "LocalFile"}` }).catch(() => {});

      // Baca byte via plugin-fs; dialog picker menambahkan path terpilih ke scope read.
      const bytes = await readFile(selected);
      const blob = new Blob([bytes], { type: "image/png" });
      
      // Set preview dari blob di memori
      const dataUrl = URL.createObjectURL(blob);
      setFormPreview(dataUrl);

      // Dekode gambar QRIS
      const text = await decodeQrImage(blob);
      setFormQris(text);

      // Auto-detect merchant name
      try {
        const meta = await invoke("parse_qris", { qris: text });
        if (meta?.merchant_name) {
          setFormMerchant(meta.merchant_name.trim());
          addToast(`Merchant: ${meta.merchant_name}`, "success");
        }
      } catch (parseError) {
        invoke("write_log", { msg: `QR_UPLOAD: parse metadata gagal: ${String(parseError?.message || parseError).slice(0, 300)}` }).catch(() => {});
      }
      addToast("QRIS terbaca dari gambar", "success");
    } catch (err) {
      invoke("write_log", { msg: `QR_UPLOAD: dialog gagal: ${String(err?.message || err).slice(0, 300)}` }).catch(() => {});
      addToast(err.message || "Gagal membaca gambar QRIS", "error");
    } finally {
      setDecoding(false);
    }
  };

  // Handle paste teks QRIS
  const handleTextPaste = () => {
    const cleaned = pasteText.trim();
    if (!cleaned) { addToast("Tempel string QRIS terlebih dahulu", "error"); return; }
    if (cleaned.length < 20) { addToast("String QRIS terlalu pendek", "error"); return; }
    setFormQris(cleaned);
    setShowTextPaste(false);
    setPasteText("");
    // Auto-detect merchant
    invoke("parse_qris", { qris: cleaned })
      .then((meta) => {
        if (meta?.merchant_name) {
          setFormMerchant(meta.merchant_name.trim());
          addToast(`Merchant: ${meta.merchant_name}`, "success");
        }
      })
      .catch(() => {});
    addToast("QRIS statis diterima", "success");
  };

  // Simpan profil
  const handleSave = async () => {
    const nama = formNama.trim();
    const qris = formQris.trim();
    if (!nama) { addToast("Nama wajib diisi", "error"); return; }
    if (!qris) { addToast("QRIS statis wajib diisi", "error"); return; }
    setSaving(true);
    try {
      await invoke("save_qris_profile", {
        id: editId,
        input: { nama, merchant_name: formMerchant.trim() || null, qris_statis: qris },
      });
      addToast(editId ? "Profil diperbarui" : "Profil baru tersimpan", "success");
      setShowForm(false);
      loadProfiles();
    } catch (err) {
      addToast(`Gagal: ${err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // Hapus profil
  const handleDelete = async (id) => {
    if (!confirm("Hapus profil QRIS ini?")) return;
    try {
      await invoke("delete_qris_profile", { id });
      addToast("Profil dihapus", "success");
      loadProfiles();
    } catch (err) {
      addToast(`Gagal: ${err}`, "error");
    }
  };

  // Set profil aktif
  const handleSetActive = async (id) => {
    try {
      await invoke("set_active_qris_profile", { id });
      addToast("Profil aktif diubah", "success");
      loadProfiles();
    } catch (err) {
      addToast(`Gagal: ${err}`, "error");
    }
  };

  if (loading) {
    return <div className="loading-page"><div className="spinner" /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "0.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 className="text-headline-md">Atur QRIS</h2>
          <p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>
            Kelola profil QRIS statis untuk pembayaran dinamis.
          </p>
        </div>
        <button className="btn-primary" style={{ padding: "8px 16px", minHeight: 0, fontSize: "13px" }} onClick={openNew}>
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add</span> Baru
        </button>
      </div>

      {/* Daftar profil */}
      {profiles.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "2rem 1rem" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--color-text-secondary)", opacity: 0.5 }}>qr_code_2</span>
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: "8px" }}>Belum ada profil QRIS</p>
          <button className="btn-primary" style={{ marginTop: "1rem" }} onClick={openNew}>Tambah Profil Pertama</button>
        </div>
      )}

      {profiles.map((p) => (
        <div key={p.id} className="card" style={{
          display: "flex", alignItems: "center", gap: "12px",
          border: p.is_active ? "2px solid var(--color-primary)" : "1px solid var(--color-surface-border)",
          cursor: "pointer",
        }} onClick={() => handleSetActive(p.id)}>
          {/* Avatar icon */}
          <div style={{
            width: "40px", height: "40px", borderRadius: "10px",
            background: p.is_active ? "var(--color-primary)" : "var(--color-surface-container-high)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{
              fontSize: "20px", color: p.is_active ? "#fff" : "var(--color-text-secondary)",
            }}>qr_code_2</span>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
              {p.nama}
              {p.is_active && (
                <span style={{ fontSize: "10px", background: "var(--color-primary)", color: "#fff", padding: "1px 6px", borderRadius: "999px" }}>
                  Aktif
                </span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.merchant_name || "—"} • {p.qris_statis.slice(0, 25)}…
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-icon" style={{ padding: "6px" }} onClick={() => openEdit(p)} title="Edit">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>edit</span>
            </button>
            <button className="btn-icon" style={{ padding: "6px" }} onClick={() => handleDelete(p.id)} title="Hapus">
              <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-error)" }}>delete</span>
            </button>
          </div>
        </div>
      ))}

      {/* Bottom sheet form */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 1000 }}
          onClick={() => setShowForm(false)}>
          <div style={{
            background: "var(--color-surface-container-lowest)", width: "100%",
            borderTopLeftRadius: "16px", borderTopRightRadius: "16px",
            padding: "1.5rem 1rem 2rem", maxHeight: "85vh", overflowY: "auto",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="text-headline-sm">{editId ? "Edit Profil" : "Profil Baru"}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Nama (renamed from "Nama Toko") */}
            <div style={{ marginBottom: "12px" }}>
              <label className="input-label">Nama</label>
              <input className="input-field" value={formNama} onChange={(e) => setFormNama(e.target.value)}
                placeholder="Contoh: Toko Makmur" />
            </div>

            {/* Merchant Name */}
            <div style={{ marginBottom: "12px" }}>
              <label className="input-label">Nama Merchant (otomatis terdeteksi)</label>
              <input className="input-field" value={formMerchant} onChange={(e) => setFormMerchant(e.target.value)}
                placeholder="Otomatis terisi dari QRIS" />
            </div>

            {/* QRIS Input */}
            <div style={{ marginBottom: "12px" }}>
              <label className="input-label">QRIS Statis</label>

              {formQris && (
                <p className="text-label-md" style={{ color: "var(--color-income-green)", marginBottom: "6px" }}>
                  ✓ QRIS tersimpan ({formQris.slice(0, 30)}…)
                </p>
              )}

              {/* Upload gambar: native picker, bukan HTML FileReader WebView. */}
              <button
                type="button"
                className="btn-secondary"
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: "6px", marginBottom: "6px",
                }}
                onClick={pilihGambarDialog}
                disabled={decoding}
              >
                <span className="material-symbols-outlined">add_photo_alternate</span>
                {decoding ? "Membaca QR…" : "Upload Gambar QRIS"}
              </button>

              {/* Paste teks — fallback untuk Android WebView yang gagal decode gambar */}
              <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setShowTextPaste(!showTextPaste)}>
                <span className="material-symbols-outlined">content_paste</span>
                {showTextPaste ? "Tutup" : "Paste Teks QRIS"}
              </button>

              {showTextPaste && (
                <div style={{ marginTop: "8px" }}>
                  <textarea className="input-field" rows={3} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Tempel string QRIS di sini (0002010102...)" style={{ fontFamily: "monospace", fontSize: "11px" }} />
                  <button className="btn-primary" style={{ width: "100%", marginTop: "6px" }} onClick={handleTextPaste}>
                    Gunakan Teks Ini
                  </button>
                </div>
              )}
            </div>

            <button className="btn-primary" style={{ width: "100%" }} onClick={handleSave}
              disabled={saving || decoding || !formNama.trim() || !formQris.trim()}>
              {saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : null}
              {editId ? "Simpan Perubahan" : "Simpan Profil"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
