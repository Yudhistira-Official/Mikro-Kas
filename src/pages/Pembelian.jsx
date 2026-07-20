// ============================================================
// Pembelian.jsx — Restock barang (pembelian stok dari supplier)
//
// Fitur:
//   - Cari produk berdasarkan nama
//   - Pilih produk → masuk keranjang restock
//   - Qty bisa diinput manual ATAU tombol - / +
//   - Total otomatis dari harga_beli × qty
//   - Submit → invoke buat_transaksi_pembelian
//
// Logging:
//   Setiap aktivitas (load, add cart, qty change, submit, error)
//   dicatat ke file log Rust via invoke("write_log").
//
// Catatan: tidak ada diskon di restock (beda dengan Kasir).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

// Helper format rupiah dari angka integer.
const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export default function Pembelian() {
  // Hook toast untuk notifikasi sukses/error.
  const { addToast } = useToast();

  // --- State data ---
  const [produk, setProduk] = useState([]);        // Daftar produk aktif
  const [search, setSearch] = useState("");         // Filter pencarian produk
  const [cart, setCart] = useState([]);             // Item keranjang: [{produk_id, qty}]
  const [submitting, setSubmitting] = useState(false); // Flag disable tombol saat submit
  const [view, setView] = useState(() => localStorage.getItem("pembelianView") || "card"); // card | list

  // Flag guard: cegah setState setelah unmount.
  let cancelled = false;

  // -------------------------------------------------------
  // LOGGING HELPER — kirim ke file log Rust dengan prefix RESTOCK.
  // -------------------------------------------------------
  const log = (msg) => {
    try { invoke("write_log", { msg: `RESTOCK: ${msg}` }).catch(() => {}); } catch {}
  };

  // -------------------------------------------------------
  // LOAD — ambil produk aktif dari backend.
  // -------------------------------------------------------
  const load = async () => {
    log("memuat data produk");
    try {
      const data = await invoke("list_produk", { onlyActive: true });
      if (!cancelled) {
        setProduk(data);
        log(`data dimuat; produk=${data.length}`);
      }
    } catch (e) {
      addToast(String(e), "error");
      log(`gagal memuat data: ${String(e).slice(0, 200)}`);
    }
  };

  // Mount: load data. Unmount: set cancelled flag.
  useEffect(() => {
    cancelled = false;
    log("halaman restock dimuat");
    load();
    return () => {
      cancelled = true;
      log("halaman restock di-unmount");
    };
  }, []);

  // -------------------------------------------------------
  // FILTER PRODUK — tampilkan produk yang match search.
  // -------------------------------------------------------
  const shown = useMemo(
    () => produk.filter((p) => p.nama.toLowerCase().includes(search.toLowerCase())),
    [produk, search],
  );

  // -------------------------------------------------------
  // HITUNG TOTAL — subtotal cart berdasarkan harga_beli.
  // -------------------------------------------------------
  const total = cart.reduce(
    (sum, i) => sum + (produk.find((x) => x.id === i.produk_id)?.harga_beli || 0) * i.qty,
    0,
  );

  // -------------------------------------------------------
  // ADD — tambah produk ke keranjang (+1 qty).
  // -------------------------------------------------------
  const add = (p) => {
    log(`tambah ke cart: id=${p.id}; nama=${p.nama}`);
    setCart((old) =>
      old.some((i) => i.produk_id === p.id)
        ? old.map((i) => (i.produk_id === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...old, { produk_id: p.id, qty: 1 }],
    );
  };

  // -------------------------------------------------------
  // QTY — ubah kuantitas item di cart (+1 / -1, hapus jika 0).
  // -------------------------------------------------------
  const qty = (id, delta) =>
    setCart((old) =>
      old
        .map((i) => (i.produk_id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );

  // -------------------------------------------------------
  // SUBMIT — checkout restock ke backend.
  // -------------------------------------------------------
  const submit = async () => {
    if (!cart.length) {
      addToast("Keranjang kosong", "error");
      return;
    }
    setSubmitting(true);
    log(`checkout restock dimulai; items=${cart.length}; total=${total}`);
    try {
      await invoke("buat_transaksi_pembelian", {
        items: cart.map((i) => ({ produk_id: i.produk_id, qty: i.qty })),
        catatan: null,
      });
      log(`checkout restock sukses; total=${total}`);
      setCart([]);
      load();
      addToast("Pembelian (restock) selesai", "success");
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
      log(`checkout restock gagal: ${String(e).slice(0, 200)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------
  // TOGGLE VIEW — switch antara grid card dan list view.
  // -------------------------------------------------------
  const toggle = () => {
    const next = view === "card" ? "list" : "card";
    setView(next);
    localStorage.setItem("pembelianView", next);
  };

  // -------------------------------------------------------
  // RENDER — UI restock: search bar, produk grid, cart footer.
  // -------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: cart.length ? "280px" : 0 }}>
      <span className="text-headline-md">Restock Barang</span>

      {/* Search bar + toggle view */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input-field"
          style={{ flex: 1 }}
          placeholder="Cari produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-icon" onClick={toggle} title="Ganti tampilan">
          <span className="material-symbols-outlined">{view === "card" ? "view_list" : "grid_view"}</span>
        </button>
      </div>

      {/* Grid produk (card view) */}
      {view === "card" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card"
              onClick={() => add(p)}
              style={{ textAlign: "left", border: 0, cursor: "pointer" }}
            >
              <p className="text-headline-sm">{p.nama}</p>
              <p className="text-body-md" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
                {rupiah(p.harga_beli)}
              </p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                Stok: {p.stok}
              </p>
            </button>
          ))}
        </div>
      ) : (
        /* List produk (list view) */
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card"
              onClick={() => add(p)}
              style={{ border: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", textAlign: "left" }}
            >
              <span>
                <b>{p.nama}</b>
                <br />
                <small>Stok: {p.stok}</small>
              </span>
              <b style={{ color: "var(--color-primary)" }}>{rupiah(p.harga_beli)}</b>
            </button>
          ))}
        </div>
      )}

      {/* Cart footer — fixed di bawah saat ada item */}
      {cart.length > 0 && (
        <div className="cart-footer">
          <div className="cart-footer-inner">
            {/* Daftar item di cart dengan tombol - [input manual] + */}
            <div style={{ maxHeight: 130, overflow: "auto" }}>
              {cart.map((i) => {
                const p = produk.find((x) => x.id === i.produk_id);
                return (
                  <div
                    key={i.produk_id}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}
                  >
                    <span>{p?.nama}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {/* Tombol kurangi qty */}
                      <button className="btn-icon" type="button" onClick={() => qty(i.produk_id, -1)} aria-label="kurangi qty">
                        −
                      </button>
                      {/* Input qty manual — angka bisa diketik langsung */}
                      <input
                        className="input-field"
                        style={{ width: 56, textAlign: "center", padding: "8px 6px" }}
                        inputMode="numeric"
                        value={i.qty}
                        onChange={(e) => {
                          const next = Number(String(e.target.value).replace(/\D/g, ""));
                          if (Number.isNaN(next)) return;
                          setCart((old) => old.map((x) => x.produk_id === i.produk_id ? { ...x, qty: Math.max(1, next || 1) } : x));
                          log(`qty manual diubah; produk_id=${i.produk_id}; qty=${Math.max(1, next || 1)}`);
                        }}
                        aria-label="qty manual"
                      />
                      {/* Tombol tambah qty */}
                      <button className="btn-icon" type="button" onClick={() => qty(i.produk_id, 1)} aria-label="tambah qty">
                        +
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Ringkasan total */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 15 }}>
              <span>Total Restock</span>
              <b style={{ textAlign: "right" }}>{rupiah(total)}</b>
            </div>

            {/* Tombol submit — trigger checkout restock */}
            <button
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={submitting}
              onClick={submit}
            >
              Restock ({rupiah(total)})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
