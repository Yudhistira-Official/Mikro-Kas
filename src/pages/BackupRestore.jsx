// ============================================================
// BackupRestore.jsx — Backup & restore via native file picker + fs plugin.
//
// Android note:
//   - Dialog `save/open` bisa mengembalikan content URI, bukan path filesystem.
//   - Rust `std::fs::copy/read` tidak bisa memakai content URI.
//   - Solusi: Rust hanya ekspor/impor DB sebagai base64; frontend menulis/membaca
//     file pilihan user via @tauri-apps/plugin-fs yang memahami hasil picker.
//   - Tiap tahap dilog agar error Android terlihat di halaman Log Aplikasi.
// ============================================================
import { useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

// Log diagnostik tanpa melempar error ke UI.
const logBackup = (msg) => {
  try { invoke("write_log", { msg: `BACKUP_UI: ${msg}` }).catch(() => {}); } catch {}
};

// Info aman untuk log: hanya scheme dan panjang string, bukan path lengkap user.
const safeTargetInfo = (value) => {
  const text = typeof value === "string" ? value : String(value?.path || value || "");
  const scheme = text.includes(":") ? text.split(":")[0] : "path";
  return `${scheme}; len=${text.length}`;
};

// Konversi base64 database ke Uint8Array untuk ditulis via plugin-fs.
const base64ToBytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

// Konversi bytes hasil readFile menjadi base64 untuk dikirim ke Rust.
const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(binary);
};

