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

  // ---------- Backup — user pilih lokasi, frontend tulis bytes ke lokasi itu ----------
  const backup = async () => {
    setBusy(true);
    logBackup("backup mulai");
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      logBackup("plugin dialog+fs dimuat");

      const filePath = await save({
        defaultPath: `mikrokas_backup_${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!filePath) { logBackup("backup dibatalkan user"); return; }
      logBackup(`save target dipilih; ${safeTargetInfo(filePath)}`);

      const dbBase64 = await invoke("export_database_base64");
      const bytes = base64ToBytes(dbBase64);
      logBackup(`database diekspor dari Rust; bytes=${bytes.length}`);

      await writeFile(filePath, bytes);
      logBackup(`writeFile sukses; bytes=${bytes.length}`);
      addToast("Backup berhasil disimpan", "success");
    } catch (e) {
      logBackup(`backup gagal; ${String(e?.message || e).slice(0, 300)}`);
      addToast(`Backup gagal: ${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  // ---------- Restore — user pilih file, frontend baca bytes lalu Rust import ----------
  const restore = async () => {
    if (!window.confirm("Restore akan menimpa seluruh database saat ini. Lanjutkan?")) return;
    setBusy(true);
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
      if (!selection) { logBackup("restore dibatalkan user"); return; }
      const filePath = typeof selection === "string" ? selection : selection.path;
      logBackup(`restore source dipilih; ${safeTargetInfo(filePath)}`);

      const bytes = await readFile(filePath);
      logBackup(`readFile sukses; bytes=${bytes.length}`);
      await invoke("restore_database_base64", { dbBase64: bytesToBase64(bytes) });
      logBackup("restore_database_base64 sukses");
      addToast("Restore berhasil. Silakan tutup dan buka ulang aplikasi.", "success");
    } catch (e) {
      logBackup(`restore gagal; ${String(e?.message || e).slice(0, 300)}`);
      addToast(`Restore gagal: ${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
    <h2 className="text-headline-md">Backup & Restore</h2>

    <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>cloud_upload</span>
        <p className="text-headline-sm">Backup Database</p>
      </div>
      <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Pilih lokasi file backup melalui dialog native. Tidak perlu mengetik path.</p>
      <button className="btn-primary" onClick={backup} disabled={busy}>{busy ? "Memproses…" : "Pilih Lokasi & Backup"}</button>
    </div>

    <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="material-symbols-outlined" style={{ color: "var(--color-expense-red)" }}>download</span>
        <p className="text-headline-sm">Restore Database</p>
      </div>
      <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Pilih file backup <code>.db</code> dari dialog native. Aplikasi perlu direstart setelah restore.</p>
      <button className="btn-secondary" onClick={restore} disabled={busy} style={{ color: "var(--color-expense-red)", borderColor: "var(--color-expense-red)" }}>{busy ? "Memproses…" : "Pilih File & Restore"}</button>
    </div>
  </div>;
}