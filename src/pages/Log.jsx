// ============================================================
// Log.jsx — Tampilkan dan ekspor log aplikasi (debugging)
// Log dibaca dari Rust logger, bisa disimpan via share/copy.
// NOTE: Android 10+ memblokir <a download="blob:..."> di WebView.
// Gunakan navigator.share() untuk share log via Android share sheet,
// atau copy ke clipboard sebagai fallback.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";

export default function Log() {
  const { addToast } = useToast();
  const [logContent, setLogContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** Auto-refresh interval ID, null = off */
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef(null);
  const preRef = useRef(null);

  const loadLog = async () => {
    setLoading(true);
    setError("");
    try {
      invoke("write_log", { msg: "LOG_UI: muat/refresh log dimulai" }).catch(() => {});
      const content = await invoke("read_log");
      setLogContent(content || "(Log kosong)");
      invoke("write_log", { msg: `LOG_UI: muat/refresh log sukses; chars=${content?.length || 0}` }).catch(() => {});
    } catch (e) {
      invoke("write_log", { msg: `LOG_UI: muat/refresh log gagal: ${String(e?.message || e).slice(0, 300)}` }).catch(() => {});
      setError(String(e));
      setLogContent("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLog(); }, []);

  /** Auto-scroll ke bawah saat konten berubah */
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [logContent]);

  /** Toggle auto-refresh setiap 5 detik */
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(loadLog, 5000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh]);

  /** Simpan log ke file via native save picker */
  const handleShareLog = async () => {
    try {
      invoke("write_log", { msg: "LOG_UI: simpan log via native save picker" }).catch(() => {});
      const content = await invoke("read_log");
      if (!content) return addToast("Log kosong", "error");

      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: `mikrokas_log_${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (!path) {
        invoke("write_log", { msg: "LOG_UI: simpan log dibatalkan user" }).catch(() => {});
        return;
      }
      await writeTextFile(path, content);
      invoke("write_log", { msg: "LOG_UI: log sukses disimpan via save picker" }).catch(() => {});
      addToast("Log tersimpan. Kirim dari File Manager.", "success");
    } catch (e) {
      try {
        await navigator.clipboard.writeText(logContent);
        invoke("write_log", { msg: `LOG_UI: save picker gagal, fallback clipboard: ${String(e?.message || e).slice(0, 300)}` }).catch(() => {});
        addToast("Gagal simpan; log disalin ke clipboard", "success");
      } catch (clipError) {
        invoke("write_log", { msg: `LOG_UI: gagal simpan dan clipboard: ${String(clipError?.message || clipError).slice(0, 300)}` }).catch(() => {});
        { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(`Gagal menyimpan log: ${_m}`,"error"); };
      }
    }
  };

  /** Salin konten log ke clipboard langsung */
  const handleCopyText = async () => {
    try {
      invoke("write_log", { msg: "LOG_UI: menyalin log ke clipboard" }).catch(() => {});
      await navigator.clipboard.writeText(logContent);
      invoke("write_log", { msg: "LOG_UI: log sukses disalin ke clipboard" }).catch(() => {});
      addToast("Log disalin ke clipboard", "success");
    } catch (e) {
      invoke("write_log", { msg: `LOG_UI: gagal salin log: ${String(e?.message || e).slice(0, 300)}` }).catch(() => {});
      { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(`Gagal salin: ${_m}`,"error"); };
    }
  };

  /** Hitung statistik log */
  const lineCount = logContent ? logContent.split("\n").filter(Boolean).length : 0;
  const sizeKb = logContent ? (new Blob([logContent]).size / 1024).toFixed(1) : "0";

  return (
    <PageShell
      eyebrow="SISTEM"
      title="Log Aplikasi"
      description="Diagnostik dan jejak aktivitas aplikasi untuk debugging."
      stats={[
        { label: "Jumlah Baris", value: lineCount, icon: "format_list_numbered" },
        { label: "Ukuran", value: (<>{sizeKb} KB</>), icon: "data_usage" },
      ]}
    >
      {/* Stats */}
      {/* Toolbar */}
      <section className="sales-panel" style={{ padding: "0.875rem 1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <button className="btn-secondary" onClick={loadLog} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "7px 12px", fontSize: "13px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
            Refresh
          </button>
          <button className="btn-secondary" onClick={handleCopyText} disabled={!logContent || loading}
            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "7px 12px", fontSize: "13px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>content_copy</span>
            Salin
          </button>
          <button className="btn-secondary" onClick={handleShareLog} disabled={!logContent || loading}
            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "7px 12px", fontSize: "13px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>download</span>
            Simpan
          </button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Auto Refresh</span>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              style={{
                width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer",
                background: autoRefresh ? "var(--color-income-green)" : "var(--color-surface-dim)",
                position: "relative", transition: "background 0.2s",
              }}
              aria-label={autoRefresh ? "Nonaktifkan auto refresh" : "Aktifkan auto refresh"}
              aria-pressed={autoRefresh}
            >
              <span style={{
                position: "absolute", top: "3px", left: autoRefresh ? "22px" : "3px",
                width: "18px", height: "18px", borderRadius: "50%", background: "white",
                transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </button>
          </div>
        </div>
      </section>

      {/* Error banner */}
      {error && (
        <section className="sales-panel" style={{ padding: "1rem", background: "var(--color-error-container)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-error)", fontSize: "20px", flexShrink: 0 }}>error</span>
            <div>
              <p style={{ fontSize: "13px", color: "var(--color-error)", fontWeight: 600, marginBottom: "6px" }}>Gagal memuat log</p>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{error}</p>
              <button className="btn-primary" onClick={loadLog} style={{ marginTop: "8px", padding: "6px 12px", fontSize: "13px" }}>Coba Lagi</button>
            </div>
          </div>
        </section>
      )}

      {/* Log viewer */}
      <section className="sales-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid var(--color-surface-border)",
          display: "flex", alignItems: "center", gap: "6px",
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--color-text-secondary)" }}>terminal</span>
          <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Isi Log</span>
          {autoRefresh && <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--color-income-green)", display: "flex", alignItems: "center", gap: "3px" }}><span className="material-symbols-outlined" style={{ fontSize: "12px" }}>fiber_manual_record</span>LIVE</span>}
        </div>
        <div ref={preRef} style={{ maxHeight: "55dvh", overflow: "auto", padding: "0.75rem" }}>
          {loading ? (
            <div className="loading-page" style={{ minHeight: "120px" }}><div className="spinner" /><span>Memuat log…</span></div>
          ) : (
            <pre style={{
              fontSize: "10px", lineHeight: "1.5", whiteSpace: "pre-wrap",
              wordBreak: "break-all", fontFamily: "monospace",
              color: "var(--color-text-secondary)", margin: 0,
            }}>
              {logContent || "(Belum ada log)"}
            </pre>
          )}
        </div>
      </section>
    </PageShell>
  );
}
