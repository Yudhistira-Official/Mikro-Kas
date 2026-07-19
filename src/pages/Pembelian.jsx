// Pembelian — restock barang. Produk dipilih, qty diisi, simpan.
import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export default function Pembelian() {
  const { addToast } = useToast();
  const [produk, setProduk] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem("pembelianView") || "card");

  // Guard: cegah setState setelah unmount, dan jangan return Promise ke useEffect
  let cancelled = false;
  const load = () => invoke("list_produk", { onlyActive: true }).then((d) => { if (!cancelled) setProduk(d); }).catch(console.error);
  useEffect(() => { cancelled = false; load(); return () => { cancelled = true; }; }, []);
  const shown = produk.filter((p) => p.nama.toLowerCase().includes(search.toLowerCase()));
  const total = cart.reduce((sum, i) => {
    const p = produk.find((x) => x.id === i.produk_id);
    return sum + (p?.harga_beli || 0) * i.qty;
  }, 0);

  const add = (p) => setCart((old) => old.some((i) => i.produk_id === p.id) ? old.map((i) => i.produk_id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...old, { produk_id: p.id, qty: 1 }]);
  const qty = (id, delta) => setCart((old) => old.map((i) => i.produk_id === id ? { ...i, qty: i.qty + delta } : i).filter((i) => i.qty > 0));

  const submit = async () => {
    if (!cart.length) return addToast("Keranjang kosong", "error");
    setSubmitting(true);
    try {
      await invoke("buat_transaksi_pembelian", { items: cart.map((i) => ({ produk_id: i.produk_id, qty: i.qty })), catatan: null });
      setCart([]); load(); addToast("Pembelian (restock) selesai", "success");
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
    finally { setSubmitting(false); }
  };

  const toggle = () => { const next = view === "card" ? "list" : "card"; setView(next); localStorage.setItem("pembelianView", next); };
  return <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: cart.length ? "200px" : 0 }}>
    <span className="text-headline-md">Restock Barang</span>
    <div style={{ display: "flex", gap: 8 }}>
      <input className="input-field" style={{ flex: 1 }} placeholder="Cari produk..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <button className="btn-icon" onClick={toggle}><span className="material-symbols-outlined">{view === "card" ? "view_list" : "grid_view"}</span></button>
    </div>
    {view === "card" ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>{shown.map((p) => <button key={p.id} type="button" className="card" onClick={() => add(p)} style={{ border: 0, cursor: "pointer", textAlign: "left" }}><p className="text-headline-sm">{p.nama}</p><p className="text-body-md" style={{ color: "var(--color-primary)", fontWeight: 700 }}>{rupiah(p.harga_beli)}</p><p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Stok: {p.stok}</p></button>)}</div> : <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>{shown.map((p) => <button key={p.id} type="button" className="card" onClick={() => add(p)} style={{ border: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", textAlign: "left" }}><span><b>{p.nama}</b><br/><small>Stok: {p.stok}</small></span><b style={{ color: "var(--color-primary)" }}>{rupiah(p.harga_beli)}</b></button>)}</div>}
    {cart.length > 0 && <div className="cart-footer"><div className="cart-footer-inner"><div style={{ maxHeight: 120, overflow: "auto" }}>{cart.map((i) => { const p = produk.find((x) => x.id === i.produk_id); return <div key={i.produk_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}><span>{p?.nama}</span><span><button className="btn-icon" onClick={() => qty(i.produk_id, -1)}>−</button> {i.qty} <button className="btn-icon" onClick={() => qty(i.produk_id, 1)}>+</button></span></div>; })}</div><button className="btn-primary" style={{ width: "100%" }} disabled={submitting} onClick={submit}>Restock ({rupiah(total)})</button></div></div>}
  </div>;
}
