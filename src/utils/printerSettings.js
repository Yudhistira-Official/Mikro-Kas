// Printer preference for ESC/POS thermal printers (universal path/port).
const STORAGE_KEY = "mikrokas_printer_path";

/**
 * Returns preferred printer device path, or empty string for auto-detect.
 */
export function getPrinterPath() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

/**
 * Saves preferred printer path (e.g. /dev/usb/lp0 or COM3 or \\\\.\\USB001).
 */
export function setPrinterPath(path) {
  const value = String(path || "").trim();
  if (!value) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, value);
  return value;
}
