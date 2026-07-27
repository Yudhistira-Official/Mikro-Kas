// Kasir focus mode: hides sidebar/nav so UI only shows kasir page.
const STORAGE_KEY = "mikrokas_kasir_mode";
const EVENT = "mikrokas-kasir-mode";

/**
 * Returns whether kasir mode is active.
 */
export function isKasirMode() {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

/**
 * Enables or disables kasir mode and notifies listeners.
 * Parameters:
 * - `enabled`: boolean
 */
export function setKasirMode(enabled) {
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { enabled: !!enabled } }));
  return !!enabled;
}

/**
 * Subscribes to kasir mode changes.
 * Returns unsubscribe function.
 */
export function onKasirModeChange(handler) {
  const listener = (event) => handler(!!event.detail?.enabled);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
