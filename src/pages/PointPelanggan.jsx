import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, InfoNote, rupiah } from "../components/PageKit";

/**
 * PointPelanggan — setting program loyalitas point (PageKit).
 */
export default function PointPelanggan() {
  const { addToast } = useToast();
  const [setting, setSetting] = useState(null);
  const [form, setForm] = useState({ rupiahPerPoint: 1000, masaBerlakuHari: 365, minTukarPoint: 100 });

  useEffect(() => {
    invoke("get_point_setting").then((data) => {
      setSetting(data);
      setForm({
        rupiahPerPoint: data.rupiah_per_point || 1000,
        masaBerlakuHari: data.masa_berlaku_hari || 365,
        minTukarPoint: data.min_tukar_point || 100,
      });
    }).catch((e) => addToast(String(e), "error"));
  }, []);

  const save = async () => {
    try {
      await invoke("update_point_setting", {
        rupiahPerPoint: Number(form.rupiahPerPoint),
        masaBerlakuHari: Number(form.masaBerlakuHari),
        minTukarPoint: Number(form.minTukarPoint),
      });
      addToast("Setting point disimpan", "success");
      const updated = await invoke("get_point_setting");
      setSetting(updated);
    } catch (e) { addToast(String(e), "error"); }
  };

  const contohBelanja = 100000;
  const pointDapat = form.rupiahPerPoint > 0 ? Math.floor(contohBelanja / form.rupiahPerPoint) : 0;

  return (
    <PageShell
      eyebrow="MASTER DATA"
      title="Point Pelanggan"
      description="Program loyalitas: pelanggan kumpulkan point dari setiap transaksi, lalu tukar dengan diskon atau hadiah."
      actions={
        <button type="button" className="btn-primary" onClick={save}>
          <span className="material-symbols-outlined">save</span>Simpan Setting
        </button>
      }
      stats={[
        { label: "Belanja Rp 100.000", value: `${pointDapat} Point`, icon: "stars", tone: "var(--color-warning-amber)" },
        { label: "Masa Berlaku", value: `${form.masaBerlakuHari} Hari`, icon: "event_available", tone: "var(--color-income-green)" },
        { label: "Minimum Tukar", value: form.minTukarPoint, icon: "redeem", tone: "var(--color-primary)" },
      ]}
    >
      <InfoNote>
        Point dihitung otomatis di kasir berdasarkan setting di bawah. Simpan setelah mengubah nilai.
      </InfoNote>

      <DataPanel isEmpty={false}>
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label className="input-label">Rupiah per 1 Point</label>
            <input
              className="input-field"
              type="number"
              min="1"
              value={form.rupiahPerPoint}
              onChange={(e) => setForm((p) => ({ ...p, rupiahPerPoint: e.target.value }))}
            />
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>
              Setiap belanja {rupiah(form.rupiahPerPoint)} = 1 point
            </p>
          </div>
          <div>
            <label className="input-label">Masa Berlaku Point (hari)</label>
            <input
              className="input-field"
              type="number"
              min="1"
              value={form.masaBerlakuHari}
              onChange={(e) => setForm((p) => ({ ...p, masaBerlakuHari: e.target.value }))}
            />
          </div>
          <div>
            <label className="input-label">Minimum Point untuk Tukar</label>
            <input
              className="input-field"
              type="number"
              min="1"
              value={form.minTukarPoint}
              onChange={(e) => setForm((p) => ({ ...p, minTukarPoint: e.target.value }))}
            />
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>
              Pelanggan harus punya minimal {Number(form.minTukarPoint).toLocaleString("id-ID")} point sebelum bisa menukar
            </p>
          </div>
          <div className="card" style={{ padding: "1rem", background: "var(--color-primary-fixed)", border: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-primary)" }}>calculate</span>
              <strong style={{ fontSize: 13 }}>Simulasi</strong>
            </div>
            <p className="text-body-sm">
              Pelanggan belanja <strong>{rupiah(contohBelanja)}</strong> → dapat <strong>{pointDapat} point</strong>.
              Butuh transaksi <strong>{form.minTukarPoint > 0 ? Math.ceil(Number(form.minTukarPoint) / Math.max(pointDapat, 1)) : "~"} kali</strong> untuk bisa menukar.
              {setting ? ` (tersimpan: ${setting.rupiah_per_point || "-"} /pt)` : ""}
            </p>
          </div>
        </div>
      </DataPanel>
    </PageShell>
  );
}