export default function BackupRestore() {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  /** Status terakhir per aksi: null | { type: "backup"|"restore", ok: bool, msg: string } */
  const [lastStatus, setLastStatus] = useState(null);

  // ---------- Backup — user pilih lokasi, frontend tulis bytes ke lokasi itu ----------
  const backup = async () => {
    setBusy(true);
    setLastStatus(null);
    logBackup("backup mulai");
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      logBackup("plugin dialog+fs dimuat");

      const filePath = await save({
        defaultPath: `mikrokas_backup_${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!filePath) { logBackup("backup dibatalkan user"); setBusy(false); return; }
      logBackup(`save target dipilih; ${safeTargetInfo(filePath)}`);

      const dbBase64 = await invoke("export_database_base64");
      const bytes = base64ToBytes(dbBase64);
      logBackup(`database diekspor dari Rust; bytes=${bytes.length}`);

      await writeFile(filePath, bytes);
      logBackup(`writeFile sukses; bytes=${bytes.length}`);
      setLastStatus({ type: "backup", ok: true, msg: "Backup berhasil disimpan ke file pilihan." });
      addToast("Backup berhasil disimpan", "success");
    } catch (e) {
      logBackup(`backup gagal; ${String(e?.message || e).slice(0, 300)}`);
      setLastStatus({ type: "backup", ok: false, msg: `Backup gagal: ${String(e)}` });
      addToast(`Backup gagal: ${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  // ---------- Restore — user pilih file, frontend baca bytes lalu Rust import ----------
  const restore = async () => {
    if (!window.confirm("Restore akan menimpa seluruh database saat ini. Lanjutkan?")) return;
    setBusy(true);
    setLastStatus(null);
    logBackup("restore mulai");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      logBackup("plugin dialog+fs dimuat");

      const selection = await open({
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        multiple: false,
        directory: false,
      });
      if (!selection) { logBackup("restore dibatalkan user"); setBusy(false); return; }
      const filePath = typeof selection === "string" ? selection : selection.path;
      logBackup(`restore source dipilih; ${safeTargetInfo(filePath)}`);

      const bytes = await readFile(filePath);
      logBackup(`readFile sukses; bytes=${bytes.length}`);
      await invoke("restore_database_base64", { dbBase64: bytesToBase64(bytes) });
      logBackup("restore_database_base64 sukses");
      setLastStatus({ type: "restore", ok: true, msg: "Restore berhasil. Tutup dan buka ulang aplikasi untuk menerapkan perubahan." });
      addToast("Restore berhasil. Silakan tutup dan buka ulang aplikasi.", "success");
    } catch (e) {
      logBackup(`restore gagal; ${String(e?.message || e).slice(0, 300)}`);
      setLastStatus({ type: "restore", ok: false, msg: `Restore gagal: ${String(e)}` });
      addToast(`Restore gagal: ${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">MANAJEMEN DATA</p>
          <h1 className="text-headline-lg">Backup &amp; Restore</h1>
          <p className="text-body-md sales-page__subtitle">Simpan salinan database atau pulihkan dari file backup sebelumnya.</p>
        </div>
      </header>

      {/* Stats info cards */}
      <section className="sales-stats">
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">database</span>
          <div>
            <span>Format</span>
            <strong>SQLite .db</strong>
          </div>
        </div>
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">folder_open</span>
          <div>
            <span>Lokasi</span>
            <strong>Pilih via Dialog</strong>
          </div>
        </div>
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">verified_user</span>
          <div>
            <span>Metode</span>
            <strong>Base64 Transfer</strong>
          </div>
        </div>
      </section>

      {/* Status feedback */}
      {lastStatus && (
        <section className="sales-panel" style={{ padding: "1rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <span
              className="material-symbols-outlined"
              style={{ color: lastStatus.ok ? "var(--color-income-green)" : "var(--color-expense-red)", fontSize: "22px", flexShrink: 0, marginTop: "2px" }}
            >
              {lastStatus.ok ? "check_circle" : "error"}
            </span>
            <div>
              <p className="text-headline-sm" style={{ color: lastStatus.ok ? "var(--color-income-green)" : "var(--color-expense-red)", marginBottom: "4px" }}>
                {lastStatus.type === "backup" ? "Backup" : "Restore"} {lastStatus.ok ? "Sukses" : "Gagal"}
              </p>
              <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>{lastStatus.msg}</p>
            </div>
          </div>
        </section>
      )}

      {/* Action cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Backup card */}
        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "28px", color: "var(--color-primary)" }}>upload</span>
            <div>
              <p className="sales-page__eyebrow">LANGKAH 1</p>
              <h2 className="text-headline-sm">Backup Database</h2>
            </div>
          </div>
          <ol style={{ paddingLeft: "1.25rem", color: "var(--color-text-secondary)", fontSize: "13px", lineHeight: "1.7", marginBottom: "16px" }}>
            <li>Klik tombol di bawah — dialog simpan file akan terbuka.</li>
            <li>Pilih lokasi dan nama file (default sudah terisi tanggal hari ini).</li>
            <li>Tunggu notifikasi <em>Backup berhasil</em> muncul.</li>
          </ol>
          <button className="btn-primary" onClick={backup} disabled={busy} style={{ width: "100%" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px", verticalAlign: "middle", marginRight: "6px" }}>save</span>
            {busy ? "Memproses…" : "Pilih Lokasi & Backup"}
          </button>
        </section>

        {/* Restore card */}
        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "28px", color: "var(--color-expense-red)" }}>download</span>
            <div>
              <p className="sales-page__eyebrow" style={{ color: "var(--color-expense-red)" }}>LANGKAH 2 (opsional)</p>
              <h2 className="text-headline-sm">Restore Database</h2>
            </div>
          </div>
          <ol style={{ paddingLeft: "1.25rem", color: "var(--color-text-secondary)", fontSize: "13px", lineHeight: "1.7", marginBottom: "4px" }}>
            <li>Klik tombol di bawah — dialog buka file akan terbuka.</li>
            <li>Pilih file backup <code>.db</code> yang ingin dipulihkan.</li>
            <li>Konfirmasi peringatan penimpaan data.</li>
            <li>Restart aplikasi setelah restore selesai.</li>
          </ol>
          <p style={{ fontSize: "12px", color: "var(--color-warning-amber)", display: "flex", alignItems: "center", gap: "4px", marginBottom: "16px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>warning</span>
            Data saat ini akan ditimpa dan tidak dapat dikembalikan.
          </p>
          <button
            className="btn-secondary"
            onClick={restore}
            disabled={busy}
            style={{ width: "100%", color: "var(--color-expense-red)", borderColor: "var(--color-expense-red)" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px", verticalAlign: "middle", marginRight: "6px" }}>restore</span>
            {busy ? "Memproses…" : "Pilih File & Restore"}
          </button>
        </section>
      </div>
    </div>
  );
}
