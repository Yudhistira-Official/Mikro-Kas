import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "../utils/ipc";
import CekHarga from "./CekHarga";

/**
 * Login — UX dari Stitch: logo perusahaan, form padat operator, show/hide password,
 * hint Enter, copyright MikroKas. Logo kosong = placeholder dashed (first-run).
 */
export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toko, setToko] = useState(null);

  const [showForgot, setShowForgot] = useState(false);
  const [showCekHarga, setShowCekHarga] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotQuestions, setForgotQuestions] = useState([]);
  const [forgotAnswers, setForgotAnswers] = useState([]);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  useEffect(() => {
    invoke("get_toko")
      .then((data) => setToko(data || null))
      .catch(() => setToko(null));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("Username dan password wajib diisi");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const user = await invoke("login_user", {
        username: form.username.trim(),
        password: form.password,
      });
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
      const qs = await invoke("get_security_questions_public", {
        username: forgotUsername.trim(),
      });
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
        setForgotError("Jawaban salah. Coba lagi.");
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

  const logoSrc = toko?.logo_path ? convertFileSrc(toko.logo_path) : null;
  const storeName = (toko?.nama_toko || "").trim();

  // ── Conditional render: CekHarga full-page or Login screen ──
  if (showCekHarga) {
    return <CekHarga onBack={() => setShowCekHarga(false)} />;
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            {logoSrc ? (
              <img src={logoSrc} alt={storeName || "Logo perusahaan"} className="login-logo" />
            ) : (
              <div className="login-logo login-logo--empty" aria-hidden="true">
                <span className="material-symbols-outlined">store</span>
              </div>
            )}
            {storeName ? (
              <h1 className="login-store-name">{storeName}</h1>
            ) : (
              <h1 className="login-store-name login-store-name--app">MikroKas</h1>
            )}
            <p className="login-subtitle">Login</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                className="login-input"
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="ID Pengguna"
                autoFocus
              />
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="login-password">
                Password
              </label>
              <div className="login-input-wrap">
                <input
                  id="login-password"
                  className="login-input login-input--password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <span className="material-symbols-outlined">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            {error ? (
              <p role="alert" className="login-error">
                {error}
              </p>
            ) : null}

            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="material-symbols-outlined login-spin">progress_activity</span>
                  Memproses…
                </>
              ) : (
                <>
                  Masuk
                  <span className="material-symbols-outlined">login</span>
                </>
              )}
            </button>

            <div className="login-links">
              <button type="button" className="login-forgot" onClick={() => setShowForgot(true)}>
                Lupa Password?
              </button>
              <span className="login-hint">
                <span className="material-symbols-outlined">keyboard_return</span>
                Enter untuk masuk
              </span>
            </div>
          </form>

          <footer className="login-footer">
            <p className="login-copyright">© {new Date().getFullYear()} MikroKas</p>
          </footer>
        </div>

        <div className="login-help-chip">
          <span className="material-symbols-outlined">info</span>
          <span>Hubungi admin toko jika kendala login berlanjut.</span>
        </div>
      </div>

      {showForgot && (
        <div
          className="login-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && resetForgot()}
        >
          <div className="login-modal" role="dialog" aria-modal="true" aria-label="Lupa password">
            {forgotStep === 1 && (
              <>
                <h2 className="login-modal-title">Lupa Password</h2>
                <p className="login-modal-desc">
                  Masukkan username untuk memuat pertanyaan keamanan.
                </p>
                <label className="login-label" htmlFor="forgot-username">
                  Username
                </label>
                <input
                  id="forgot-username"
                  className="login-input"
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  placeholder="Username"
                  autoFocus
                />
                {forgotError ? <p className="login-error">{forgotError}</p> : null}
                <div className="login-modal-actions">
                  <button type="button" className="btn-secondary" onClick={resetForgot}>
                    Batal
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleForgotStart}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? "Memuat..." : "Lanjut"}
                  </button>
                </div>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <h2 className="login-modal-title">Pertanyaan Keamanan</h2>
                <p className="login-modal-desc">Jawab pertanyaan untuk mereset password.</p>
                {forgotQuestions.map((q, idx) => (
                  <div key={idx} className="login-field" style={{ marginBottom: 12 }}>
                    <label className="login-label">{q.pertanyaan || String(q)}</label>
                    <input
                      className="login-input"
                      value={forgotAnswers[idx] || ""}
                      onChange={(e) => {
                        const next = [...forgotAnswers];
                        next[idx] = e.target.value;
                        setForgotAnswers(next);
                      }}
                      placeholder="Jawaban"
                    />
                  </div>
                ))}
                {forgotError ? <p className="login-error">{forgotError}</p> : null}
                <div className="login-modal-actions">
                  <button type="button" className="btn-secondary" onClick={resetForgot}>
                    Batal
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleForgotSubmit}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? "Memverifikasi..." : "Reset Password"}
                  </button>
                </div>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <h2 className="login-modal-title login-modal-title--ok">Password Direset</h2>
                <p className="login-modal-desc">
                  Password sementara: <strong>{temporaryPassword}</strong>. Simpan, login, lalu segera
                  ubah password.
                </p>
                <button type="button" className="btn-primary" onClick={resetForgot} style={{ width: "100%" }}>
                  Kembali ke Login
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* ── FAB tombol cek harga — pojok kanan bawah ── */}
      <button
        type="button"
        aria-label="Cek Harga Produk"
        onClick={() => setShowCekHarga(true)}
        title="Cek Harga"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "var(--color-primary)",
          color: "#ffffff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(59,130,246,0.45), 0 2px 6px rgba(0,0,0,0.15)",
          zIndex: 9990,
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.boxShadow = "0 6px 22px rgba(59,130,246,0.55), 0 3px 8px rgba(0,0,0,0.18)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,130,246,0.45), 0 2px 6px rgba(0,0,0,0.15)";
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "26px" }}>point_of_sale</span>
      </button>
    </main>
  );
}
