// ============================================================
// decodeQrImage.js — QRIS gambar → payload EMVCo
// Decoder sengaja memakai Image + Canvas, bukan createImageBitmap karena
// Android WebView sering gagal mendekode file dari file picker.
// Setiap tahap mencatat metadata non-rahasia; payload QRIS tidak pernah dilog.
// ============================================================
import { invoke } from "@tauri-apps/api/core";

// Kirim diagnostik tanpa membuat proses upload gagal saat logger unavailable.
function logDecode(message) {
  try {
    invoke("write_log", { msg: `QR_UPLOAD: ${message}` }).catch(() => {});
  } catch {
    // Logging tidak boleh mengganggu fungsi utama scanner.
  }
}

// Ringkas error WebView agar detail penyebab tetap tersedia di halaman Log Aplikasi.
function errorText(error) {
  return String(error?.message || error || "unknown error").replace(/[\r\n]+/g, " ").slice(0, 300);
}

// Baca signature saja, bukan isi QR/gambar, untuk diagnosis format file picker.
async function fileSignature(file) {
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    return `unavailable:${errorText(error)}`;
  }
}

// Muat gambar dari sumber URL. URL object dipertahankan hingga onload karena
// Android WebView dapat gagal jika URL di-revoke terlalu dini.
function loadSource(src, label, revokeAfterLoad = false) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label}: timeout 15 detik`));
    }, 15_000);

    image.onload = () => {
      window.clearTimeout(timeout);
      if (revokeAfterLoad) URL.revokeObjectURL(src);
      logDecode(`${label} berhasil; ukuran=${image.naturalWidth}x${image.naturalHeight}`);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      if (revokeAfterLoad) URL.revokeObjectURL(src);
      reject(new Error(`${label}: Image.onerror`));
    };
    image.src = src;
  });
}

// Urutan fallback: blob URL paling efisien, Data URL paling kompatibel untuk
// content:// Android. Jangan tampilkan detail URI maupun data gambar di log.
async function loadImage(file) {
  let objectUrl;
  try {
    objectUrl = URL.createObjectURL(file);
    logDecode("mencoba object-url");
    return await loadSource(objectUrl, "object-url", true);
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    logDecode(`object-url gagal: ${errorText(error)}`);
  }

  try {
    logDecode("mencoba FileReader Data URL");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("FileReader.onerror"));
      reader.onabort = () => reject(new Error("FileReader dibatalkan"));
      reader.readAsDataURL(file);
    });
    return await loadSource(dataUrl, "data-url");
  } catch (error) {
    logDecode(`data-url gagal: ${errorText(error)}`);
    throw new Error("Gambar QRIS tidak dapat dibuka oleh Android WebView. Buka Log Aplikasi untuk detail; gunakan PNG/JPG asli atau tempel string QRIS.");
  }
}

// Batasi canvas agar screenshot besar tidak membuat WebView kehabisan memori.
function boundedDimensions(image, scale) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const longest = Math.max(sourceWidth, sourceHeight);
  const ceiling = 2048;
  const safeScale = Math.min(scale, ceiling / longest);
  return {
    width: Math.max(1, Math.round(sourceWidth * safeScale)),
    height: Math.max(1, Math.round(sourceHeight * safeScale)),
  };
}

function tryDecode(image, scale, jsQR, pass) {
  const { width, height } = boundedDimensions(image, scale);
  if (width < 100 || height < 100) {
    logDecode(`${pass} dilewati; dimensi terlalu kecil ${width}x${height}`);
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D tidak tersedia");

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const result = jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
  logDecode(`${pass} selesai; canvas=${width}x${height}; qr=${Boolean(result?.data)}`);
  return result;
}

export default async function decodeQrImage(file) {
  if (!(file instanceof Blob) || !file.size) {
    throw new Error("File gambar QRIS tidak valid atau kosong.");
  }

  const signature = await fileSignature(file);
  logDecode(`dipilih; nama=${String(file.name || "tanpa-nama").slice(0, 80)}; tipe=${file.type || "kosong"}; bytes=${file.size}; signature=${signature}`);

  // MIME Android kadang kosong/salah; signature dan decoder menjadi otoritas akhir.
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Gambar terlalu besar (maksimum 20 MB). Crop QRIS lalu coba lagi.");
  }

  const image = await loadImage(file);
  if (!(image.naturalWidth || image.width) || !(image.naturalHeight || image.height)) {
    throw new Error("Gambar QRIS tidak memiliki dimensi valid.");
  }

  try {
    // Import hanya setelah file benar-benar siap, mengurangi beban WebView saat startup.
    logDecode("memuat decoder jsQR");
    const module = await import("jsqr");
    const jsQR = module.default || module;
    if (typeof jsQR !== "function") throw new Error("modul jsQR tidak menyediakan fungsi decoder");

    const passes = [
      [1, "pass-native"],
      [0.5, "pass-downsample"],
    ];
    for (const [scale, label] of passes) {
      const result = tryDecode(image, scale, jsQR, label);
      if (result?.data) {
        logDecode(`berhasil; panjang-payload=${result.data.length}`);
        return result.data;
      }
    }
  } catch (error) {
    logDecode(`decoder gagal: ${errorText(error)}`);
    throw new Error("Gagal memproses gambar QRIS. Buka Log Aplikasi untuk detail.");
  }

  logDecode("selesai tanpa QR payload");
  throw new Error("QRIS tidak terdeteksi. Crop agar hanya kode QR, lalu gunakan PNG/JPG tajam.");
}
