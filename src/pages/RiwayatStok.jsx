// ============================================================
// RiwayatStok.jsx — Riwayat penyesuaian stok / audit trail.
//
// Pola utama:
//   - Menampilkan catatan penyesuaian stok manual (opname, rusak, dll).
//   - Total stok masuk (selisih > 0) dan stok keluar (selisih < 0).
//   - Link navigasi cepat untuk melakukan penyesuaian stok baru.
// ============================================================
import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { Link } from "react-router-dom";

export default function RiwayatStok() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await invoke("list_stock_adjustments");
      setList(data);
    } catch (e) {
      addToast(`Gagal memuat riwayat stok: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Agregasi summary
  const totalAdjustments = list.length;
  const totalMasuk = list.filter(x => x.selisih > 0).reduce((sum, x) => sum + x.selisih, 0);
  const totalKeluar = list.filter(x => x.selisih < 0).reduce((sum, x) => sum + Math.abs(x.selisih), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="text-headline-md">Riwayat & Audit Stok</h2>
        <Link to="/produk" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "6px", textDecoration: "none", fontSize: "13px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>inventory</span>
          Sesuaikan Stok
        </Link>
      </div>

      {/* Summary Cards sesuai desain Stitch */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
        <div className="card" style={{ textAlign: "center", padding: "0.75rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
          <p className="text-label-md" style={{ opacity: 0.85, fontSize: "11px" }}>Total Audit</p>
          <p className="text-headline-sm" style={{ margin: "4px 0 0 0" }}>{totalAdjustments} Kali</p>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "0.75rem", background: "var(--color-surface-container-high)", border: "1px solid var(--color-surface-border)", borderRadius: "12px" }}>
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)", fontSize: "11px" }}>Stok Masuk</p>
          <p className="text-headline-sm" style={{ margin: "4px 0 0 0", color: "var(--color-success-green)" }}>+{totalMasuk} unit</p>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "0.75rem", background: "var(--color-surface-container-high)", border: "1px solid var(--color-surface-border)", borderRadius: "12px" }}>
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)", fontSize: "11px" }}>Stok Keluar</p>
          <p className="text-headline-sm" style={{ margin: "4px 0 0 0", color: "var(--color-expense-red)" }}>-{totalKeluar} unit</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">inventory</span>
          <p>Belum ada riwayat penyesuaian stok</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
          {list.map((item) => (
            <div key={item.id} className="list-dense-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", borderBottom: "1px solid var(--color-surface-border)" }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: "0.5rem" }}>
                <p className="text-headline-sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.produk_nama}</p>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
                  <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                    {item.stok_sebelum} → {item.stok_sesudah} unit
                  </span>
                  {item.alasan && (
                    <span className="text-label-md" style={{ background: "var(--color-surface-container-high)", padding: "1px 6px", borderRadius: "4px", fontSize: "10px" }}>
                      Alasan: {item.alasan}
                    </span>
                  )}
                </div>
                <p className="text-label-md" style={{ color: "var(--color-text-tertiary)", marginTop: "2px", fontSize: "10px" }}>
                  {item.created_at}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong style={{ fontSize: "15px", color: item.selisih > 0 ? "var(--color-success-green)" : "var(--color-expense-red)" }}>
                  {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
                </strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
