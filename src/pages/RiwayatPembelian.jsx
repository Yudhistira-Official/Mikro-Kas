// ============================================================
// RiwayatPembelian.jsx — Riwayat pembelian supplier + filter
//
// Menampilkan daftar transaksi pembelian dengan info supplier,
// total, tanggal, dan item detail. Mendukung filter tanggal
// serta pencarian nama supplier untuk keperluan audit pembelian.
// ============================================================
import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function RiwayatPembelian() {
  const { addToast } = useToast();
  const [dari, setDari] = useState(today);
  const [sampai, setSampai] = useState(today);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await invoke("list_transaksi", { tipe: "pembelian", dariTanggal: dari, sampaiTanggal: sampai, limit: 100 });
      setList(data);
    } catch (e) { addToast(`Gagal memuat riwayat pembelian: ${e}`, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [dari, sampai]);

  const filtered = list.filter((t) => {
    if (!query.trim()) return true;
    return (t.supplier_nama || "").toLowerCase().includes(query.toLowerCase()) ||
           (t.catatan || "").toLowerCase().includes(query.toLowerCase()) ||
           String(t.id).includes(query);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <p className="text-headline-md">Riwayat Pembelian Supplier</p>
      <p className="text-body-sm" style={{ color: "var(--color-text-secondary)", marginTop: "-0.25rem" }}>Daftar transaksi restock dari supplier.</p>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", padding: "0.75rem" }}>
        <div><label className="input-label">Dari</label><input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
        <div><label className="input-label">Sampai</label><input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
      </div>

      <input className="input-field" placeholder="Cari supplier atau no. transaksi..." value={query} onChange={(e) => setQuery(e.target.value)} />

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><span className="material-symbols-outlined">local_shipping</span><p className="text-body-md">Tidak ada pembelian di rentang ini</p></div>
      ) : (
        filtered.map((t) => (
          <div key={t.id} className="card" style={{ padding: "0.75rem", borderLeft: "4px solid var(--color-secondary)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p className="text-headline-sm">Pembelian #{t.id}</p>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.2rem" }}>
                  {t.supplier_nama || "Supplier umum"}
                </p>
              </div>
              <span className="chip chip-cyan">Tunai</span>
            </div>
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>{t.tanggal?.slice(0, 16)}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
              <span className="text-headline-sm" style={{ color: "var(--color-income-green)" }}>{rupiah(t.total)}</span>
              {t.catatan && <span className="text-label-md" style={{ color: "var(--color-text-secondary)", maxWidth: "60%", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.catatan}</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
