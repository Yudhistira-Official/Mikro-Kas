// Window mode preference: "windowed" | "fullscreen"
// Stored in localStorage; applied via Tauri window API when available.

const STORAGE_KEY = "mikrokas_window_mode";

export function preferenceKey(userId, name) {
  return `mikrokas_${name}_${userId || "guest"}`;
}

export function getUserWindowMode(userId) {
  const value = localStorage.getItem(preferenceKey(userId, "window_mode"));
  return value === "fullscreen" ? "fullscreen" : "windowed";
}

export function setUserWindowMode(userId, mode) {
  const next = mode === "fullscreen" ? "fullscreen" : "windowed";
  localStorage.setItem(preferenceKey(userId, "window_mode"), next);
  return next;
}

/**
 * Reads preferred window mode from localStorage.
 * Returns: "windowed" | "fullscreen"
 */
export function getWindowMode() {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "fullscreen" ? "fullscreen" : "windowed";
}

/**
 * Persists window mode preference.
 * Parameters:
 * - `mode`: "windowed" | "fullscreen"
 */
export function setWindowMode(mode) {
  const next = mode === "fullscreen" ? "fullscreen" : "windowed";
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}

/**
 * Applies window mode to the current Tauri window.
 * No-op when running outside Tauri (browser dev).
 */
export async function applyWindowMode(mode = getWindowMode()) {
  const tryApply = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.setFullscreen(mode === "fullscreen");
    } catch (e) {
      // Browser / non-Tauri: skip
    }
  };
  
  // Coba langsung, lalu backup dengan timeout 150ms jika window belum fully mapped
  await tryApply();
  setTimeout(tryApply, 150);
}

/**
 * Toggle fullscreen state of the current window without persisting preference.
 * Used for F11 runtime toggle — does NOT modify the default setting.
 */
export async function toggleFullscreen() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const isFullscreen = await win.isFullscreen();
    await win.setFullscreen(!isFullscreen);
    return !isFullscreen;
  } catch (e) {
    // Fallback browser API (dev / non-Tauri)
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
        return true;
      }
      await document.exitFullscreen?.();
      return false;
    } catch {
      console.warn("toggleFullscreen gagal:", e);
      return null;
    }
  }
}
