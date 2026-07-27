import { useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, InfoNote } from "../components/PageKit";

/**
 * DatabaseMaintenance — integrity check, VACUUM, REINDEX (PageKit).
 */
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
    <PageShell
      eyebrow="SISTEM"
      title="Database Maintenance"
      description="Periksa integritas, rapikan ruang, dan bangun ulang indeks database."
      stats={[
        { label: "Integrity Check", value: "Aktif", icon: "health_and_safety" },
        { label: "VACUUM", value: "Optimasi", icon: "compress" },
        { label: "REINDEX", value: "Otomatis", icon: "reorder" },
      ]}
    >
      <InfoNote icon="build">
        Proses mencakup integrity check, VACUUM, dan REINDEX. Hindari menutup aplikasi selama proses berjalan.
      </InfoNote>

      <DataPanel loading={loading} isEmpty={false}>
        <div style={{ padding: "1.25rem" }}>
          <button type="button" className="btn-primary" onClick={runMaintenance} disabled={loading} style={{ minWidth: 200 }}>
            {loading ? (
              <><span className="spinner spinner--inline" /> Memproses...</>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontSize: 17, verticalAlign: "middle", marginRight: 6 }}>play_arrow</span>Jalankan Maintenance</>
            )}
          </button>
          {result && (
            <div style={{ marginTop: 16 }}>
              <p className="sales-page__eyebrow">HASIL OPERASI</p>
              <h2 className="text-headline-sm">Maintenance Selesai</h2>
              <pre className="advanced-result__pre" style={{ whiteSpace: "pre-wrap" }}>{result}</pre>
            </div>
          )}
        </div>
      </DataPanel>
    </PageShell>
  );
}
