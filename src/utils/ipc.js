// ipc.js — Wrapper IPC MikroKas.
// Tauri v2 membekukan __TAURI_INTERNALS__; monkey-packet gagal di Android release.
// Wrapper ini tetap mencatat semua operasi IPC tanpa memodifikasi properti read-only.
// Argumen sengaja tidak dicatat: dapat memuat QRIS, nominal, atau data sensitif.
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

function auditLog(msg) {
  try { tauriInvoke("write_log", { msg }).catch(() => {}); } catch {}
}

/**
 * invoke(command, args, options) — drop-in replacement untuk Tauri invoke.
 * Mencatat command name, status, dan durasi ke file log Rust.
 */
export async function invoke(command, args, options) {
  if (command === "write_log") return tauriInvoke(command, args, options);
  const started = Date.now();
  try {
    const result = await tauriInvoke(command, args, options);
    auditLog(`IPC: ${command} sukses; ${Date.now() - started}ms`);
    return result;
  } catch (err) {
    const msg = String(err?.message || err).replace(/[\r\n]+/g, " ").slice(0, 300);
    auditLog(`IPC: ${command} gagal; ${Date.now() - started}ms; ${msg}`);
    throw err;
  }
}

// Re-export raw invoke untuk keperluan spesial (logger, early boot).
export { tauriInvoke as rawInvoke };
