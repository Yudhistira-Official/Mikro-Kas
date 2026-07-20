// ============================================================
// LogoMark.jsx — Logo MikroKas dari Stitch (icon M geometric navy).
//
// Asset publik: /logo-header.png — crop M-icon putih background.
// Versi wordmark tidak dipakai lagi; header dan profile hanya tampil icon.
// ============================================================
export default function LogoMark({ size = 48 }) {
  return (
    <img
      src="/logo-header.png"
      alt="MikroKas"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        background: "#ffffff",
        borderRadius: "12px",
        padding: "2px",
        boxSizing: "border-box",
      }}
    />
  );
}