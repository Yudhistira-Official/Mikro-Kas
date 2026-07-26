import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

/**
 * Komponen info card: menampilkan contoh perhitungan PPN berdasarkan mode.
 * @param {{ mode: string, persen: number }} props
 */
const PpnPreview = ({ mode, persen }) => {
  const base = 100000;
  const rate = Number(persen) / 100;
  let ppn = 0, total = base;
  if (mode === "exclude") { ppn = base * rate; total = base + ppn; }
  if (mode === "include") { ppn = base - base / (1 + rate); total = base; }
  const fmt = (n) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const descriptions = {
    non: "PPN tidak dikenakan. Harga jual = harga pokok.",
    exclude: "PPN ditambahkan di atas harga. Pelanggan bayar harga + PPN.",
    include: "PPN sudah termasuk dalam harga. Diextract saat pembayaran.",
  };
  return (
    <div style={{ background: "var(--color-surface-container-low)", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px" }}>
      <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>{descriptions[mode]}</p>
      {mode !== "non" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Harga barang</span>
            <span style={{ fontSize: "12px" }}>{fmt(base)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>PPN {persen}%</span>
            <span style={{ fontSize: "12px", color: "var(--color-warning-amber)" }}>+{fmt(ppn)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "6px", borderTop: "1px solid var(--color-surface-border)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600 }}>Total dibayar</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-primary)" }}>{fmt(total)}</span>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Halaman konfigurasi PPN.
 * Load: get_pajak_setting. Simpan: update_pajak_setting.
 * Backend menerima ppn_mode (string) dan ppn_persen (f64) sebagai parameter terpisah.
 */
export default function PajakSetting() {
  const { addToast } = useToast();
  const [setting, setSetting] = useState(null);
  const [form, setForm] = useState({ ppnMode: "exclude", ppnPersen: 11 });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    invoke("get_pajak_setting")
      .then((data) => {
        setSetting(data);
        setForm({ ppnMode: data.ppn_mode || "exclude", ppnPersen: data.ppn_persen ?? 11 });
      })
      .catch((e) => addToast(String(e), "error"));
  }, []);

  const setField = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    setDirty(true);
  };

  const save = async () => {
    const persen = Number(form.ppnPersen);
    if (persen < 0 || persen > 100) return addToast("PPN harus 0–100%", "error");
    setSaving(true);
    try {
      await invoke("update_pajak_setting", { ppnMode: form.ppnMode, ppnPersen: persen });
      addToast("Setting pajak disimpan", "success");
      const updated = await invoke("get_pajak_setting");
      setSetting(updated);
      setDirty(false);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "var(--color-accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: "22px", color: "#fff" }}>receipt_long</span>
        </div>
        <div>
          <h1 className="text-headline-md">Pajak (PPN)</h1>
          <p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>Konfigurasi mode dan tarif PPN</p>
        </div>
      </div>

      {/* Status card — setting aktif */}
      {setting && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--color-surface-container-lowest)" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: setting.ppn_mode === "non" ? "var(--color-surface-container-high)" : "var(--color-primary-fixed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: "20px", color: setting.ppn_mode === "non" ? "var(--color-text-secondary)" : "var(--color-primary)" }}>
              {setting.ppn_mode === "non" ? "block" : "check_circle"}
            </span>
          </div>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600 }}>
              {setting.ppn_mode === "non" ? "PPN Tidak Aktif" : `PPN ${setting.ppn_mode === "include" ? "Include" : "Exclude"} ${setting.ppn_persen}%`}
            </p>
            <p style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Setting saat ini tersimpan</p>
          </div>
          {dirty && (
            <span style={{ marginLeft: "auto", fontSize: "10px", background: "var(--color-warning-amber)", color: "#fff", padding: "2px 8px", borderRadius: "999px", fontWeight: 600 }}>Belum Disimpan</span>
          )}
        </div>
      )}

      {/* Form */}
      <section className="card">
        <h2 className="text-headline-sm" style={{ marginBottom: "14px" }}>Konfigurasi PPN</h2>

        <div style={{ marginBottom: "14px" }}>
          <label className="input-label">Mode PPN</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
            {[
              { val: "non", label: "Non-PPN", desc: "Tidak ada pajak. Semua harga bebas PPN.", icon: "block" },
              { val: "exclude", label: "Exclude (ditambahkan)", desc: "PPN dihitung di atas harga pokok. Total = Harga + PPN.", icon: "add_circle" },
              { val: "include", label: "Include (sudah termasuk)", desc: "PPN sudah termasuk dalam harga jual. Diextract saat laporan.", icon: "calculate" },
            ].map(({ val, label, desc, icon }) => (
              <label key={val} style={{
                display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px",
                borderRadius: "10px", cursor: "pointer", transition: "background 0.15s",
                background: form.ppnMode === val ? "var(--color-primary-fixed)" : "var(--color-surface-container-low)",
                border: form.ppnMode === val ? "1.5px solid var(--color-primary-fixed-dim)" : "1.5px solid transparent",
              }}>
                <input type="radio" name="ppnMode" value={val} checked={form.ppnMode === val} onChange={() => setField("ppnMode", val)} style={{ marginTop: "2px", accentColor: "var(--color-primary)" }} />
                <span className="material-symbols-outlined" style={{ fontSize: "18px", color: form.ppnMode === val ? "var(--color-primary)" : "var(--color-text-secondary)", flexShrink: 0 }}>{icon}</span>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 600 }}>{label}</p>
                  <p style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {form.ppnMode !== "non" && (
          <div style={{ marginBottom: "14px" }}>
            <label className="input-label">Tarif PPN (%)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
              <input
                className="input-field"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.ppnPersen}
                onChange={(e) => setField("ppnPersen", e.target.value)}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-secondary)" }}>%</span>
            </div>
            <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              Tarif PPN Indonesia standar: 11%. Rentang valid: 0–100.
            </p>
          </div>
        )}

        {/* Preview perhitungan */}
        <PpnPreview mode={form.ppnMode} persen={form.ppnPersen} />

        <button className="btn-primary" style={{ width: "100%" }} onClick={save} disabled={saving}>
          {saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : (
            <><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>save</span> Simpan Setting</>
          )}
        </button>
      </section>
    </div>
  );
}
