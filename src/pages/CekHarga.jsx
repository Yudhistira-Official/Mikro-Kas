import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";

/**
 * CekHarga — full-page price checker, no auth required.
 * Uses list_produk_kasir (no auth check).
 * Design: search box → results table (nama + harga).
 * Back button → return to Login.
 */
export default function CekHarga({ onBack }) {
  const [search, setSearch] = useState("");
  const [produk, setProduk] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProduk();
  }, []);

  /**
   * Load all produk via list_produk_kasir (no auth).
   */
  async function loadProduk() {
    setLoading(true);
    try {
      const list = await invoke("list_produk_kasir");
      setProduk(list || []);
    } catch (err) {
      console.error("Load produk gagal:", err);
      setProduk([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Filter produk by search query (nama or barcode).
   */
  const filtered = produk.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const nama = (p.nama_produk || "").toLowerCase();
    const barcode = (p.barcode || "").toLowerCase();
    return nama.includes(q) || barcode.includes(q);
  });

  /**
   * Format Rupiah for display.
   */
  function formatRupiah(value) {
    if (value == null || isNaN(value)) return "Rp 0";
    return `Rp ${Number(value).toLocaleString("id-ID")}`;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        flexDirection: "column",
        padding: "24px",
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      }}
    >
      {/* Header dengan tombol kembali */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali ke Login"
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.3)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.2)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
            arrow_back
          </span>
        </button>

        <h1
          style={{
            marginLeft: "16px",
            fontSize: "28px",
            fontWeight: "700",
            color: "#fff",
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          Cek Harga Produk
        </h1>
      </div>

      {/* Search box */}
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: "16px",
          padding: "20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          marginBottom: "24px",
        }}
      >
        <div style={{ position: "relative" }}>
          <span
            className="material-symbols-outlined"
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#9ca3af",
              fontSize: "24px",
              pointerEvents: "none",
            }}
          >
            search
          </span>
          <input
            type="text"
            placeholder="Cari nama produk atau barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "14px 14px 14px 50px",
              fontSize: "16px",
              border: "2px solid #e5e7eb",
              borderRadius: "12px",
              outline: "none",
              transition: "border-color 0.2s",
              fontFamily: "inherit",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--color-primary, #3B82F6)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e5e7eb";
            }}
          />
        </div>
      </div>

      {/* Results table */}
      <div
        style={{
          flex: 1,
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: "16px",
          padding: "20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          overflowY: "auto",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "48px", animation: "spin 1s linear infinite" }}>
              progress_activity
            </span>
            <p style={{ marginTop: "12px", fontSize: "14px" }}>Memuat produk...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "48px" }}>
              inventory_2
            </span>
            <p style={{ marginTop: "12px", fontSize: "14px" }}>
              {search.trim() ? "Produk tidak ditemukan" : "Tidak ada produk"}
            </p>
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "15px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: "600",
                    color: "#374151",
                    background: "#f9fafb",
                  }}
                >
                  Nama Produk
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: "600",
                    color: "#374151",
                    background: "#f9fafb",
                    width: "200px",
                  }}
                >
                  Barcode
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "right",
                    fontWeight: "600",
                    color: "#374151",
                    background: "#f9fafb",
                    width: "180px",
                  }}
                >
                  Harga
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f9fafb";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td
                    style={{
                      padding: "14px 16px",
                      color: "#111827",
                      fontWeight: "500",
                    }}
                  >
                    {p.nama_produk || "-"}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      color: "#6b7280",
                      fontFamily: "monospace",
                    }}
                  >
                    {p.barcode || "-"}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      textAlign: "right",
                      color: "var(--color-primary, #3B82F6)",
                      fontWeight: "600",
                      fontSize: "16px",
                    }}
                  >
                    {formatRupiah(p.harga_jual)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
