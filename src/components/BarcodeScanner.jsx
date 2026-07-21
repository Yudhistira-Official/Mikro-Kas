// BarcodeScanner.jsx — Popup scan barcode via native kamera Android.
//
// Alur:
//   Tombol scan ditekan → popup tengah muncul → user klik "Buka Kamera"
//   → kamera bawaan HP terbuka → foto → kembali ke MikroKas → ZXing decode
//   → SKU dikirim ke onDetected.
//
// Kenapa NATIVE camera (ACTION_IMAGE_CAPTURE via @JavascriptInterface):
//   - getUserMedia sangat tidak reliable di Samsung WebView (hang).
//   - <input capture="camera"> sering diabaikan (buka galeri).
//   - Native intent 100% work di semua Android.
//
// Proteksi popup:
//   - pointerEvents: "auto" hanya di popup card, background tidak bisa di-click.
//   - Klik background = close popup.
//   - Tidak ada event propagation ke elemen di belakang.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "../utils/ipc";

function writeLog(msg) {
  try { invoke("write_log", { msg: `BARCODE: ${msg}` }).catch(() => {}); } catch { /* log tidak boleh mengganggu kasir */ }
}

export default function BarcodeScanner({ onDetected, onClose }) {
  const [status, setStatus] = useState("Siap membuka kamera")
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [autoReady, setAutoReady] = useState(false)

  // Cek bridge — inject via onWebViewCreate, harus ready.
  useEffect(() => {
    const t = setTimeout(() => {
      setAutoReady(typeof window.MikroKasCamera?.capturePhoto === "function")
    }, 300)
    return () => {
      clearTimeout(t)
      window.__mikrokasBarcodePhoto = null
    }
  }, [])

  // Langsung buka kamera setelah popup mount + bridge ready.
  const startedRef = useRef(false)
  useEffect(() => {
    if (!autoReady || startedRef.current) return
    const t = setTimeout(() => {
      startedRef.current = true
      openCamera()
    }, 250)
    return () => {
      clearTimeout(t)
      window.__mikrokasBarcodePhoto = null
    }
  }, [autoReady])

  // Decode base64 → ZXing MultiFormatReader (barcode 1D + QR).
  const decodeFromBase64 = async (base64) => {
    setStatus("Mendeteksi barcode...")
    writeLog(`decode mulai; base64=${base64?.length || 0}`)

    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error("Gambar kamera gagal dimuat"))
      img.src = `data:image/jpeg;base64,${base64}`
    })

    // Batas canvas mencegah OOM di WebView.
    const maxDim = 1920
    let width = img.naturalWidth || img.width
    let height = img.naturalHeight || img.height
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, width, height)

    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ])
      const hints = new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
          BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
        ]],
        [DecodeHintType.TRY_HARDER, true],
      ])
      const reader = new BrowserMultiFormatReader(hints)
      const result = reader.decodeFromCanvas(canvas)
      const text = result?.getText?.() || result?.text || ""
      const format = String(result?.getBarcodeFormat?.() || result?.format || "unknown")
      writeLog(`decode sukses; format=${format}; sku=${String(text).slice(0, 80)}`)
      return String(text).trim()
    } catch (e) {
      writeLog(`decode gagal; ${String(e?.message || e).slice(0, 200)}`)
      return ""
    }
  }

  const openCamera = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setStatus("Membuka kamera...")

    if (typeof window.MikroKasCamera?.capturePhoto !== "function") {
      setBusy(false)
      setStatus("Kamera tidak tersedia")
      setError("Bridge kamera belum siap. Tutup popup lalu buka scan lagi.")
      writeLog("capture gagal; bridge missing")
      return
    }

    // Callback — dipanggil Kotlin setelah foto selesai.
    window.__mikrokasBarcodePhoto = async (base64) => {
      writeLog(`callback dipanggil; base64 length=${base64?.length || 0}`)
      try {
        if (!base64 || base64 === "null" || base64.length < 100) {
          setStatus("Foto dibatalkan atau kosong")
          setError("Foto dibatalkan. Tutup popup lalu scan lagi.")
          writeLog("capture dibatalkan / kosong")
          return
        }
        const sku = await decodeFromBase64(base64)
        if (sku) {
          writeLog(`barcode detected, calling onDetected: ${sku.slice(0, 60)}`)
          onDetected(sku)
        } else {
          setStatus("Barcode tidak terbaca")
          setError("Barcode tidak terbaca. Scan ulang dengan jarak lebih dekat dan pastikan terang.")
          writeLog("decode gagal; sku kosong")
        }
      } catch (err) {
        setError(`Barcode tidak terbaca: ${String(err?.message || err)}`)
        writeLog(`decode exception; ${String(err?.message || err).slice(0, 200)}`)
      } finally {
        setBusy(false)
      }
    }

    try {
      const launched = window.MikroKasCamera.capturePhoto("__mikrokasBarcodePhoto")
      if (!launched) throw new Error("Native camera menolak membuka intent")
      writeLog("native camera intent launched")
    } catch (err) {
      window.__mikrokasBarcodePhoto = null
      setBusy(false)
      setStatus("Kamera gagal dibuka")
      setError(`Gagal membuka kamera: ${String(err?.message || err)}`)
      writeLog(`capture exception; ${String(err?.message || err).slice(0, 200)}`)
    }
  }

  // Tutup popup via tombol.
  const close = () => {
    setBusy(false)
    onClose()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Popup scan barcode"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backgroundColor: "rgba(15, 23, 42, 0.72)",
      }}
    >
      <div
        style={{
          width: "min(92vw, 380px)",
          borderRadius: 24,
          padding: 24,
          background: "#ffffff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.35)",
          textAlign: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 12px",
            borderRadius: 22,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
            color: "white",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 40 }}>photo_camera</span>
        </div>

        <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#0f172a" }}>Scan Barcode</h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b" }}>{status}</p>

        {!error && !busy && status !== "Membuka kamera..." && (
          <div style={{ height: 4, borderRadius: 999, overflow: "hidden", background: "#ede9fe", marginBottom: 14 }}>
            <div style={{ width: "60%", height: "100%", background: "linear-gradient(90deg, #7C3AED, #06B6D4)" }} />
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 14, padding: 10, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Tidak ada tombol Buka Kamera: popup langsung membuka native camera. Tombol retry hanya muncul kalau gagal. */}
        {error && !busy && (
          <button
            type="button"
            onClick={openCamera}
            disabled={!autoReady}
            style={{
              width: "100%",
              border: 0,
              borderRadius: 16,
              padding: "13px 16px",
              background: !autoReady ? "#a78bfa" : "linear-gradient(135deg, #7C3AED, #06B6D4)",
              color: "white",
              fontWeight: 800,
              fontSize: 15,
              cursor: !autoReady ? "not-allowed" : "pointer",
              marginBottom: 10,
            }}
          >
            Coba Lagi
          </button>
        )}

        <button
          type="button"
          onClick={close}
          disabled={busy}
          style={{
            width: "100%",
            marginTop: 10,
            border: 0,
            borderRadius: 16,
            padding: "11px 16px",
            background: "#f1f5f9",
            color: "#475569",
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Tutup
        </button>
      </div>
    </div>
  , document.body)
}
