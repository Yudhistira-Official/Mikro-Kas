// ============================================================
// useToast — Context + hook untuk notifikasi toast
// ============================================================
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = "info", action = null) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type, action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3700);
  }, []);

  useEffect(() => {
    const handle = (e) => {
      if (e.ctrlKey && e.key === "z") {
        const actionable = toasts.findLast?.((t) => t.action) ?? [...toasts].reverse().find((t) => t.action);
        if (!actionable) return;
        e.preventDefault();
        actionable.action.action();
        setToasts((prev) => prev.filter((t) => t.id !== actionable.id));
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ toasts, addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === "error" ? "toast-error" : t.type === "success" ? "toast-success" : ""}`}>
            <span>{t.message}</span>
            {t.action && (
              <>
                <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
                <button
                  className="toast-action-link"
                  onClick={() => {
                    t.action.action();
                    setToasts((prev) => prev.filter((toast) => toast.id !== t.id));
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
