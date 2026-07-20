// ============================================================
// Riwayat.jsx — Riwayat penjualan dan editor transaksi maksimal 2 hari.
// Editor mengikuti desain Stitch: kartu ringkas + bottom sheet, tanpa library UI.
// Semua perubahan stok dihitung ulang atomik oleh Rust, bukan oleh frontend.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;
const today = () => new Date().toISOString().slice(0, 10);
const isEditable = (date) => Date.now() - new Date(`${date.replace(" ", "T")}Z`).getTime() <= 48 * 60 * 60 * 1000;

export default function Riwayat() {
  const { addToast } = useToast();
  const [dari, setDari] = useState(today);
  const [sampai, setSampai] = useState(today);
  const [list, setList] = useState([]);
  const [produk, setProduk] = useState([]);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  // Satu loader sinkron untuk useEffect; callback async tidak pernah menjadi cleanup React.
  const load = useCallback(async () => {
    try {
      const [sales, products] = await Promise.all([
        invoke("list_transaksi", { tipe: "penjualan", dariTanggal: dari, sampaiTanggal: sampai, limit: 100 }),
        invoke("list_produk", { onlyActive: true }),
      ]);
      setList(sales);
      setProduk(products);
    } catch (e) { addToast(`Gagal memuat riwayat: ${e}`, "error"); }
  }, [addToast, dari, sampai]);

  useEffect(() => { void load(); }, [load]);

  const openEditor = async (id) => {
    try {
      const data = await invoke("get_transaksi_detail", { id });
      setDetail(data);
      setQuery("");
    } catch (e) { addToast(`Gagal membuka transaksi: ${e}`, "error"); }
  };

  const changeQty = (produkId, delta) => setDetail((prev) => ({
    ...prev,
    items: prev.items.map((item) => item.produk_id === produkId ? { ...item, qty: Math.max(1, item.qty + delta) } : item),
  }));

  const removeItem = (produkId) => setDetail((prev) => ({ ...prev, items: prev.items.filter((item) => item.produk_id !== produkId) }));

  const addProduct = (p) => {
    setDetail((prev) => {
      const current = prev.items.find((item) => item.produk_id === p.id);
      const items = current
        ? prev.items.map((item) => item.produk_id === p.id ? { ...item, qty: item.qty + 1 } : item)
        : [...prev.items, { id: `new-${p.id}`, produk_id: p.id, produk_nama: p.nama, qty: 1, harga_satuan: p.harga_jual, subtotal: p.harga_jual }];
      return { ...prev, items };
    });
    setQuery("");
  };

  const saveEdit = async () => {
    if (!detail?.items.length) { addToast("Tambahkan produk atau hapus seluruh transaksi", "error"); return; }
    setSaving(true);
    try {
      await invoke("edit_transaksi_penjualan", {
        id: detail.header.id,
        input: { items: detail.items.map((item) => ({ produkId: item.produk_id, qty: item.qty })), metodeBayar: detail.header.metode_bayar, catatan: detail.header.catatan },
      });
      addToast("Penjualan dan stok berhasil diperbarui", "success");
      setDetail(null);
      await load();
    } catch (e) { addToast(`Gagal menyimpan: ${e}`, "error"); }
    finally { setSaving(false); }
  };

  const deleteSale = async () => {
    if (!detail || !window.confirm("Hapus seluruh transaksi ini? Stok akan dikembalikan.")) return;
    setSaving(true);
    try {
      await invoke("delete_transaksi_penjualan", { id: detail.header.id });
      addToast("Transaksi dihapus dan stok dikembalikan", "success");
      setDetail(null);
      await load();
    } catch (e) { addToast(`Gagal menghapus: ${e}`, "error"); }
    finally { setSaving(false); }
  };

  const matchingProduk = produk.filter((p) => query.trim() && p.nama.toLowerCase().includes(query.toLowerCase()) && !detail?.items.some((item) => item.produk_id === p.id)).slice(0, 5);
  const estimatedTotal = detail?.items.reduce((sum, item) => sum + item.qty * item.harga_satuan, 0) || 0;

  return <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
    <span className="text-headline-md">Riwayat Penjualan</span>
    <div className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "end", padding: "0.75rem" }}>
      <div style={{ flex: 1 }}><label className="input-label">Dari</label><input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
      <div style={{ flex: 1 }}><label className="input-label">Sampai</label><input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
    </div>
    {list.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">receipt_long</span><p>Tidak ada penjualan di rentang ini</p></div>
      : list.map((t) => <button key={t.id} className="card" type="button" style={{ cursor: "pointer", textAlign: "left", padding: "0.75rem", border: "1px solid var(--color-surface-border)" }} onClick={() => openEditor(t.id)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><span className="text-body-md" style={{ fontWeight: 700 }}>Penjualan #{t.id}</span><span className="chip chip-green">{t.metode_bayar}</span></div>
        <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{t.tanggal.slice(0, 16)}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="text-headline-sm" style={{ color: "var(--color-income-green)" }}>+{rupiah(t.total)}</span><span className="text-label-md" style={{ color: isEditable(t.created_at) ? "var(--color-primary)" : "var(--color-text-secondary)" }}>{isEditable(t.created_at) ? "Ketuk untuk edit" : "Terkunci (>2 hari)"}</span></div>
      </button>)}

    {detail && <div className="modal-overlay" onClick={() => !saving && setDetail(null)}><div className="modal-content" style={{ maxHeight: "90vh", overflowY: "auto", paddingBottom: "1rem" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}><div><h3 className="text-headline-md">Edit Penjualan #{detail.header.id}</h3><p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{detail.header.tanggal.slice(0, 16)}</p></div><button className="btn-icon" disabled={saving} onClick={() => setDetail(null)}><span className="material-symbols-outlined">close</span></button></div>
      {!isEditable(detail.header.created_at) ? <p className="text-body-md" style={{ color: "var(--color-expense-red)", marginTop: "1rem" }}>Transaksi lebih dari 2 hari hanya dapat dilihat.</p> : <>
        <p className="text-label-md" style={{ color: "var(--color-warning-amber)", margin: "0.75rem 0" }}>Peringatan: perubahan akan menghitung ulang stok secara otomatis.</p>
        {detail.items.map((item) => <div key={item.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.6rem 0", borderBottom: "1px solid var(--color-surface-border)" }}>
          <div style={{ flex: 1 }}><p className="text-body-md">{item.produk_nama}</p><p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{rupiah(item.harga_satuan)} / unit</p></div>
          <button className="btn-icon" onClick={() => changeQty(item.produk_id, -1)} aria-label="Kurangi jumlah"><span className="material-symbols-outlined">remove</span></button><b>{item.qty}</b><button className="btn-icon" onClick={() => changeQty(item.produk_id, 1)} aria-label="Tambah jumlah"><span className="material-symbols-outlined">add</span></button><button className="btn-icon" onClick={() => removeItem(item.produk_id)} aria-label="Hapus produk" style={{ color: "var(--color-expense-red)" }}><span className="material-symbols-outlined">delete</span></button>
        </div>)}
        <div style={{ position: "relative", marginTop: "0.75rem" }}><label className="input-label">Tambah Produk</label><input className="input-field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk..." />{matchingProduk.length > 0 && <div className="card" style={{ position: "absolute", zIndex: 2, left: 0, right: 0, padding: 0, overflow: "hidden" }}>{matchingProduk.map((p) => <button key={p.id} type="button" onClick={() => addProduct(p)} style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0.7rem", border: 0, borderBottom: "1px solid var(--color-surface-border)", background: "var(--color-surface)" }}><span>{p.nama}</span><span>{rupiah(p.harga_jual)}</span></button>)}</div>}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, margin: "1rem 0" }}><span>Estimasi Total</span><span>{rupiah(estimatedTotal)}</span></div>
        <button className="btn-secondary" disabled={saving} onClick={deleteSale} style={{ width: "100%", color: "var(--color-expense-red)", borderColor: "var(--color-expense-red)", marginBottom: "0.5rem" }}>Hapus Seluruh Transaksi</button><button className="btn-primary" disabled={saving} onClick={saveEdit} style={{ width: "100%" }}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
      </>}
    </div></div>}
  </div>;
}
