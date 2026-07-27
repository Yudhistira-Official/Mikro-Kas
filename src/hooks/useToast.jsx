// ============================================================
// useToast — Context + hook untuk notifikasi toast
// Masuk dari kanan, keluar ke kanan (slide).
// ============================================================
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const ToastContext = createContext(null);
const EXIT_MS = 280;
const SHOW_MS = 3700;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const clearTimers = useCallback((id) => {
    const timers = timersRef.current.get(id);
    if (!timers) return;
    if (timers.hide) clearTimeout(timers.hide);
    if (timers.remove) clearTimeout(timers.remove);
    timersRef.current.delete(id);
  }, []);

  const removeToast = useCallback((id) => {
    clearTimers(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, [clearTimers]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const remove = setTimeout(() => removeToast(id), EXIT_MS);
    const existing = timersRef.current.get(id) || {};
    if (existing.hide) clearTimeout(existing.hide);
    timersRef.current.set(id, { ...existing, hide: null, remove });
  }, [removeToast]);

  const addToast = useCallback((message, type = "info", action = null) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type, action, leaving: false }]);
    const hide = setTimeout(() => dismissToast(id), SHOW_MS);
    timersRef.current.set(id, { hide, remove: null });
  }, [dismissToast]);

  useEffect(() => {
    const handle = (e) => {
      if (e.ctrlKey && e.key === "z") {
        const actionable = toasts.findLast?.((t) => t.action && !t.leaving) ?? [...toasts].reverse().find((t) => t.action && !t.leaving);
        if (!actionable) return;
        e.preventDefault();
        actionable.action.action();
        dismissToast(actionable.id);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [toasts, dismissToast]);

  useEffect(() => () => {
    timersRef.current.forEach((timers) => {
      if (timers.hide) clearTimeout(timers.hide);
      if (timers.remove) clearTimeout(timers.remove);
    });
    timersRef.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type === "error" ? "error" : t.type === "success" ? "success" : "info"}${t.leaving ? " toast--out" : " toast--in"}`}
          >
            <span>{t.message}</span>
            {t.action && !t.leaving && (
              <>
                <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
                <button
                  className="toast-action-link"
                  onClick={() => {
                    t.action.action();
                    dismissToast(t.id);
                  }}
                >
                  {t.action.label || "Urungkan"}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
