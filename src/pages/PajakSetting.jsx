// ============================================================
// PajakSetting.jsx — Konfigurasi mode & tarif PPN (PageKit).
//
// Commands: get_pajak_setting, update_pajak_setting
// ============================================================
import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import {
  PageShell, DataPanel, InfoNote, StatusBadge, rupiah,
} from "../components/PageKit";

const MODES = [
  { val: "non", label: "Non-PPN", desc: "Tidak ada pajak. Semua harga bebas PPN.", icon: "block" },
  { val: "exclude", label: "Exclude (ditambahkan)", desc: "PPN dihitung di atas harga. Total = Harga + PPN.", icon: "add_circle" },
  { val: "include", label: "Include (sudah termasuk)", desc: "PPN sudah termasuk harga jual. Diextract di laporan.", icon: "calculate" },
];

/**
 * Preview perhitungan PPN untuk harga contoh 100.000.
 *
 * @param {{ mode: string, persen: number }} props
 */
function PpnPreview({ mode, persen }) {
  const base = 100000;
  const rate = Number(persen) / 100;
  let ppn = 0;
  let total = base;
  if (mode === "exclude") {
    ppn = base * rate;
    total = base + ppn;
  }
  if (mode === "include") {
    ppn = base - base / (1 + rate);
    total = base;
  }
  const descriptions = {
    non: "PPN tidak dikenakan. Harga jual = harga pokok.",
    exclude: "PPN ditambahkan di atas harga. Pelanggan bayar harga + PPN.",
    include: "PPN sudah termasuk dalam harga. Diextract saat pembayaran.",
  };

  return (
    <div className="card" style={{ background: "var(--color-surface-container-low)", marginTop: 12 }}>
      <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginBottom: 8 }}>
        {descriptions[mode]}
      </p>
      {mode !== "non" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Harga barang</span>
            <span>{rupiah(base)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>PPN {persen}%</span>
            <span style={{ color: "#92400E" }}>+{rupiah(Math.round(ppn))}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--color-surface-border)" }}>
            <b>Total dibayar</b>
            <b style={{ color: "var(--color-primary)" }}>{rupiah(Math.round(total))}</b>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Halaman konfigurasi PPN: mode non/exclude/include + tarif.
 * Backend: update_pajak_setting({ ppnMode, ppnPersen }).
 */
export default function PajakSetting() {
  const { addToast } = useToast();
  const [setting, setSetting] = useState(null);
  const [form, setForm] = useState({ ppnMode: "exclude", ppnPersen: 11 });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const load = () => {
    setLoading(true);
    invoke("get_pajak_setting")
      .then((data) => {
        setSetting(data);
        setForm({ ppnMode: data.ppn_mode || "exclude", ppnPersen: data.ppn_persen ?? 11 });
        setDirty(false);
      })
      .catch((e) => { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const setField = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }));
    setDirty(true);
  };

  /** Simpan mode + tarif PPN. */
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
      { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); };
    } finally {
      setSaving(false);
    }
  };

  const modeLabel = form.ppnMode === "non"
    ? "Non-PPN"
    : form.ppnMode === "include"
      ? `Include ${form.ppnPersen}%`
      : `Exclude ${form.ppnPersen}%`;

  return (
    <PageShell
      eyebrow="PENGATURAN"
      title="Pajak (PPN)"
      description="Pilih mode PPN dan tarif. Berlaku di kasir, pembelian, dan laporan."
      actions={
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !dirty}>
          <span className="material-symbols-outlined">save</span>
          {saving ? "Menyimpan..." : "Simpan Setting"}
        </button>
      }
      stats={[
        {
          label: "Mode aktif",
          value: setting
            ? (setting.ppn_mode === "non" ? "Non-PPN" : `${setting.ppn_mode} ${setting.ppn_persen}%`)
            : "—",
          icon: "receipt_long",
          tone: setting?.ppn_mode === "non" ? undefined : "#047857",
        },
        {
          label: "Draft form",
          value: modeLabel,
          icon: "edit_note",
          tone: dirty ? "#92400E" : undefined,
        },
      ]}
    >
      <InfoNote>
        Non: tanpa pajak. Exclude: PPN ditambah di atas harga. Include: PPN sudah di dalam harga jual.
        Tarif standar Indonesia: 11%.
      </InfoNote>

      <DataPanel
        onRefresh={load}
        loading={loading}
        isEmpty={false}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {setting && (
            <StatusBadge
              label={setting.ppn_mode === "non" ? "PPN Tidak Aktif" : `Tersimpan: ${setting.ppn_mode} ${setting.ppn_persen}%`}
              tone={setting.ppn_mode === "non" ? "neutral" : "success"}
            />
          )}
          {dirty && <StatusBadge label="Belum disimpan" tone="warning" />}
        </div>

        <label className="input-label">Mode PPN</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, marginBottom: 14 }}>
          {MODES.map(({ val, label, desc, icon }) => (
            <label
              key={val}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: 12,
                borderRadius: 10,
                cursor: "pointer",
                background: form.ppnMode === val ? "var(--color-primary-fixed)" : "var(--color-surface-container-low)",
                border: form.ppnMode === val
                  ? "1.5px solid var(--color-primary-fixed-dim, var(--color-primary))"
                  : "1.5px solid transparent",
              }}
            >
              <input
                type="radio"
                name="ppnMode"
                value={val}
                checked={form.ppnMode === val}
                onChange={() => setField("ppnMode", val)}
                style={{ marginTop: 2, accentColor: "var(--color-primary)" }}
              />
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  color: form.ppnMode === val ? "var(--color-primary)" : "var(--color-text-secondary)",
                  flexShrink: 0,
                }}
              >
                {icon}
              </span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{label}</p>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{desc}</p>
              </div>
            </label>
          ))}
        </div>

        {form.ppnMode !== "non" && (
          <div style={{ marginBottom: 8 }}>
            <label className="input-label">Tarif PPN (%)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <input
                className="input-field"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.ppnPersen}
                onChange={(e) => setField("ppnPersen", e.target.value)}
                style={{ flex: 1 }}
              />
              <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>%</span>
            </div>
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>
              Rentang valid: 0–100. Standar: 11.
            </p>
          </div>
        )}

        <PpnPreview mode={form.ppnMode} persen={form.ppnPersen} />

        <button
          type="button"
          className="btn-primary"
          style={{ width: "100%", marginTop: 16 }}
          onClick={save}
          disabled={saving || !dirty}
        >
          {saving ? "Menyimpan..." : "Simpan Setting"}
        </button>
      </DataPanel>
    </PageShell>
  );
}
