import { useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function DatabaseMaintenance() {
  const { addToast } = useToast();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runMaintenance = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await invoke("maintenance_database");
      setResult(data);
      addToast("Maintenance selesai", "success");
    } catch (e) {
      setResult(`Maintenance gagal: ${String(e)}`);
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">SISTEM</p>
          <h1 className="text-headline-lg">Database Maintenance</h1>
          <p className="text-body-md sales-page__subtitle">Periksa integritas, rapikan ruang, dan bangun ulang indeks database.</p>
        </div>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined">health_and_safety</span><div><span>Integrity Check</span><strong>Aktif</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">compress</span><div><span>VACUUM</span><strong>Optimasi</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">reorder</span><div><span>REINDEX</span><strong>Otomatis</strong></div></div>
      </section>

      <section className="sales-panel" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "28px", color: "var(--color-primary)" }}>build</span>
          <div>
            <p className="sales-page__eyebrow">TOOLS DATABASE</p>
            <h2 className="text-headline-sm">Jalankan Maintenance</h2>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>Proses mencakup integrity check, VACUUM, dan REINDEX. Hindari menutup aplikasi selama proses berjalan.</p>
          </div>
        </div>
        <button className="btn-primary" onClick={runMaintenance} disabled={loading} style={{ minWidth: "200px" }}>
          {loading ? <><span className="spinner spinner--inline" /> Memproses...</> : <><span className="material-symbols-outlined" style={{ fontSize: "17px", verticalAlign: "middle", marginRight: "6px" }}>play_arrow</span>Jalankan Maintenance</>}
        </button>
      </section>

      {loading && <section className="sales-panel loading-page" style={{ minHeight: "130px" }}><div className="spinner" /><span>Memeriksa dan mengoptimalkan database…</span></section>}

      {result && (
        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-income-green)" }}>task_alt</span>
            <div><p className="sales-page__eyebrow">HASIL OPERASI</p><h2 className="text-headline-sm">Maintenance Selesai</h2></div>
          </div>
          <pre className="advanced-result__pre" style={{ whiteSpace: "pre-wrap" }}>{result}</pre>
        </section>
      )}
    </div>
  );
}
