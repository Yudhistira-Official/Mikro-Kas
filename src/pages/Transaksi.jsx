// Kasir — pencatatan produk terjual saja.
import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export default function Transaksi() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [produk, setProduk] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [metodeBayar, setMetodeBayar] = useState("tunai");
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem("kasirView") || "card");

  // Guard: cegah setState setelah unmount
  let cancelled = false;
  const load = () => invoke("list_produk", { onlyActive: true }).then((d) => { if (!cancelled) setProduk(d); }).catch(console.error);
  useEffect(() => { cancelled = false; load(); return () => { cancelled = true; }; }, []);
  const shown = produk.filter((p) => p.stok > 0 && p.nama.toLowerCase().includes(search.toLowerCase()));
  const total = cart.reduce((sum, item) => sum + (produk.find((p) => p.id === item.produk_id)?.harga_jual || 0) * item.qty, 0);

  const add = (p) => setCart((old) => old.some((i) => i.produk_id === p.id) ? old.map((i) => i.produk_id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...old, { produk_id: p.id, qty: 1 }]);
  const qty = (id, delta) => setCart((old) => old.map((i) => i.produk_id === id ? { ...i, qty: i.qty + delta } : i).filter((i) => i.qty > 0));

  const submit = async () => {
    if (!cart.length) return addToast("Keranjang kosong", "error");
    setSubmitting(true);
    try {
      const r = await invoke("buat_transaksi_penjualan", { items: cart, metodeBayar, catatan: null });
      setCart([]); load(); addToast(`Penjualan selesai: ${rupiah(r.total)}`, "success");
      if (metodeBayar === "qris") navigate(`/qris?nominal=${r.total}&transaksiId=${r.transaksi_id}`);
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
    finally { setSubmitting(false); }
  };

  const toggle = () => { const next = view === "card" ? "list" : "card"; setView(next); localStorage.setItem("kasirView", next); };
  return <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: cart.length ? "260px" : 0 }}>
    <div style={{ display: "flex", gap: 8 }}>
      <input className="input-field" style={{ flex: 1 }} placeholder="Cari produk..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <button className="btn-icon" onClick={toggle}><span className="material-symbols-outlined">{view === "card" ? "view_list" : "grid_view"}</span></button>
    </div>
    {view === "card" ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>{shown.map((p) => <button key={p.id} type="button" className="card" onClick={() => add(p)} style={{ textAlign: "left", border: 0, cursor: "pointer" }}><p className="text-headline-sm">{p.nama}</p><p className="text-body-md" style={{ color: "var(--color-primary)", fontWeight: 700 }}>{rupiah(p.harga_jual)}</p><p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Stok: {p.stok}</p></button>)}</div> : <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>{shown.map((p) => <button key={p.id} type="button" className="card" onClick={() => add(p)} style={{ border: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", textAlign: "left" }}><span><b>{p.nama}</b><br/><small>Stok: {p.stok}</small></span><b style={{ color: "var(--color-primary)" }}>{rupiah(p.harga_jual)}</b></button>)}</div>}
    {cart.length > 0 && <div className="cart-footer"><div className="cart-footer-inner"><div style={{ maxHeight: 130, overflow: "auto" }}>{cart.map((i) => { const p = produk.find((x) => x.id === i.produk_id); return <div key={i.produk_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}><span>{p?.nama}</span><span><button className="btn-icon" onClick={() => qty(i.produk_id, -1)}>−</button> {i.qty} <button className="btn-icon" onClick={() => qty(i.produk_id, 1)}>+</button></span></div>; })}</div><div className="filter-row"><button className={`filter-chip${metodeBayar === "tunai" ? " active" : ""}`} onClick={() => setMetodeBayar("tunai")}>Tunai</button><button className={`filter-chip${metodeBayar === "qris" ? " active" : ""}`} onClick={() => setMetodeBayar("qris")}>QRIS</button></div><button className="btn-primary" style={{ width: "100%" }} disabled={submitting} onClick={submit}>Bayar {rupiah(total)}</button></div></div>}
  </div>;
}
