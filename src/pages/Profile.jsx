import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, InfoNote } from "../components/PageKit";
import DropZoneImport from "../components/DropZoneImport";

/**
 * Profile — Data Perusahaan.
 * Termasuk upload logo yang ditampilkan di layar login.
 */
export default function Profile() {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    nama_toko: "",
    alamat: "",
    telepon: "",
    email: "",
    website: "",
    npwp: "",
    deskripsi: "",
    qris_statis: "",
    qris_foto_path: "",
    logo_path: "",
  });
  const [qrisPreview, setQrisPreview] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke("get_toko")
      .then((toko) => {
        setForm({
          nama_toko: toko?.nama_toko || "",
          alamat: toko?.alamat || "",
          telepon: toko?.telepon || "",
          email: toko?.email || "",
          website: toko?.website || "",
          npwp: toko?.npwp || "",
          deskripsi: toko?.deskripsi || "",
          qris_statis: toko?.qris_statis || "",
          qris_foto_path: toko?.qris_foto_path || "",
          logo_path: toko?.logo_path || "",
        });
      })
      .catch((error) => {
        const _m = String(error);
        if (!_m.includes("no such table") && !_m.includes("no such column")) addToast(_m, "error");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  const handleQrisFoto = (file) => {
    if (!file.type.startsWith("image/")) return addToast("File QRIS harus berupa gambar", "error");
    if (file.size > 2 * 1024 * 1024) return addToast("Ukuran gambar QRIS maksimal 2MB", "error");
    const reader = new FileReader();
    reader.onload = () => setQrisPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleLogo = (file) => {
    if (!file.type.startsWith("image/")) return addToast("Logo harus berupa gambar", "error");
    if (file.size > 2 * 1024 * 1024) return addToast("Ukuran logo maksimal 2MB", "error");
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const removeLogo = async () => {
    try {
      await invoke("clear_toko_logo");
      setForm((f) => ({ ...f, logo_path: "" }));
      setLogoPreview("");
      window.dispatchEvent(new Event("toko-saved"));
      addToast("Logo dihapus", "success");
    } catch (e) {
      addToast(`Gagal hapus logo: ${e}`, "error");
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.nama_toko.trim()) return addToast("Nama toko wajib diisi", "error");
    setSaving(true);
    try {
      let qrisFotoPath = form.qris_foto_path;
      if (qrisPreview) {
        qrisFotoPath = await invoke("save_toko_foto", { fotoBase64: qrisPreview.split(",")[1] });
      }
      let logoPath = form.logo_path;
      if (logoPreview) {
        logoPath = await invoke("save_toko_logo", { fotoBase64: logoPreview.split(",")[1] });
      }
      await invoke("save_toko", {
        input: Object.fromEntries(
          Object.entries({
            ...form,
            qris_foto_path: qrisFotoPath,
            logo_path: logoPath,
          }).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value || null]),
        ),
      });
      setForm((current) => ({
        ...current,
        qris_foto_path: qrisFotoPath || "",
        logo_path: logoPath || "",
      }));
      setQrisPreview("");
      setLogoPreview("");
      window.dispatchEvent(new Event("toko-saved"));
      addToast("Identitas toko disimpan", "success");
    } catch (error) {
      addToast(`Gagal menyimpan identitas toko: ${error}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const logoSrc = logoPreview || (form.logo_path ? convertFileSrc(form.logo_path) : "");

  return (
    <PageShell
      eyebrow="PENGATURAN TOKO"
      title="Data Perusahaan"
      description="Kelola identitas perusahaan dan informasi yang tampil pada struk serta layar login."
      loading={loading}
    >
      <InfoNote>Logo perusahaan tampil di layar login. Data lain tampil pada struk.</InfoNote>

      <DataPanel isEmpty={false}>
        <form onSubmit={save} style={{ padding: "1.25rem", display: "grid", gap: 14 }}>
          <div>
            <label className="input-label">Logo Perusahaan</label>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 8px" }}>
              PNG / JPG / WEBP — maks 2MB. Ditampilkan di login.
            </p>
            <div className="dropzone-wrap">
              <DropZoneImport
                title="Upload Logo"
                subtitle="PNG, JPG, WEBP — maks 2MB"
                icon="image"
                accept="image/*"
                onFile={handleLogo}
              />
            </div>
            {logoSrc ? (
              <div
                className="dropzone-preview"
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--color-surface-border)",
                  background: "var(--color-surface-container-low)",
                }}
              >
                <img
                  src={logoSrc}
                  alt="Logo perusahaan"
                  style={{
                    width: 88,
                    height: 88,
                    objectFit: "contain",
                    borderRadius: 12,
                    background: "#fff",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>Logo aktif</strong>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {logoPreview ? "Belum disimpan — tekan Simpan" : "Tersimpan di data toko"}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (logoPreview) setLogoPreview("");
                    else removeLogo();
                  }}
                >
                  Hapus
                </button>
              </div>
            ) : null}
          </div>

          <label className="input-label">
            Nama Toko / Perusahaan
            <input
              className="input-field"
              value={form.nama_toko}
              onChange={(e) => setForm({ ...form, nama_toko: e.target.value })}
              required
            />
          </label>
          <label className="input-label">
            Alamat
            <textarea
              className="input-field"
              rows={2}
              value={form.alamat}
              onChange={(e) => setForm({ ...form, alamat: e.target.value })}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="input-label">
              Telepon
              <input
                className="input-field"
                value={form.telepon}
                onChange={(e) => setForm({ ...form, telepon: e.target.value })}
              />
            </label>
            <label className="input-label">
              Email
              <input
                className="input-field"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="input-label">
              Website
              <input
                className="input-field"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </label>
            <label className="input-label">
              NPWP
              <input
                className="input-field"
                value={form.npwp}
                onChange={(e) => setForm({ ...form, npwp: e.target.value })}
              />
            </label>
          </div>
          <label className="input-label">
            Deskripsi
            <textarea
              className="input-field"
              rows={2}
              value={form.deskripsi}
              onChange={(e) => setForm({ ...form, deskripsi: e.target.value })}
            />
          </label>
          <label className="input-label">
            QRIS Statis
            <textarea
              className="input-field"
              rows={3}
              value={form.qris_statis}
              onChange={(e) => setForm({ ...form, qris_statis: e.target.value })}
              placeholder="Tempel payload QRIS statis (opsional)"
            />
          </label>
          <label className="input-label">Gambar QRIS</label>
          <div className="dropzone-wrap">
            <DropZoneImport
              title="Upload Gambar QRIS"
              subtitle="PNG, JPG, WEBP — maks 2MB"
              icon="qr_code_scanner"
              accept="image/*"
              onFile={handleQrisFoto}
            />
          </div>
          {(qrisPreview || form.qris_foto_path) && (
            <div className="dropzone-preview">
              <img
                src={qrisPreview || (form.qris_foto_path ? convertFileSrc(form.qris_foto_path) : "")}
                alt="QRIS toko"
              />
              {qrisPreview && (
                <button
                  type="button"
                  className="dropzone-preview__remove material-symbols-outlined"
                  onClick={() => setQrisPreview("")}
                >
                  close
                </button>
              )}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={saving}>
            <span className="material-symbols-outlined">save</span>
            {saving ? "Menyimpan..." : "Simpan Identitas Toko"}
          </button>
        </form>
      </DataPanel>
    </PageShell>
  );
}
