import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

export default function PointPelanggan() {
  const { addToast } = useToast();
  const [setting, setSetting] = useState(null);
  const [form, setForm] = useState({ rupiahPerPoint: 1000, masaBerlakuHari: 365, minTukarPoint: 100 });

  useEffect(() => {
    invoke("get_point_setting").then((data) => {
      setSetting(data);
      setForm({ rupiahPerPoint: data.rupiah_per_point || 1000, masaBerlakuHari: data.masa_berlaku_hari || 365, minTukarPoint: data.min_tukar_point || 100 });
    }).catch((e) => addToast(String(e), "error"));
  }, []);

  const save = async () => {
    try {
      await invoke("update_point_setting", { rupiahPerPoint: Number(form.rupiahPerPoint), masaBerlakuHari: Number(form.masaBerlakuHari), minTukarPoint: Number(form.minTukarPoint) });
      addToast("Setting point disimpan", "success");
      const updated = await invoke("get_point_setting");
      setSetting(updated);
    } catch (e) { addToast(String(e), "error"); }
  };

  const contohBelanja = 100000;
  const pointDapat = form.rupiahPerPoint > 0 ? Math.floor(contohBelanja / form.rupiahPerPoint) : 0;

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">MASTER DATA</p>
          <h1 className="text-headline-lg">Point Pelanggan</h1>
          <p className="text-body-md sales-page__subtitle">Program loyalitas: pelanggan kumpulkan point dari setiap transaksi, lalu tukar dengan diskon atau hadiah.</p>
        </div>
        <button className="btn-primary sales-page__add" onClick={save}><span className="material-symbols-outlined">save</span>Simpan Setting</button>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)" }}>stars</span><div><span>Belanja Rp 100.000</span><strong>{pointDapat} Point</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-income-green)" }}>event_available</span><div><span>Masa Berlaku</span><strong>{form.masaBerlakuHari} Hari</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>redeem</span><div><span>Minimum Tukar</span><strong>{Number(form.minTukarPoint).toLocaleString("id-ID")} Point</strong></div></div>
      </section>

      <div className="sales-panel" style={{ padding: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)" }}>stars</span>
              <strong>Konversi Point</strong>
            </div>
            <label className="input-label">Rupiah per 1 Point</label>
            <input className="input-field" type="number" value={form.rupiahPerPoint} onChange={(e) => setForm({ ...form, rupiahPerPoint: e.target.value })} placeholder="1000" />
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Belanja {rupiah(form.rupiahPerPoint)} = 1 point</p>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ color: "var(--color-income-green)" }}>event_available</span>
              <strong>Masa Berlaku</strong>
            </div>
            <label className="input-label">Masa Berlaku Point (Hari)</label>
            <input className="input-field" type="number" value={form.masaBerlakuHari} onChange={(e) => setForm({ ...form, masaBerlakuHari: e.target.value })} placeholder="365" />
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Point kedaluwarsa setelah {form.masaBerlakuHari} hari dari tanggal perolehan</p>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>redeem</span>
              <strong>Minimum Penukaran</strong>
            </div>
            <label className="input-label">Minimum Point untuk Ditukar</label>
            <input className="input-field" type="number" value={form.minTukarPoint} onChange={(e) => setForm({ ...form, minTukarPoint: e.target.value })} placeholder="100" />
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Pelanggan harus punya minimal {Number(form.minTukarPoint).toLocaleString("id-ID")} point sebelum bisa menukar</p>
          </div>
        </div>

        <div className="card" style={{ marginTop: "1.5rem", padding: "1rem", background: "var(--color-primary-fixed)", border: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-primary)" }}>calculate</span>
            <strong style={{ fontSize: 13 }}>Simulasi</strong>
          </div>
          <p className="text-body-sm">Pelanggan belanja <strong>{rupiah(contohBelanja)}</strong> → dapat <strong>{pointDapat} point</strong>. Butuh transaksi <strong>{form.minTukarPoint > 0 ? Math.ceil(Number(form.minTukarPoint) / Math.max(pointDapat, 1)) : "~"} kali</strong> untuk bisa menukar.</p>
        </div>
      </div>
    </div>
  );
}
