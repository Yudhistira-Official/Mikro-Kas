// Keuangan.jsx — Manajemen Keuangan Toko.
// Catat pemasukan & pengeluaran harian UMKM.
// Design ref: Stitch — Manajemen Keuangan.
import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

const kategoriList = [
  "Penjualan", "Modal", "Gaji Karyawan", "Listrik & Air",
  "Sewa Tempat", "Stok Barang", "Transportasi", "Lainnya",
];

export default function Keuangan() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("all");
  const [list, setList] = useState([]);
  const [total, setTotal] = useState({ pemasukan: 0, pengeluaran: 0 });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipe: "pemasukan", jumlah: "", kategori: "Penjualan", keterangan: "" });
  const [view, setView] = useState(() => localStorage.getItem("keuanganView") || "card");

  const load = () => {
    const dari = new Date(); dari.setDate(1);
    const sampai = new Date();
    invoke("get_ringkasan_kas", { dari: dari.toISOString().slice(0, 10), sampai: sampai.toISOString().slice(0, 10) }).then(setTotal).catch(console.error);
    invoke("list_kas").then(setList).catch(console.error);
  };

  // Guard: React 19 crash jika useEffect return Promise (bukan function).
  // load() return Promise dari .then().catch() → jangan langsung jadi callback useEffect.
  useEffect(() => { load(); }, []);

  const save = async () => {
    const jumlah = Number(form.jumlah);
    if (!jumlah || jumlah <= 0) return addToast("Nominal harus diisi", "error");
    try {
      await invoke("create_kas", {
        input: { tipe: form.tipe, kategori: form.kategori, jumlah, keterangan: form.keterangan.trim() || null, tanggal: null },
      });
      addToast("Catatan tersimpan", "success");
      setShowForm(false);
      setForm({ tipe: "pemasukan", jumlah: "", kategori: "Penjualan", keterangan: "" });
      load();
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
    }
  };

  const hapus = async (id) => {
    try { await invoke("delete_kas", { id }); load(); addToast("Terhapus", "success"); }
    catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  const toggle = () => {
    const next = view === "card" ? "list" : "card";
    setView(next);
    localStorage.setItem("keuanganView", next);
  };

  const filtered = tab === "all" ? list : list.filter((item) => item.tipe === tab);
  const saldo = total.pemasukan - total.pengeluaran;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", position: "relative", minHeight: "60dvh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="text-headline-md">Manajemen Keuangan</span>
        <button className="btn-icon" onClick={toggle} title={view === "card" ? "Tampilan List" : "Tampilan Card"}>
          <span className="material-symbols-outlined">{view === "card" ? "view_list" : "grid_view"}</span>
        </button>
      </div>

      {/* Ringkasan */}
      <div className="card" style={{ background: "var(--color-primary-container)", color: "white", textAlign: "center", padding: "1.25rem" }}>
        <p className="text-label-md" style={{ opacity: 0.8 }}>Saldo Bulan Ini</p>
        <p style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: "34px", margin: "4px 0 12px" }}>{rupiah(saldo)}</p>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          <div><p style={{ color: "var(--color-income-green)", fontWeight: 600, fontSize: "18px" }}>{rupiah(total.pemasukan)}</p><p className="text-label-md" style={{ opacity: 0.8 }}>Pemasukan</p></div>
          <div><p style={{ color: "var(--color-expense-red)", fontWeight: 600, fontSize: "18px" }}>{rupiah(total.pengeluaran)}</p><p className="text-label-md" style={{ opacity: 0.8 }}>Pengeluaran</p></div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-row" style={{ marginBottom: "0.5rem" }}>
        {[
          ["all", "Semua"],
          ["pemasukan", "Pemasukan"],
          ["pengeluaran", "Pengeluaran"],
        ].map(([key, label]) => (
          <button key={key} className={`filter-chip${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Daftar transaksi */}
      {view === "card" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", paddingBottom: "80px" }}>
          {filtered.map((item) => (
            <div key={item.id} className="card" style={{ display: "flex", flexDirection: "column", justifyBetween: "space-between", padding: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
                <span className="text-headline-sm" style={{ fontSize: "14px" }}>{item.kategori}</span>
                <span className="chip" style={{
                  background: item.tipe === "pemasukan" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                  color: item.tipe === "pemasukan" ? "var(--color-income-green)" : "var(--color-expense-red)",
                }}>
                  {item.tipe === "pemasukan" ? "Pemasukan" : "Pengeluaran"}
                </span>
              </div>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginBottom: 8 }}>{item.tanggal.slice(0, 10)}</p>
              {item.keterangan && <p className="text-body-md" style={{ fontStyle: "italic", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.keterangan}</p>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                <span className="text-headline-sm" style={{ color: item.tipe === "pemasukan" ? "var(--color-income-green)" : "var(--color-expense-red)", fontSize: "15px" }}>
                  {item.tipe === "pemasukan" ? "+" : "-"}{rupiah(item.jumlah)}
                </span>
                <button type="button" className="btn-icon" onClick={() => hapus(item.id)}>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-expense-red)" }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "80px" }}>
          {filtered.map((item) => (
            <div key={item.id} className="card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "0.75rem" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
                background: item.tipe === "pemasukan" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span className="material-symbols-outlined" style={{ color: item.tipe === "pemasukan" ? "var(--color-income-green)" : "var(--color-expense-red)" }}>
                  {item.tipe === "pemasukan" ? "arrow_downward" : "arrow_upward"}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-headline-sm" style={{ fontSize: "14px" }}>{item.kategori}</p>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{item.tanggal.slice(0, 16)}{item.keterangan ? ` · ${item.keterangan}` : ""}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="text-headline-sm" style={{ color: item.tipe === "pemasukan" ? "var(--color-income-green)" : "var(--color-expense-red)", fontSize: "14px" }}>
                  {item.tipe === "pemasukan" ? "+" : "-"}{rupiah(item.jumlah)}
                </span>
                <button type="button" className="btn-icon" onClick={() => hapus(item.id)} title="Hapus">
                  <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-expense-red)" }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {filtered.length === 0 && <p className="text-body-md" style={{ textAlign: "center", color: "var(--color-text-secondary)", padding: "2rem 0" }}>Belum ada catatan</p>}

      {/* FAB */}
      <button type="button" onClick={() => setShowForm(true)} style={{
        position: "fixed", bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", right: "16px",
        width: "56px", height: "56px", borderRadius: "50%", background: "var(--color-primary-container)", color: "white", border: "none", cursor: "pointer", zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,32,69,0.3)",
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span>
      </button>

      {/* Bottom sheet form */}
      {showForm && <>
        <div className="modal-overlay" onClick={() => setShowForm(false)} />
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "var(--color-surface)", borderRadius: "16px 16px 0 0", padding: "1.25rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.08)",
        }}>
          <p className="text-headline-md" style={{ marginBottom: "1rem" }}>Tambah Catatan Kas</p>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button className={`filter-chip${form.tipe === "pemasukan" ? " active" : ""}`} onClick={() => setForm((prev) => ({ ...prev, tipe: "pemasukan" }))} style={{ background: form.tipe === "pemasukan" ? "rgba(16,185,129,0.12)" : undefined, color: form.tipe === "pemasukan" ? "var(--color-income-green)" : undefined }}>
              Pemasukan
            </button>
            <button className={`filter-chip${form.tipe === "pengeluaran" ? " active" : ""}`} onClick={() => setForm((prev) => ({ ...prev, tipe: "pengeluaran" }))} style={{ background: form.tipe === "pengeluaran" ? "rgba(239,68,68,0.12)" : undefined, color: form.tipe === "pengeluaran" ? "var(--color-expense-red)" : undefined }}>
              Pengeluaran
            </button>
          </div>

          <input className="input-field" inputMode="numeric" placeholder="Nominal" value={form.jumlah} onChange={(e) => setForm((prev) => ({ ...prev, jumlah: e.target.value.replace(/\D/g, "") }))} style={{ marginBottom: "0.75rem" }} />

          <select className="input-field" value={form.kategori} onChange={(e) => setForm((prev) => ({ ...prev, kategori: e.target.value }))} style={{ marginBottom: "0.75rem" }}>
            {kategoriList.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>

          <input className="input-field" placeholder="Keterangan (opsional)" value={form.keterangan} onChange={(e) => setForm((prev) => ({ ...prev, keterangan: e.target.value }))} style={{ marginBottom: "1rem" }} />

          <button className="btn-primary" onClick={save} disabled={!form.jumlah} style={{ width: "100%" }}>Simpan</button>
          <button className="btn-secondary" onClick={() => setShowForm(false)} style={{ width: "100%", marginTop: "0.5rem" }}>Batal</button>
        </div>
      </>}
    </div>
  );
}
