// QrisScanner — upload gambar QRIS, decode pakai jsQR (no camera).
// Kamera tidak diaktifkan — Tauri WebView tidak konsisten untuk getUserMedia.
// Aktivitas upload dicatat ke log Rust tanpa merekam payload QRIS/gambar.
import { useState } from "react";
import { invoke } from "../utils/ipc";
import decodeQrImage from "../utils/decodeQrImage";

export default function QrisScanner({ onScanned, onClose }) {
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [uploaded, setUploaded] = useState(null);

  // Handle upload menggunakan native dialog picker agar kompatibel dengan Android content:// URI
  // dan mem-bypass pembatasan WebView Samsung sandbox (NotReadableError).
  const pilihGambarDialog = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      
      invoke("write_log", { msg: "QR_UPLOAD: scanner native dialog open dipicu" }).catch(() => {});
      
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Gambar", extensions: ["png", "jpg", "jpeg", "webp"] }]
      });

      if (!selected) {
        invoke("write_log", { msg: "QR_UPLOAD: scanner dialog dibatalkan oleh user" }).catch(() => {});
        return;
      }

      setScanning(true);
      setError("");
      const isContentUri = selected.startsWith("content://");
      invoke("write_log", { msg: `QR_UPLOAD: scanner dialog terpilih; path=${selected.slice(0, 120)}; tipe=${isContentUri ? "AndroidContentUri" : "LocalFile"}` }).catch(() => {});

      // Baca byte via plugin-fs; dialog picker menambahkan path terpilih ke scope read.
      const bytes = await readFile(selected);
      const blob = new Blob([bytes], { type: "image/png" });
      
      try {
        setUploaded(URL.createObjectURL(blob));
        invoke("write_log", { msg: "QR_UPLOAD: scanner preview URL berhasil" }).catch(() => {});
      } catch (previewError) {
        invoke("write_log", { msg: `QR_UPLOAD: scanner preview gagal: ${String(previewError?.message || previewError).slice(0, 300)}` }).catch(() => {});
      }

      const text = await decodeQrImage(blob);
      onScanned(text);
    } catch (e) {
      invoke("write_log", { msg: `QR_UPLOAD: scanner gagal: ${String(e?.message || e).slice(0, 300)}` }).catch(() => {});
      setError(e.message || "Gagal membaca QR");
      setScanning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
        <h3 className="text-headline-md" style={{ marginBottom: "0.5rem" }}>
          Unggah QRIS Statis
        </h3>
        <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
          Pilih gambar QRIS statis dari galeri.
        </p>

        {uploaded && (
          <div style={{
            width: "200px", height: "200px", margin: "0 auto 1rem",
            background: "#f0f0f0", borderRadius: "12px", overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img src={uploaded} alt="QRIS" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          </div>
        )}

        {scanning && (
          <p className="text-body-md" style={{ marginTop: "0.75rem" }}>
            <span className="spinner" style={{ width: "16px", height: "16px", display: "inline-block", verticalAlign: "middle", marginRight: "6px" }} />
            Membaca QR…
          </p>
        )}

        {error && (
          <p className="text-body-md" style={{ color: "var(--color-expense-red)", margin: "0.75rem 0" }}>
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn-primary"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          onClick={pilihGambarDialog}
          disabled={scanning}
        >
          <span className="material-symbols-outlined">add_photo_alternate</span>
          Pilih Gambar
        </button>

        <button
          type="button"
          className="btn-secondary"
          style={{ width: "100%", marginTop: "0.5rem" }}
          onClick={onClose}
        >
          Batal
        </button>
      </div>
    </div>
  );
}
