// Util format tanggal Indonesia: tampil DD/MM/YYYY, simpan ISO YYYY-MM-DD.

/**
 * Ambil bagian tanggal YYYY-MM-DD dari string DB/ISO.
 */
export function toIsoDate(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY → ISO
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${d}`;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Format tampilan tanggal: DD/MM/YYYY.
 * Terima ISO, datetime DB, atau string kosong.
 */
export function formatDateId(value) {
  const iso = toIsoDate(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Format tampilan tanggal + jam: DD/MM/YYYY HH:mm.
 */
export function formatDateTimeId(value) {
  if (!value) return "—";
  const s = String(value).trim().replace("T", " ");
  const iso = toIsoDate(s);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const time = s.length >= 16 ? s.slice(11, 16) : "";
  return time ? `${d}/${m}/${y} ${time}` : `${d}/${m}/${y}`;
}

/**
 * Hari ini sebagai ISO YYYY-MM-DD (lokal).
 */
export function todayIso() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
