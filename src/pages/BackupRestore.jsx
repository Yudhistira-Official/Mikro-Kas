// ============================================================
// BackupRestore.jsx — Backup & restore via native file picker.
//
// Tidak ada input path manual; user memilih direktori/tempat
// lewat dialog native OS (tauri-plugin-dialog).
// ============================================================
import { useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function BackupRestore() {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  // ---------- Backup — pilih direktori simpan via native dialog ----------
  const backup = async () => {
    setBusy(true);
    try {
      // Dynamic import dialog plugin agar tidak bundling berat
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        defaultPath: "mikrokas_backup.db",
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!filePath) { setBusy(false); return; } // user cancel
      const result = await invoke("backup_database_to", { targetPath: filePath });
      addToast(`Backup disimpan ke ${result}`, "success");
    } catch (e) { addToast(String(e), "error"); }
    finally { setBusy(false); }
  };

  // ---------- Restore — pilih file backup via native dialog ----------
  const restore = async () => {
    if (!window.confirm("Restore akan menimpa seluruh database saat ini. Lanjutkan?")) return;
    setBusy(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selection = await open({
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        multiple: false,
        directory: false,
      });
      if (!selection) { setBusy(false); return; }
      const filePath = typeof selection === "string" ? selection : selection.path;
      await invoke("restore_database", { backupPath: filePath });
      addToast("Restore berhasil. Silakan tutup dan buka ulang aplikasi.", "success");
    } catch (e) { addToast(String(e), "error"); }
    finally { setBusy(false); }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
    <h2 className="text-headline-md">Backup & Restore</h2>

    <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>cloud_upload</span>
        <p className="text-headline-sm">Backup Database</p>
      </div>
      <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Pilih folder untuk menyimpan salinan database. File akan bernama <code>mikrokas_backup.db</code>.</p>
      <button className="btn-primary" onClick={backup} disabled={busy}>Pilih Folder & Backup</button>
    </div>

    <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="material-symbols-outlined" style={{ color: "var(--color-expense-red)" }}>download</span>
        <p className="text-headline-sm">Restore Database</p>
      </div>
      <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Pilih file backup <code>.db</code> yang akan dipulihkan. Aplikasi perlu direstart setelah restore.</p>
      <button className="btn-secondary" onClick={restore} disabled={busy} style={{ color: "var(--color-expense-red)", borderColor: "var(--color-expense-red)" }}>Pilih File & Restore</button>
    </div>
  </div>;
}