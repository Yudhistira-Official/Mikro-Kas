// ============================================================
// LogoMark.jsx — Logo MikroKas kontras untuk header dan Profile.
//
// Tujuan:
//   - Menghindari ikon menyatu dengan background putih/abu.
//   - Memakai blok navy solid + aksen cyan agar tetap terbaca di layar Android.
//   - Tanpa asset gambar eksternal agar APK tetap ringan.
// ============================================================
export default function LogoMark({ size = 40 }) {
  const fontSize = Math.max(12, Math.round(size * 0.36));

  return (
    <span
      aria-label="Logo MikroKas"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "linear-gradient(135deg, #082f49 0%, #1a365d 58%, #0f766e 100%)",
        color: "#ffffff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize,
        letterSpacing: "-0.04em",
        boxShadow: "0 8px 18px rgba(8, 47, 73, 0.32), inset 0 0 0 1px rgba(255,255,255,0.18)",
        border: "2px solid rgba(255,255,255,0.92)",
        flexShrink: 0,
      }}
    >
      MK
    </span>
  );
}
