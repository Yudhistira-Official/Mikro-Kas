// ============================================================
// ErrorBoundary.jsx — Tangkap error render komponen anak
// Mencegah white screen: tampilkan fallback + tombol Retry
// ============================================================
import { Component } from "react";
import { invoke } from "../utils/ipc";
import { withRouter } from "../hooks/withRouter";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Catat error agar bisa ditampilkan ke user
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log ke Rust logger agar tercatat di mikrokas_log.txt
    try {
      const msg = `ERROR: ErrorBoundary ${error?.toString()?.slice(0,300)} | stack: ${error?.stack?.slice(0,300) || ""}`;
      invoke("write_log", { msg }).catch(() => {});
    } catch(_) {}
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleRetry = () => {
    // Reset error state → React coba re-render ulang komponen anak
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    // Reset error + navigasi ke halaman utama
    this.setState({ hasError: false, error: null });
    if (this.props.navigate) {
      this.props.navigate("/");
    }
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI saat terjadi error — bukan white screen
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100dvh",
            padding: "2rem",
            textAlign: "center",
            gap: "1rem",
            background: "var(--color-background)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "48px", color: "var(--color-error)" }}
          >
            error_outline
          </span>
          <h2 className="text-headline-md">Terjadi Kesalahan</h2>
          <p
            className="text-body-md"
            style={{ color: "var(--color-text-secondary)", maxWidth: "320px" }}
          >
            Aplikasi mengalami kendala saat memuat halaman ini.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
                background: "var(--color-surface-container-high)",
                padding: "0.75rem",
                borderRadius: "8px",
                maxWidth: "100%",
                overflow: "auto",
                wordBreak: "break-all",
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="btn-primary"
              onClick={this.handleRetry}
              style={{ padding: "0.75rem 1.5rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                refresh
              </span>{" "}
              Coba Lagi
            </button>
            <button
              className="btn-secondary"
              onClick={this.handleGoHome}
              style={{ padding: "0.75rem 1.5rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                home
              </span>{" "}
              Beranda
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================
// withRouter — HOC wrapper untuk akses navigate di class component
// ============================================================
export default withRouter(ErrorBoundary);
