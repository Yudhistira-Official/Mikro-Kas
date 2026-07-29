import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../utils/ipc";

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotQuestions, setForgotQuestions] = useState([]);
  const [forgotAnswers, setForgotAnswers] = useState([]);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("Username dan password wajib diisi");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const user = await invoke("login_user", { username: form.username.trim(), password: form.password });
      onLogin(user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotStart = async () => {
    if (!forgotUsername.trim()) {
      setForgotError("Masukkan username terlebih dahulu");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      const qs = await invoke("get_security_questions_public", { username: forgotUsername.trim() });
      setForgotQuestions(qs);
      setForgotAnswers(new Array(qs.length).fill(""));
      setForgotStep(2);
    } catch (err) {
      setForgotError(String(err));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (forgotAnswers.some((a) => !a.trim())) {
      setForgotError("Semua jawaban wajib diisi");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      const result = await invoke("verify_security_answers", {
        username: forgotUsername.trim(),
        answers: forgotAnswers.map((a) => a.trim()),
      });
       if (result.success) {
         setTemporaryPassword(result.temporaryPassword || "");
         setForgotStep(3);
      } else {
        setForgotError("Jawaban tidak sesuai. Silakan coba lagi.");
      }
    } catch (err) {
      setForgotError(String(err));
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgot = () => {
    setShowForgot(false);
    setForgotStep(1);
    setForgotUsername("");
    setForgotQuestions([]);
    setForgotAnswers([]);
    setForgotError("");
    setTemporaryPassword("");
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", background: "var(--color-surface)" }}>
      <form onSubmit={handleSubmit} style={{ width: "min(100%, 380px)", padding: "28px", background: "var(--color-surface-container)", borderRadius: "16px", boxShadow: "var(--shadow-card, 0 8px 30px rgba(0,0,0,.08))" }}>
        <p className="sales-page__eyebrow">MIKROKAS</p>
        <h1 className="text-headline-sm" style={{ marginBottom: "20px" }}>Masuk</h1>
        <label className="input-label" htmlFor="login-username">Username</label>
        <input id="login-username" className="input-field" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <label className="input-label" htmlFor="login-password" style={{ display: "block", marginTop: "12px" }}>Password</label>
        <input id="login-password" className="input-field" type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        {error && <p role="alert" style={{ color: "var(--color-error)", margin: "12px 0", fontSize: "13px" }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: "20px" }}>{busy ? "Memeriksa…" : "Masuk"}</button>
        <p style={{ textAlign: "center", marginTop: 12 }}>
          <button
            type="button"
            className="btn-text"
            onClick={() => setShowForgot(true)}
            style={{ fontSize: 13, color: "var(--color-primary)", textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}
          >
            Lupa Password?
          </button>
        </p>
      </form>

      {showForgot && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && resetForgot()}
        >
          <div
            style={{
              background: "var(--color-surface-container)",
              borderRadius: 16, padding: 28, width: "min(100%, 400px)",
              boxShadow: "0 8px 30px rgba(0,0,0,.15)",
            }}
          >
            {forgotStep === 1 && (
              <>
                <h2 className="text-headline-sm" style={{ marginBottom: 8 }}>Lupa Password</h2>
                <p className="text-body-md" style={{ marginBottom: 16, color: "var(--color-text-secondary)" }}>
                  Masukkan username untuk memverifikasi identitas Anda.
                </p>
                <label className="input-label">Username</label>
                <input
                  className="input-field"
                  value={forgotUsername}
                  onChange={(e) => { setForgotUsername(e.target.value); setForgotError(""); }}
                  placeholder="Masukkan username"
                  autoFocus
                />
                {forgotError && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{forgotError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn-secondary" onClick={resetForgot} style={{ flex: 1 }}>
                    Batal
                  </button>
                  <button type="button" className="btn-primary" onClick={handleForgotStart} disabled={forgotLoading} style={{ flex: 1 }}>
                    {forgotLoading ? "Memeriksa..." : "Lanjutkan"}
                  </button>
                </div>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <h2 className="text-headline-sm" style={{ marginBottom: 8 }}>Pertanyaan Keamanan</h2>
                <p className="text-body-md" style={{ marginBottom: 16, color: "var(--color-text-secondary)" }}>
                  Jawab pertanyaan di bawah untuk mereset password.
                </p>
                {forgotQuestions.map((q, idx) => (
                  <div key={idx} style={{ marginBottom: 12 }}>
                    <label className="input-label">{q.pertanyaan}</label>
                    <input
                      className="input-field"
                      value={forgotAnswers[idx] || ""}
                      onChange={(e) => {
                        const copy = [...forgotAnswers];
                        copy[idx] = e.target.value;
                        setForgotAnswers(copy);
                        setForgotError("");
                      }}
                      placeholder={`Jawaban ${idx + 1}`}
                      autoFocus={idx === 0}
                    />
                  </div>
                ))}
                {forgotError && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{forgotError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn-secondary" onClick={resetForgot} style={{ flex: 1 }}>
                    Batal
                  </button>
                  <button type="button" className="btn-primary" onClick={handleForgotSubmit} disabled={forgotLoading} style={{ flex: 1 }}>
                    {forgotLoading ? "Memverifikasi..." : "Reset Password"}
                  </button>
                </div>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <h2 className="text-headline-sm" style={{ marginBottom: 8, color: "var(--color-success, #047857)" }}>Password Direset</h2>
                <p className="text-body-md" style={{ marginBottom: 16 }}>
                   Password sementara Anda: <strong>{temporaryPassword}</strong>. Simpan, login, lalu segera ubah password.
                </p>
                <button type="button" className="btn-primary" onClick={resetForgot} style={{ width: "100%" }}>
                  Kembali ke Login
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
