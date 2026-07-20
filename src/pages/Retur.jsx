// ============================================================
// Retur.jsx — Retur penjualan + riwayat retur editable.
//
// Struktur halaman:
//   - Tab "Retur Baru": memilih transaksi penjualan lalu membuat retur.
//   - Tab "Riwayat Retur": melihat retur yang sudah dibuat lalu mengeditnya.
// Integrasi data:
//   - Backend `retur_penjualan` dan `update_retur_penjualan` menjaga stok,
//     transaksi_item, total transaksi, kas pengeluaran, dan tabel retur tetap sinkron.
//   - Retur tidak bisa dihapus dari Manajemen Keuangan; edit hanya dari halaman ini.
// ============================================================
import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const today = () => new Date().toISOString().slice(0, 10);

export default function Retur() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("baru");
  const [list, setList] = useState([]);
  const [riwayat, setRiwayat] = useState([]);
  const [detail, setDetail] = useState(null);
  const [editingReturId, setEditingReturId] = useState(null);
  const [returItems, setReturItems] = useState([]);
  const [alasan, setAlasan] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------
  // DATA LOAD — penjualan hari ini + riwayat retur.
  // -------------------------------------------------------
  const load = () => {
    setLoading(true);
    Promise.all([
      invoke("list_transaksi", { tipe: "penjualan", dariTanggal: today(), sampaiTanggal: today(), limit: 50 }),
      invoke("list_retur"),
    ])
      .then(([sales, returns]) => {
        setList(sales);
        setRiwayat(returns);
      })
      .catch(e => addToast(String(e), "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // -------------------------------------------------------
  // MODAL BARU — ambil detail transaksi penjualan.
  // -------------------------------------------------------
  const openDetail = async (id) => {
    try {
      const data = await invoke("get_transaksi_detail", { id });
      setEditingReturId(null);
      setDetail(data);
      setReturItems(data.items.map(i => ({ produk_id: i.produk_id, qty: 0, max: i.qty, nama: i.produk_nama, harga: i.harga_satuan })));
      setAlasan("");
    } catch (e) { addToast(String(e), "error"); }
  };

  // -------------------------------------------------------
  // MODAL EDIT — ambil detail retur + transaksi asal untuk batas qty.
  // -------------------------------------------------------
  const openEditRetur = async (id) => {
    try {
      const retur = await invoke("get_retur_detail", { id });
      const transaksi = await invoke("get_transaksi_detail", { id: retur.header.transaksi_id });
      const qtyTersisa = new Map(transaksi.items.map(i => [i.produk_id, i.qty]));
      setEditingReturId(id);
      setDetail({ header: { id: retur.header.transaksi_id } });
      setReturItems(retur.items.map(i => ({
        produk_id: i.produk_id,
        qty: i.qty,
        max: (qtyTersisa.get(i.produk_id) || 0) + i.qty,
        nama: i.produk_nama,
        harga: i.harga_satuan,
      })));
      setAlasan(retur.header.alasan || "");
    } catch (e) { addToast(String(e), "error"); }
  };

  const closeModal = () => {
    if (submitting) return;
    setDetail(null);
    setEditingReturId(null);
    setReturItems([]);
    setAlasan("");
  };

  // -------------------------------------------------------
  // QTY — tombol +/- menjaga qty tetap 0..max.
  // -------------------------------------------------------
  const setQty = (produk_id, delta) => {
    setReturItems(prev => prev.map(i => i.produk_id === produk_id ? { ...i, qty: Math.max(0, Math.min(i.max, i.qty + delta)) } : i));
  };

  // -------------------------------------------------------
  // SUBMIT — create/edit lewat command Rust yang atomic.
  // -------------------------------------------------------
  const submit = async () => {
    const items = returItems.filter(i => i.qty > 0).map(i => ({ produk_id: i.produk_id, qty: i.qty }));
    if (!items.length) return addToast("Pilih minimal satu item retur", "error");
    setSubmitting(true);
    try {
      const payload = { items, alasan: alasan.trim() || null };
      const res = editingReturId
        ? await invoke("update_retur_penjualan", { returId: editingReturId, ...payload })
        : await invoke("retur_penjualan", { transaksiId: detail.header.id, ...payload });
      addToast(`${editingReturId ? "Retur diperbarui" : "Retur berhasil"}: ${rupiah(res.total)}`, "success");
      closeModal();
      load();
    } catch (e) { addToast(String(e), "error"); }
    finally { setSubmitting(false); }
  };

  const totalRetur = returItems.reduce((sum, i) => sum + i.qty * i.harga, 0);

  return <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
    <div>
      <h2 className="text-headline-md">Retur Penjualan</h2>
      <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Buat retur baru atau edit riwayat retur.</p>
    </div>

    <div className="filter-row">
      <button className={`filter-chip${tab === "baru" ? " active" : ""}`} onClick={() => setTab("baru")}>Retur Baru</button>
      <button className={`filter-chip${tab === "riwayat" ? " active" : ""}`} onClick={() => setTab("riwayat")}>Riwayat Retur</button>
    </div>

    {loading ? <div className="loading-page"><div className="spinner" /></div> : tab === "baru" ? (
      list.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">assignment_return</span><p>Belum ada penjualan hari ini</p></div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {list.map(t => <button key={t.id} className="card" type="button" onClick={() => openDetail(t.id)} style={{ textAlign: "left", border: "1px solid var(--color-surface-border)", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>Penjualan #{t.id}</b>
              <b style={{ color: "var(--color-income-green)" }}>{rupiah(t.total)}</b>
            </div>
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{t.tanggal.slice(0, 16)} · {t.metode_bayar}</p>
          </button>)}
        </div>
      )
    ) : (
      riwayat.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">history</span><p>Belum ada riwayat retur</p></div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {riwayat.map(r => <button key={r.id} className="card" type="button" onClick={() => openEditRetur(r.id)} style={{ textAlign: "left", border: "1px solid var(--color-surface-border)", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>Retur #{r.id}</b>
              <b style={{ color: "var(--color-expense-red)" }}>{rupiah(r.total_refund)}</b>
            </div>
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Penjualan #{r.transaksi_id} · {String(r.created_at).slice(0, 16)}</p>
            {r.alasan && <p className="text-body-md" style={{ marginTop: "0.25rem" }}>{r.alasan}</p>}
          </button>)}
        </div>
      )
    )}

    {detail && <div className="modal-overlay" onClick={closeModal}><div className="modal-content" onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="text-headline-md">{editingReturId ? `Edit Retur #${editingReturId}` : `Retur #${detail.header.id}`}</h3>
        <button className="btn-icon" onClick={closeModal}><span className="material-symbols-outlined">close</span></button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
        {returItems.map(i => <div key={i.produk_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--color-surface-border)" }}>
          <div><p className="text-body-md">{i.nama}</p><p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Maks {i.max} · {rupiah(i.harga)}</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button className="btn-icon" onClick={() => setQty(i.produk_id, -1)}>−</button>
            <b>{i.qty}</b>
            <button className="btn-icon" onClick={() => setQty(i.produk_id, 1)}>+</button>
          </div>
        </div>)}
      </div>
      <label className="input-label" style={{ marginTop: "1rem" }}>Alasan Retur</label>
      <input className="input-field" value={alasan} onChange={e => setAlasan(e.target.value)} placeholder="Contoh: barang rusak" />
      <div style={{ display: "flex", justifyContent: "space-between", margin: "1rem 0", fontWeight: 700 }}><span>Total Refund</span><span>{rupiah(totalRetur)}</span></div>
      <button className="btn-primary" style={{ width: "100%" }} disabled={submitting || totalRetur <= 0} onClick={submit}>{editingReturId ? "Simpan Perubahan Retur" : "Proses Retur"}</button>
    </div></div>}
  </div>;
}
