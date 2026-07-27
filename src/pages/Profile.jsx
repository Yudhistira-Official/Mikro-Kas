import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, InfoNote } from "../components/PageKit";
import DropZoneImport from "../components/DropZoneImport";

export default function Profile() {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    nama_toko: "", alamat: "", telepon: "", email: "", website: "", npwp: "", deskripsi: "", qris_statis: "", qris_foto_path: "",
  });
  const [qrisPreview, setQrisPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke("get_toko")
      .then((toko) => setForm({
        nama_toko: toko?.nama_toko || "",
        alamat: toko?.alamat || "",
        telepon: toko?.telepon || "",
        email: toko?.email || "",
        website: toko?.website || "",
        npwp: toko?.npwp || "",
        deskripsi: toko?.deskripsi || "",
        qris_statis: toko?.qris_statis || "",
        qris_foto_path: toko?.qris_foto_path || "",
      }))
      .catch((error) => addToast(String(error), "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  const handleQrisFoto = (file) => {
    if (!file.type.startsWith("image/")) return addToast("File QRIS harus berupa gambar", "error");
    if (file.size > 2 * 1024 * 1024) return addToast("Ukuran gambar QRIS maksimal 2MB", "error");
    const reader = new FileReader();
    reader.onload = () => setQrisPreview(String(reader.result));
    reader.readAsDataURL(file);
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
      await invoke("save_toko", {
        input: Object.fromEntries(Object.entries({ ...form, qris_foto_path: qrisFotoPath }).map(([key, value]) => [key, value.trim() || null])),
      });
      setForm((current) => ({ ...current, qris_foto_path: qrisFotoPath }));
      setQrisPreview("");
      window.dispatchEvent(new Event("toko-saved"));
      addToast("Identitas toko disimpan", "success");
    } catch (error) {
      addToast(`Gagal menyimpan identitas toko: ${error}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell eyebrow="PENGATURAN TOKO" title="Data Perusahaan" description="Kelola identitas perusahaan dan informasi yang tampil pada struk." loading={loading}>
      <InfoNote>Data ini tampil pada struk dan digunakan untuk identifikasi toko di sistem.</InfoNote>
      <DataPanel loading={loading} isEmpty={false}>
        <form onSubmit={save} style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="input-label">Nama Toko *<input className="input-field" value={form.nama_toko} onChange={(e) => setForm({ ...form, nama_toko: e.target.value })} placeholder="Nama toko Anda" required /></label>
          <label className="input-label">Alamat<textarea className="input-field" rows={2} value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} placeholder="Alamat lengkap" /></label>
          <label className="input-label">Telepon<input className="input-field" value={form.telepon} onChange={(e) => setForm({ ...form, telepon: e.target.value })} placeholder="08xx..." /></label>
          <label className="input-label">Email<input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@toko.com" /></label>
          <label className="input-label">Website<input className="input-field" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></label>
          <label className="input-label">NPWP<input className="input-field" value={form.npwp} onChange={(e) => setForm({ ...form, npwp: e.target.value })} placeholder="xx.xxx.xxx.x-xxx.xxx" /></label>
          <label className="input-label">Deskripsi Usaha<textarea className="input-field" rows={3} value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} placeholder="Deskripsi singkat usaha Anda" /></label>
          <label className="input-label">QRIS Statis<textarea className="input-field" rows={3} value={form.qris_statis} onChange={(e) => setForm({ ...form, qris_statis: e.target.value })} placeholder="Tempel payload QRIS statis (opsional)" /></label>
          <label className="input-label">Gambar QRIS</label>
          <div className="dropzone-wrap">
            <DropZoneImport title="Upload Gambar QRIS" subtitle="PNG, JPG, WEBP — maks 2MB" icon="qr_code_scanner" accept="image/*" onFile={handleQrisFoto} />
          </div>
          {(qrisPreview || form.qris_foto_path) &&
            <div className="dropzone-preview">
              <img src={qrisPreview || form.qris_foto_path} alt="QRIS toko" />
              {qrisPreview && <button type="button" className="dropzone-preview__remove material-symbols-outlined" onClick={() => setQrisPreview("")}>close</button>}
            </div>}
          <button type="submit" className="btn-primary" disabled={saving}><span className="material-symbols-outlined">save</span>{saving ? "Menyimpan..." : "Simpan Identitas Toko"}</button>
        </form>
      </DataPanel>
    </PageShell>
  );
}
