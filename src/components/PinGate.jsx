// PinGate.jsx — Komponen PIN entry modal untuk keamanan akses kasir.
// Design ref: KasGo — PIN kasir sebelum proses checkout.
// PIN diambil dari backend list_kasir_pins, disimpan di localStorage.
import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";

/**
 * PinGate — Wrapper yang menampilkan modal PIN sebelum children bisa diakses.
 * @param {object} props
 * @param {function} props.onSuccess — dipanggil setelah PIN valid.
 * @param {string} props.role — role yang diminta (default: "kasir").
 * @param {React.ReactNode} props.children — konten yang dilindungi PIN.
 */
export default function PinGate({ onSuccess, role = "kasir", children }) {
  const [pins, setPins] = useState([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Cek apakah sudah ada PIN di role ini
  useEffect(() => {
    invoke("list_kasir_pins")
      .then((data) => {
        setPins(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Jika tidak ada PIN aktif, langsung izinkan akses
  if (!loading && pins.length === 0) {
    return <>{children}</>;
  }

  const handleVerify = () => {
    setError("");
    if (input.length < 4) {
      setError("PIN minimal 4 digit");
      return;
    }
    invoke("verify_kasir_pin", { pin: input, role })
      .then((ok) => {
        if (ok) {
          setInput("");
          onSuccess?.();
        } else {
          setError("PIN salah");
          setInput("");
        }
      })
      .catch((e) => setError(String(e)));
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 9999, backdropFilter: "blur(4px)"
    }}>
      <div style={{
        background: "var(--color-surface)", borderRadius: "20px", padding: "2rem",
        width: "320px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        border: "1px solid var(--color-outline-variant)", textAlign: "center"
      }}>
        <div style={{
          width: "60px", height: "60px", borderRadius: "50%",
          background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 1rem"
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: "28px", color: "white" }}>lock</span>
        </div>
        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
          Masukkan PIN Kasir
        </h3>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "1.25rem" }}>
          Akses kasir dilindungi PIN
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          placeholder="••••"
          autoFocus
          style={{
            width: "100%", padding: "14px", fontSize: "24px", textAlign: "center",
            letterSpacing: "8px", fontWeight: 700, borderRadius: "12px",
            border: "2px solid var(--color-outline-variant)", background: "var(--color-surface-container)",
            outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)"
          }}
        />
        {error && (
          <p style={{ color: "var(--color-expense-red)", fontSize: "12px", marginTop: "0.5rem", fontWeight: 500 }}>
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleVerify}
          style={{
            width: "100%", marginTop: "1rem", padding: "12px", borderRadius: "12px",
            border: "none", background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
            color: "white", fontSize: "16px", fontWeight: 600, cursor: "pointer"
          }}
        >
          Buka Kasir
        </button>
      </div>
    </div>
  );
}
