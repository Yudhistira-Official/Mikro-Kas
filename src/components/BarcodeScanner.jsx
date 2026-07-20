// ============================================================
// BarcodeScanner.jsx — real-time barcode scanner manual canvas loop
//
// Kenapa manual canvas loop:
//   - Tauri Android WebView bisa menampilkan kamera tetapi ZXing
//     decodeFromConstraints kadang hanya "loading" tanpa hasil.
//   - Loop manual mengambil frame video → canvas → ZXing decodeFromCanvas.
//   - QRIS tetap aman karena QRIS scanner masih pakai jsQR terpisah.
//
// Format target:
//   EAN-13, EAN-8, UPC-A, UPC-E, Code128, Code39, ITF, QR.
// ============================================================
import { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "../utils/ipc";

/**
 * BarcodeScanner — modal scanner barcode real-time.
 * @param {Function} onDetected — dipanggil dengan string SKU saat barcode ditemukan.
 * @param {Function} onClose — dipanggil saat user menutup modal atau setelah deteksi.
 */
export default function BarcodeScanner({ onDetected, onClose }) {
  // Ref kamera + canvas internal untuk decode frame.
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const readerRef = useRef(null);
  const detectedRef = useRef(false);

  // UI state ringkas agar user tahu scanner benar-benar mencoba decode.
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("Menyiapkan kamera...");
  const [manualKode, setManualKode] = useState(""); // fallback manual SKU/barcode bila kamera gagal membaca.

  // -------------------------------------------------------
  // LOGGING — kirim diagnostik ke Rust log tanpa mengganggu scan.
  // -------------------------------------------------------
  const log = useCallback((msg) => {
    try {
      invoke("write_log", { msg: `BARCODE: ${msg}` }).catch(() => {});
    } catch {}
  }, []);

  // -------------------------------------------------------
  // CLEANUP — hentikan loop, reader, dan track kamera.
  // -------------------------------------------------------
  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // -------------------------------------------------------
  // MANUAL SUBMIT — paksa barcode manual masuk keranjang.
  // -------------------------------------------------------
  const submitManual = useCallback(() => {
    const kode = manualKode.trim();
    if (!kode) {
      setStatus("Barcode manual masih kosong");
      return;
    }
    detectedRef.current = true;
    log(`barcode manual dipakai: ${kode.slice(0, 60)}`);
    cleanup();
    onDetected(kode);
  }, [cleanup, log, manualKode, onDetected]);

  // -------------------------------------------------------
  // EFFECT — setup kamera manual + decode canvas throttled.
  // -------------------------------------------------------
  useEffect(() => {
    let mounted = true;
    let attempt = 0;
    let lastDecodeAt = 0;

    const start = async () => {
      try {
        setStatus("Membuka kamera...");
        log("manual canvas scanner init");

        // Dynamic import: library berat hanya masuk saat scanner dibuka.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        const hints = new Map([
          [DecodeHintType.TRY_HARDER, true],
          [DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.ITF,
            BarcodeFormat.QR_CODE,
          ]],
        ]);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 500,
        });
        readerRef.current = reader;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // ponytail: constraint non-standar ini diabaikan bila WebView tidak support; upgrade ke native scanner kalau autofocus tetap gagal.
            advanced: [{ focusMode: "continuous" }],
          },
        });
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error("Elemen video tidak tersedia");
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();

        setStatus("Mencari barcode...");
        log(`kamera aktif: ${video.videoWidth}x${video.videoHeight}`);

        const canvas = canvasRef.current || document.createElement("canvas");
        canvasRef.current = canvas;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D tidak tersedia");

        const scanFrame = (now) => {
          if (!mounted || detectedRef.current) return;

          // Throttle decode: ZXing cukup berat, 4x/detik lebih stabil di HP low/mid.
          if (now - lastDecodeAt < 250) {
            rafRef.current = requestAnimationFrame(scanFrame);
            return;
          }
          lastDecodeAt = now;

          const width = video.videoWidth || 0;
          const height = video.videoHeight || 0;
          if (!width || !height || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(scanFrame);
            return;
          }

          try {
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(video, 0, 0, width, height);
            const result = reader.decodeFromCanvas(canvas);
            const sku = result?.getText?.()?.trim();
            if (sku) {
              detectedRef.current = true;
              setStatus("Barcode ditemukan");
              log(`detected format=${result.getBarcodeFormat()} text=${sku.slice(0, 40)}`);
              cleanup();
              onDetected(sku);
              return;
            }
          } catch (err) {
            // NotFoundException tiap frame normal. Log periodik saja supaya tidak banjir.
            attempt += 1;
            if (attempt % 20 === 0) {
              setStatus(`Mencari barcode... (${attempt} frame)`);
              log(`belum terdeteksi: attempts=${attempt} frame=${width}x${height} err=${String(err?.name || err).slice(0, 80)}`);
            }
          }

          rafRef.current = requestAnimationFrame(scanFrame);
        };

        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (e) {
        const msg = String(e?.message || e);
        log(`gagal scanner: ${msg}`);
        if (mounted) setError(msg);
      }
    };

    start();

    return () => {
      mounted = false;
      cleanup();
      log("manual canvas scanner stop");
    };
  }, [cleanup, log, onDetected]);

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="text-headline-md">Scan Barcode</h3>
          <button className="btn-icon" onClick={() => { cleanup(); onClose(); }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Error */}
        {error ? (
          <div className="empty-state">
            <span className="material-symbols-outlined" style={{ color: "var(--color-expense-red)" }}>
              error
            </span>
            <p style={{ color: "var(--color-expense-red)", textAlign: "center" }}>{error}</p>
            <button className="btn-secondary" onClick={onClose}>
              Tutup
            </button>
          </div>
        ) : (
          <>
            {/* Video preview */}
            <video
              ref={videoRef}
              style={{
                width: "100%",
                borderRadius: 12,
                background: "#000",
                maxHeight: 320,
                objectFit: "cover",
              }}
              playsInline
              muted
            />
            <p
              className="text-body-md"
              style={{
                textAlign: "center",
                color: "var(--color-text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span
                className="spinner"
                style={{ width: 14, height: 14, display: "inline-block", verticalAlign: "middle" }}
              />
              {status}
            </p>
            <p className="text-label-md" style={{ textAlign: "center", color: "var(--color-text-secondary)" }}>
              Dekatkan barcode, pastikan garis barcode horizontal dan terang.
            </p>
            {/* ------ INPUT MANUAL -------- */}
            <div style={{ display: "flex", gap: 8, marginTop: "0.5rem" }}>
              <input
                className="input-field"
                style={{ flex: 1 }}
                type="text"
                placeholder="Atau ketik barcode / SKU manual..."
                value={manualKode}
                onChange={(e) => setManualKode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitManual(); }}
              />
              <button
                className="btn-primary"
                onClick={submitManual}
                style={{ whiteSpace: "nowrap", padding: "0 1rem" }}
              >
                Cari
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}