import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const resetLabels = { none: "Tidak reset", monthly: "Setiap bulan", yearly: "Setiap tahun" };

/**
 * Halaman pengaturan nomor transaksi.
 * Menampilkan format, counter, reset period, serta preview nomor berikutnya.
 */
export default function NomorTransaksi() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [result, setResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await invoke("list_nomor_settings");
      setSettings(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateField = (id, field, value) => {
    setSettings((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const save = async (item) => {
    const digitRun = Number(item.digit_run);
    if (!item.prefix.trim()) return addToast("Prefix wajib diisi", "error");
    if (!digitRun || digitRun < 1 || digitRun > 12) return addToast("Digit nomor harus 1-12", "error");
    setSavingId(item.id);
    try {
      await invoke("update_nomor_setting", {
        req: { tipe: item.tipe, prefix: item.prefix.trim(), digit_run: digitRun, reset_period: item.reset_period },
      });
      addToast(`Format ${item.tipe} diperbarui`, "success");
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setSavingId(null);
    }
  };

  const generate = async (tipe) => {
    setGenerating(tipe);
    try {
      const nomor = await invoke("generate_nomor", { tipe });
      setResult({ tipe, nomor });
      addToast("Nomor berhasil di-generate", "success");
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setGenerating(null);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "var(--color-accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "22px", color: "#fff" }}>tag</span>
          </div>
          <div>
            <h1 className="text-headline-md">Nomor Transaksi</h1>
            <p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>Kelola format penomoran otomatis</p>
          </div>
        </div>
        <button className="btn-icon" onClick={load} title="Refresh" aria-label="Refresh"><span className="material-symbols-outlined">refresh</span></button>
      </header>

      <div style={{ background: "var(--color-primary-fixed)", borderRadius: "12px", padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "20px" }}>info</span>
        <p style={{ fontSize: "12px", color: "var(--color-primary-container)", lineHeight: "1.5" }}>
          Prefix dan jumlah digit menentukan format nomor. Reset bulanan/tahunan mengembalikan counter ke 1 pada periode baru.
        </p>
      </div>

      {result && (
        <section className="card" style={{ background: "linear-gradient(135deg, #7C3AED, #06B6D4)", color: "#fff", border: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>check_circle</span>
            <span style={{ fontSize: "12px", opacity: 0.9 }}>Nomor berikutnya untuk {result.tipe}</span>
          </div>
          <strong style={{ fontSize: "26px", letterSpacing: "0.04em" }}>{result.nomor}</strong>
        </section>
      )}

      {settings.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--color-text-secondary)", opacity: 0.4 }}>tag</span>
          <p style={{ color: "var(--color-text-secondary)", marginTop: "10px" }}>Belum ada pengaturan nomor</p>
        </div>
      ) : settings.map((item) => (
        <section className="card" key={item.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <div>
              <h2 className="text-headline-sm" style={{ textTransform: "capitalize" }}>{item.tipe.replace(/_/g, " ")}</h2>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>Counter saat ini: <b>{item.current_number}</b></p>
            </div>
            <span className="chip chip-blue">{resetLabels[item.reset_period] || item.reset_period}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "10px", marginBottom: "12px" }}>
            <label>
              <span className="input-label">Prefix *</span>
              <input className="input-field" value={item.prefix} onChange={(e) => updateField(item.id, "prefix", e.target.value)} placeholder="Contoh: INV" />
            </label>
            <label>
              <span className="input-label">Jumlah Digit *</span>
              <input className="input-field" type="number" min="1" max="12" value={item.digit_run} onChange={(e) => updateField(item.id, "digit_run", e.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginBottom: "14px" }}>
            <span className="input-label">Reset Counter</span>
            <select className="input-field" value={item.reset_period} onChange={(e) => updateField(item.id, "reset_period", e.target.value)}>
              <option value="none">Tidak reset</option>
              <option value="monthly">Setiap bulan</option>
              <option value="yearly">Setiap tahun</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-secondary" style={{ flex: 1, fontSize: "13px", padding: "8px 10px" }} onClick={() => generate(item.tipe)} disabled={generating === item.tipe}>
              {generating === item.tipe ? <span className="spinner" style={{ width: "15px", height: "15px" }} /> : <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>play_arrow</span>}
              Generate
            </button>
            <button className="btn-primary" style={{ flex: 1, fontSize: "13px", padding: "8px 10px" }} onClick={() => save(item)} disabled={savingId === item.id}>
              {savingId === item.id ? <span className="spinner" style={{ width: "15px", height: "15px" }} /> : <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>save</span>}
              Simpan
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
