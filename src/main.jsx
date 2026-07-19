// ============================================================
// main.jsx — Entrypoint aplikasi React
// Browser Router di-wrap, StrictMode dihapus demi stabilitas Android WebView
// ============================================================
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    {/* ErrorBoundary di root level untuk menangkap fatal crash */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </BrowserRouter>
);
