/**
 * RupiahInput — Input field dengan format otomatis Rupiah.
 *
 * Menampilkan angka dengan prefix "Rp" dan pemisah ribuan (1.000.000).
 * Menyimpan nilai mentah (hanya angka) di parent via onChange.
 *
 * Props:
 * - value: string/number — nilai angka mentah (tanpa format)
 * - onChange: (rawNumber: string) => void — callback dengan string angka mentah
 * - placeholder: string — placeholder input
 * - required: boolean
 * - className: string — default "input-field"
 * - disabled: boolean
 * - min: string — nilai minimum
 * - style: object — inline style tambahan
 */
import { useEffect, useRef, useState } from "react";

/** Format angka mentah menjadi string ribuan: 1250000 → "1.250.000" */
function formatRupiah(raw) {
  if (!raw || raw === "0") return "";
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export default function RupiahInput({
  value = "",
  onChange,
  placeholder = "0",
  required = false,
  className = "input-field",
  disabled = false,
  min,
  style,
}) {
  const raw = String(value || "");
  const formatted = formatRupiah(raw);
  const [display, setDisplay] = useState(formatted);
  const inputRef = useRef(null);
  const lastRawRef = useRef(raw);

  // Sync dari parent jika nilai berubah dari luar
  useEffect(() => {
    if (raw !== lastRawRef.current) {
      lastRawRef.current = raw;
      setDisplay(formatRupiah(raw));
    }
  }, [raw]);

  const handleChange = (e) => {
    let digits = e.target.value.replace(/\D/g, "");
    if (min !== undefined && digits && Number(digits) < Number(min)) {
      digits = String(min);
    }
    lastRawRef.current = digits;
    setDisplay(formatRupiah(digits));
    onChange?.(digits);
  };

  const { textAlign, width, flex, minWidth, maxWidth, ...boxStyle } = style || {};
  const alignRight = textAlign === "right";
  return (
    <div style={{ position: "relative", width: width || "100%", flex, minWidth, maxWidth, ...boxStyle }}>
      <span
        style={{
          position: "absolute",
          left: alignRight ? undefined : 10,
          right: alignRight ? 10 : undefined,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        Rp
      </span>
      <input
        ref={inputRef}
        className={className}
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        style={{
          width: "100%",
          textAlign: alignRight ? "right" : undefined,
          paddingLeft: alignRight ? 10 : 38,
          paddingRight: alignRight ? 38 : undefined,
        }}
      />
    </div>
  );
}
