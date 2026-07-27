// ============================================================
// TokoSetup.jsx — Multi-profil QRIS statis (PageKit).
//
// Commands: list_qris_profile, save_qris_profile, delete_qris_profile,
//   set_active_qris_profile, parse_qris, write_log
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import decodeQrImage from "../utils/decodeQrImage";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter,
} from "../components/PageKit";

/**
 * Halaman multi-profil QRIS statis: CRUD + set aktif + upload gambar / paste string.
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

  const { query, setQuery, filtered } = useSearchFilter(
    profiles,
    (p) => `${p.nama || ""} ${p.merchant_name || ""} ${p.qris_statis || ""}`
  );

  const activeCount = profiles.filter((p) => p.is_active).length;

  const resetForm = () => {
    setEditId(null);
    setForm({ nama: "", merchant: "", qris: "" });
    setFormPreview(null);
    setShowTextPaste(false);
    setPasteText("");
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (profile) => {
    setEditId(profile.id);
    setForm({
      nama: profile.nama,
      merchant: profile.merchant_name || "",
      qris: profile.qris_statis,
    });
    setFormPreview(null);
    setShowTextPaste(false);
    setPasteText("");
    setShowForm(true);
  };

  /** Parse merchant name dari string QRIS via backend. */
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

  /** Upload gambar QRIS → decode → isi form.qris. */
  const chooseImage = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Gambar", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
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

  /** Terima string QRIS yang ditempel manual. */
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

  /** Simpan profil baru/edit via save_qris_profile. */
  const save = async (event) => {
    event.preventDefault();
    const nama = form.nama.trim();
    const qris = form.qris.trim();
    if (!nama) return addToast("Nama profil wajib diisi", "error");
    if (!qris) return addToast("QRIS statis wajib diisi", "error");
    setSaving(true);
    try {
      await invoke("save_qris_profile", {
        id: editId,
        input: {
          nama,
          merchant_name: form.merchant.trim() || null,
          qris_statis: qris,
        },
      });
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
    } catch (err) {
      addToast(`Gagal: ${err}`, "error");
    }
  };

  const setActive = async (id) => {
    try {
      await invoke("set_active_qris_profile", { id });
      addToast("Profil aktif diubah", "success");
      loadProfiles();
    } catch (err) {
      addToast(`Gagal: ${err}`, "error");
    }
  };

  const columns = [
    {
      key: "profil",
      label: "Profil",
      render: (p) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="material-symbols-outlined"
            style={{ color: p.is_active ? "var(--color-primary)" : "var(--color-text-secondary)" }}
          >
            qr_code_2
          </span>
          <div>
            <b>{p.nama}</b>
            <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
              {p.merchant_name || "Merchant belum diisi"}
            </div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-secondary)" }}>
              {(p.qris_statis || "").slice(0, 28)}…
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (p) => (
        p.is_active
          ? <StatusBadge label="Aktif" tone="success" />
          : <StatusBadge label="Nonaktif" tone="neutral" />
      ),
    },
    {
      key: "aksi",
      label: "",
      align: "right",
      render: (p) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          {!p.is_active && (
            <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px", minHeight: 0 }} onClick={() => setActive(p.id)}>
              Jadikan aktif
            </button>
          )}
          <button type="button" className="btn-icon" onClick={() => openEdit(p)} title="Edit" aria-label={`Edit ${p.nama}`}>
            <span className="material-symbols-outlined">edit</span>
          </button>
          <button type="button" className="btn-icon" onClick={() => deleteProfile(p.id)} title="Hapus" aria-label={`Hapus ${p.nama}`}>
            <span className="material-symbols-outlined" style={{ color: "#B91C1C" }}>delete</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="PENGATURAN"
      title="Profil QRIS Pembayaran"
      description="Kelola profil QRIS statis. Profil aktif dipakai otomatis saat pembayaran QRIS di kasir."
      actions={
        <button type="button" className="btn-primary" onClick={openNew}>
          <span className="material-symbols-outlined">add</span> Profil Baru
        </button>
      }
      stats={[
        { label: "Total profil", value: profiles.length, icon: "qr_code_2" },
        { label: "Aktif", value: activeCount, icon: "check_circle", tone: "#047857" },
      ]}
    >
      <InfoNote icon="touch_app">
        Klik &quot;Jadikan aktif&quot; untuk memilih QRIS yang dipakai kasir. Upload gambar QRIS atau tempel string EMV.
      </InfoNote>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari nama / merchant..."
        onRefresh={loadProfiles}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon="qr_code_2"
        emptyTitle="Belum ada profil QRIS"
        emptyHint="Tambahkan QRIS statis untuk mulai menerima pembayaran."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} />
      </DataPanel>

      {!loading && profiles.length === 0 && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button type="button" className="btn-primary" onClick={openNew}>Tambah Profil Pertama</button>
        </div>
      )}

      {showForm && (
        <FormModal
          title={editId ? "Edit Profil QRIS" : "Tambah Profil QRIS"}
          description="Simpan QRIS statis untuk digunakan di kasir. Merchant bisa terisi otomatis dari parse QRIS."
          onClose={() => setShowForm(false)}
          onSubmit={save}
          submitLabel={editId ? "Simpan Perubahan" : "Simpan Profil"}
          submitting={saving || decoding}
        >
          <label className="input-label">Nama Profil *</label>
          <input
            className="input-field"
            value={form.nama}
            onChange={(e) => setForm((p) => ({ ...p, nama: e.target.value }))}
            placeholder="Contoh: QRIS Toko Utama"
            autoFocus
          />
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginBottom: 12 }}>
            Nama internal untuk membedakan profil
          </p>

          <label className="input-label">Nama Merchant</label>
          <input
            className="input-field"
            value={form.merchant}
            onChange={(e) => setForm((p) => ({ ...p, merchant: e.target.value }))}
            placeholder="Otomatis terisi dari QRIS"
          />

          <label className="input-label" style={{ marginTop: 12 }}>QRIS Statis *</label>
          {form.qris && (
            <div style={{ margin: "6px 0" }}>
              <StatusBadge label="QRIS siap disimpan" tone="success" />
            </div>
          )}
          <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: 6 }} onClick={chooseImage} disabled={decoding}>
            <span className="material-symbols-outlined">add_photo_alternate</span>
            {decoding ? "Membaca QR…" : "Upload Gambar QRIS"}
          </button>
          <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: 6 }} onClick={() => setShowTextPaste((v) => !v)}>
            <span className="material-symbols-outlined">content_paste</span>
            {showTextPaste ? "Tutup Paste Teks" : "Paste String QRIS"}
          </button>
          {showTextPaste && (
            <div style={{ marginTop: 8 }}>
              <textarea
                className="input-field"
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Tempel string QRIS (0002010102...)"
                style={{ fontFamily: "monospace", fontSize: 11 }}
              />
              <button type="button" className="btn-primary" style={{ width: "100%", marginTop: 6 }} onClick={usePastedText}>
                Gunakan String Ini
              </button>
            </div>
          )}
          {formPreview && (
            <img
              src={formPreview}
              alt="Preview QRIS"
              style={{ display: "block", width: 96, height: 96, objectFit: "contain", margin: "10px auto 0", borderRadius: 8 }}
            />
          )}
        </FormModal>
      )}
    </PageShell>
  );
}
