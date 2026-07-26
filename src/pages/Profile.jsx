import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function Profile() {
  const { addToast } = useToast();
  const [form, setForm] = useState({ nama_toko: "", alamat: "", telepon: "", email: "", website: "", npwp: "", deskripsi: "", qris_statis: "" });
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
        qris_statis: toko?.qris_statis || ""
      }))
      .catch((error) => addToast(String(error), "error"))
      .finally(() => setLoading(false));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    if (!form.nama_toko.trim()) return addToast("Nama toko wajib diisi", "error");
    setSaving(true);
    try {
      await invoke("save_toko", { input: {
        nama_toko: form.nama_toko.trim(),
        alamat: form.alamat.trim() || null,
        telepon: form.telepon.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        npwp: form.npwp.trim() || null,
        deskripsi: form.deskripsi.trim() || null,
        qris_statis: form.qris_statis.trim() || null,
      } });
      window.dispatchEvent(new Event("toko-saved"));
      addToast("Identitas toko disimpan", "success");
    } catch (error) {
      addToast(`Gagal menyimpan identitas toko: ${error}`, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;

  return (
    <div className="store-profile-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">PENGATURAN TOKO</p>
          <h1 className="text-headline-lg">Identitas Toko</h1>
          <p className="text-body-md sales-page__subtitle">Informasi ini tampil pada header aplikasi dan struk pelanggan.</p>
        </div>
      </header>
      <section className="store-profile-card">
        <div className="store-profile-card__icon"><span className="material-symbols-outlined">storefront</span></div>
        <div><h2 className="text-headline-md">Profil bisnis</h2><p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Isi nama toko dan QRIS statis untuk melengkapi identitas pembayaran.</p></div>
        <form onSubmit={save} className="store-profile-form">
          <label className="input-label">Nama Toko *<input className="input-field" value={form.nama_toko} onChange={(e) => setForm({ ...form, nama_toko: e.target.value })} placeholder="Contoh: Toko Maju Jaya" /></label>
          <label className="input-label">Alamat<input className="input-field" value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} placeholder="Jl. Contoh No. 1, Kota" /></label>
          <label className="input-label">Telepon<input className="input-field" inputMode="tel" value={form.telepon} onChange={(e) => setForm({ ...form, telepon: e.target.value })} placeholder="0812xxxxxxxx" /></label>
          <label className="input-label">Email<input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="toko@email.com" /></label>
          <label className="input-label">Website<input className="input-field" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://toko.com" /></label>
          <label className="input-label">NPWP<input className="input-field" value={form.npwp} onChange={(e) => setForm({ ...form, npwp: e.target.value })} placeholder="xx.xxx.xxx.x-xxx.xxx" /></label>
          <label className="input-label">Deskripsi Usaha<textarea className="input-field" rows={3} value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} placeholder="Deskripsi singkat usaha Anda" /></label>
          <label className="input-label">QRIS Statis<textarea className="input-field" rows={3} value={form.qris_statis} onChange={(e) => setForm({ ...form, qris_statis: e.target.value })} placeholder="Tempel payload QRIS statis (opsional)" /></label>
          <div className="store-profile-help"><span className="material-symbols-outlined">info</span><span>Data ini tampil pada struk dan digunakan untuk identifikasi toko di sistem.</span></div>
          <button className="btn-primary" disabled={saving}><span className="material-symbols-outlined">save</span>{saving ? "Menyimpan..." : "Simpan Identitas Toko"}</button>
        </form>
      </section>
    </div>
  );
}
