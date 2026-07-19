// ============================================================
// Log.jsx — Tampilkan dan ekspor log aplikasi (debugging)
// Log dibaca dari Rust logger, bisa disimpan via share/copy.
// NOTE: Android 10+ memblokir <a download="blob:..."> di WebView.
// Gunakan navigator.share() untuk share log via Android share sheet,
// atau copy ke clipboard sebagai fallback.
// ============================================================
import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function Log() {
  const { addToast } = useToast();
  const [logContent, setLogContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLog = async () => {
    setLoading(true);
    setError("");
    try {
      // read_log sendiri masuk audit IPC global; marker ini menjelaskan intent tombol.
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

  // Android WebView sering gagal menjalankan navigator.share().
  // Gunakan native save picker agar log tersimpan sebagai file .txt yang bisa dikirim dari File Manager.
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
        addToast(`Gagal menyimpan log: ${e}`, "error");
      }
    }
  };

  // Salin konten log ke clipboard langsung
  const handleCopyText = async () => {
    try {
      invoke("write_log", { msg: "LOG_UI: menyalin log ke clipboard" }).catch(() => {});
      await navigator.clipboard.writeText(logContent);
      invoke("write_log", { msg: "LOG_UI: log sukses disalin ke clipboard" }).catch(() => {});
      addToast("Log disalin ke clipboard", "success");
    } catch (e) {
      invoke("write_log", { msg: `LOG_UI: gagal salin log: ${String(e?.message || e).slice(0, 300)}` }).catch(() => {});
      addToast(`Gagal salin: ${e}`, "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <span className="text-headline-md">Log Aplikasi</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button className="btn-secondary" onClick={handleShareLog}
            style={{ padding: "8px 12px", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>share</span>
            Bagikan
          </button>
          <button className="btn-secondary" onClick={handleCopyText}
            style={{ padding: "8px 12px", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>content_copy</span>
            Salin
          </button>
          <button className="btn-secondary" onClick={loadLog}
            style={{ padding: "8px 12px", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ background: "var(--color-error-container)", color: "var(--color-on-error-container)" }}>
          <p style={{ fontSize: "13px" }}>{error}</p>
          <button className="btn-primary" onClick={loadLog} style={{ marginTop: "8px", padding: "6px 12px", fontSize: "13px" }}>
            Coba Lagi
          </button>
        </div>
      )}

      <div className="card" style={{ padding: "0.75rem", overflow: "auto" }}>
        {loading ? (
          <div className="loading-page"><div className="spinner" /><span>Memuat log…</span></div>
        ) : (
          <pre style={{
            fontSize: "10px", lineHeight: "1.4", whiteSpace: "pre-wrap",
            wordBreak: "break-all", fontFamily: "monospace",
            color: "var(--color-text-secondary)", margin: 0,
          }}>
            {logContent || "(Belum ada log)"}
          </pre>
        )}
      </div>
    </div>
  );
}
