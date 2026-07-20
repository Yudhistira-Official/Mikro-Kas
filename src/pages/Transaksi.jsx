// ============================================================
// Transaksi.jsx — Halaman Kasir utama MikroKas
//
// Fitur:
//   - Cari produk berdasarkan nama / SKU
//   - Scan barcode/SKU via BarcodeScanner (native picker, bukan getUserMedia)
//   - Pilih customer (opsional)
//   - Diskon nominal (opsional)
//   - Metode bayar: tunai / QRIS
//   - Checkout → invoke buat_transaksi_penjualan
//
// Logging:
//   Setiap aktivitas (load, scan, add cart, checkout, error)
//   dicatat ke file log Rust via invoke("write_log").
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import BarcodeScanner from "../components/BarcodeScanner";

// Helper format rupiah dari angka integer.
const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export default function Transaksi() {
  // Hook toast untuk notifikasi sukses/error.
  const { addToast } = useToast();
  // Hook navigate untuk redirect setelah checkout QRIS.
  const navigate = useNavigate();

  // --- State data ---
  const [produk, setProduk] = useState([]);       // Daftar produk aktif
  const [customers, setCustomers] = useState([]); // Daftar customer untuk dropdown
  const [search, setSearch] = useState("");       // Filter pencarian produk
  const [cart, setCart] = useState([]);            // Item keranjang: [{produk_id, qty}]
  const [metodeBayar, setMetodeBayar] = useState("tunai"); // tunai | qris
  const [customerId, setCustomerId] = useState("");       // ID customer terpilih (opsional)
  const [diskonTipe, setDiskonTipe] = useState("nominal");   // "nominal" | "persen"
  const [diskonValue, setDiskonValue] = useState("");          // Angka input (nominal Rp atau persen %)
  const [submitting, setSubmitting] = useState(false);     // Flag disable tombol saat checkout
  const [view, setView] = useState(() => localStorage.getItem("kasirView") || "card"); // card | list
  const [scanOpen, setScanOpen] = useState(false); // Kontrol modal BarcodeScanner
  const [cartCollapsed, setCartCollapsed] = useState(false);

  // Flag guard: cegah setState setelah unmount (crash saat cepat ganti tab).
  let cancelled = false;

  // -------------------------------------------------------
  // LOGGING HELPER — kirim ke file log Rust dengan prefix KASIR.
  // -------------------------------------------------------
  const log = (msg) => {
    try { invoke("write_log", { msg: `KASIR: ${msg}` }).catch(() => {}); } catch {}
  };

  // -------------------------------------------------------
  // LOAD — ambil produk aktif + customer dari backend.
  // -------------------------------------------------------
  const load = async () => {
    log("memuat data produk + customer");
    try {
      const [produkData, customerData] = await Promise.all([
        invoke("list_produk", { onlyActive: true }),
        invoke("list_customer"),
      ]);
      if (!cancelled) {
        setProduk(produkData);
        setCustomers(customerData);
        log(`data dimuat; produk=${produkData.length}; customer=${customerData.length}`);
      }
    } catch (e) {
      addToast(String(e), "error");
      log(`gagal memuat data: ${String(e).slice(0, 200)}`);
    }
  };

  // Mount: load data. Unmount: set cancelled flag.
  useEffect(() => {
    cancelled = false;
    log("halaman kasir dimuat");
    load();
    return () => {
      cancelled = true;
      log("halaman kasir di-unmount");
    };
  }, []);

  // -------------------------------------------------------
  // FILTER PRODUK — tampilkan hanya stok > 0 yang match search.
  // -------------------------------------------------------
  const shown = useMemo(
    () =>
      produk.filter(
        (p) =>
          p.stok > 0 &&
          `${p.nama} ${p.sku || ""}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [produk, search],
  );

  // -------------------------------------------------------
  // HITUNG TOTAL — subtotal cart, diskon, total akhir.
  // -------------------------------------------------------
  const total = cart.reduce(
    (sum, item) => sum + (produk.find((p) => p.id === item.produk_id)?.harga_jual || 0) * item.qty,
    0,
  );
  // Diskon bisa nominal Rp atau persen %.
  const diskonValueNumber = Number(diskonValue || 0);
  const diskonNominal = diskonTipe === "persen"
    ? Math.min(total, Math.round((total * diskonValueNumber) / 100))
    : Math.min(total, diskonValueNumber);
  const totalAkhir = total - diskonNominal;

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
  // ADD BY BARCODE — cari produk by SKU dari hasil scan.
  // Dipanggil oleh BarcodeScanner onDetected callback.
  // -------------------------------------------------------
  const addByBarcode = (kode) => {
    log(`scan barcode diterima: kode=${String(kode).slice(0, 60)}`);
    const found = produk.find((p) => String(p.sku || "").trim() === String(kode).trim());
    if (!found) {
      addToast(`Barcode/SKU "${kode}" tidak ditemukan`, "error");
      log(`barcode tidak cocok produk manapun: kode=${String(kode).slice(0, 60)}`);
      return;
    }
    add(found);
    addToast(`${found.nama} masuk keranjang`, "success");
    log(`barcode cocok: id=${found.id}; nama=${found.nama}`);
  };

  // -------------------------------------------------------
  // SUBMIT — checkout penjualan ke backend.
  // Kirim cart, metode bayar, diskon, customer_id.
  // -------------------------------------------------------
  const submit = async () => {
    if (!cart.length) {
      addToast("Keranjang kosong", "error");
      return;
    }
    setSubmitting(true);
    log(`checkout dimulai; items=${cart.length}; metode=${metodeBayar}; diskon=${diskonNominal}; customer=${customerId || "none"}`);

    try {
      const payload = {
        items: cart,
        metodeBayar,
        catatan: null,
        diskonNominal: diskonNominal > 0 ? diskonNominal : null,
        customerId: customerId ? Number(customerId) : null,
      };
      const r = await invoke("buat_transaksi_penjualan", payload);
      log(`checkout sukses; transaksi_id=${r.transaksi_id}; total=${r.total}`);

      // Reset cart + diskon setelah sukses.
      setCart([]);
      setDiskonValue("");
      load();
      addToast(`Penjualan selesai: ${rupiah(r.total)}`, "success");

      // Redirect ke QRIS jika metode bayar QRIS.
      if (metodeBayar === "qris") {
        navigate(`/qris?nominal=${r.total}&transaksiId=${r.transaksi_id}`);
      }
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
      log(`checkout gagal: ${String(e).slice(0, 200)}`);
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
    localStorage.setItem("kasirView", next);
  };

  // -------------------------------------------------------
  // RENDER — UI kasir: search bar, filter, produk grid, cart footer.
  // -------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: cart.length ? "280px" : 0 }}>
      {/* Search bar + tombol scan barcode + toggle view */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input-field"
          style={{ flex: 1 }}
          placeholder="Cari produk / SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* Tombol buka BarcodeScanner modal */}
        <button
          className="btn-icon"
          onClick={() => {
            log("tombol scan barcode ditekan");
            setScanOpen(true);
          }}
          title="Scan Barcode"
        >
          <span className="material-symbols-outlined">qr_code_scanner</span>
        </button>
        {/* Toggle grid / list view */}
        <button className="btn-icon" onClick={toggle} title="Ganti tampilan">
          <span className="material-symbols-outlined">{view === "card" ? "view_list" : "grid_view"}</span>
        </button>
      </div>

      {/* Dropdown customer + input diskon */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          className="input-field"
          style={{ flex: 1, minWidth: 160 }}
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">Tanpa customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.nama}</option>
          ))}
        </select>
        <input
          className="input-field"
          style={{ width: 160 }}
          inputMode="numeric"
          placeholder="Diskon Rp"
          value={diskonValue}
          onChange={(e) => setDiskonValue(e.target.value.replace(/\D/g, ""))}
        />
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
                {rupiah(p.harga_jual)}
              </p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                Stok: {p.stok} {p.sku ? `· SKU: ${p.sku}` : ""}
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
              style={{
                border: 0,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                textAlign: "left",
              }}
            >
              <span>
                <b>{p.nama}</b>
                <br />
                <small>Stok: {p.stok} {p.sku ? `· SKU: ${p.sku}` : ""}</small>
              </span>
              <b style={{ color: "var(--color-primary)" }}>{rupiah(p.harga_jual)}</b>
            </button>
          ))}
        </div>
      )}

      {/* Cart footer — fixed di bawah saat ada item */}
      {cart.length > 0 && (
        <div className="cart-footer">
          <div className="cart-footer-inner">
            <button
              className="btn-icon"
              type="button"
              onClick={() => setCartCollapsed((v) => !v)}
              aria-label={cartCollapsed ? "buka keranjang" : "tutup keranjang"}
              style={{ alignSelf: "center", margin: "-4px auto 4px" }}
            >
              <span className="material-symbols-outlined">
                {cartCollapsed ? "keyboard_arrow_up" : "keyboard_arrow_down"}
              </span>
            </button>

            {/* Daftar item di cart dengan tombol +/- qty */}
            <div style={{ maxHeight: cartCollapsed ? 0 : 130, overflow: "auto", transition: "max-height 0.3s ease" }}>
              {cart.map((i) => {
                const p = produk.find((x) => x.id === i.produk_id);
                return (
                  <div
                    key={i.produk_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "5px 0",
                    }}
                  >
                    <span>{p?.nama}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button className="btn-icon" type="button" onClick={() => qty(i.produk_id, -1)} aria-label="kurangi qty">
                        −
                      </button>
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
                      <button className="btn-icon" type="button" onClick={() => qty(i.produk_id, 1)} aria-label="tambah qty">
                        +
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Pilihan metode pembayaran */}
            {!cartCollapsed && (
              <>
                <div className="filter-row">
                  <button
                    type="button"
                    className={`filter-chip${metodeBayar === "tunai" ? " active" : ""}`}
                    onClick={() => setMetodeBayar("tunai")}
                  >
                    Tunai
                  </button>
                  <button
                    type="button"
                    className={`filter-chip${metodeBayar === "qris" ? " active" : ""}`}
                    onClick={() => setMetodeBayar("qris")}
                  >
                    QRIS
                  </button>
                </div>

                {/* Diskon: nominal atau persen */}
                <div className="filter-row">
                  <button
                    type="button"
                    className={`filter-chip${diskonTipe === "nominal" ? " active" : ""}`}
                    onClick={() => setDiskonTipe("nominal")}
                  >
                    Rp
                  </button>
                  <button
                    type="button"
                    className={`filter-chip${diskonTipe === "persen" ? " active" : ""}`}
                    onClick={() => setDiskonTipe("persen")}
                  >
                    %
                  </button>
                </div>
              </>
            )}

            {/* Ringkasan total, diskon, total akhir */}
            {diskonValueNumber > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 13 }}>
                <span>Total</span>
                <input
                  className="input-field"
                  style={{ width: 120, textAlign: "right" }}
                  inputMode="numeric"
                  value={total}
                  readOnly
                />
              </div>
            )}
            {(!cartCollapsed || diskonValueNumber > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 13 }}>
                <span>{diskonTipe === "persen" ? "Diskon %" : "Diskon Rp"}</span>
                {cartCollapsed ? (
                  <b style={{ textAlign: "right" }}>{rupiah(diskonNominal)}</b>
                ) : (
                  <input
                    className="input-field"
                    style={{ width: 120, textAlign: "right" }}
                    inputMode="numeric"
                    placeholder={diskonTipe === "persen" ? "0" : "0"}
                    value={diskonValue}
                    onChange={(e) => setDiskonValue(e.target.value.replace(/\D/g, ""))}
                  />
                )}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 15 }}>
              <span>Total Bayar</span>
              <b style={{ textAlign: "right" }}>{rupiah(totalAkhir)}</b>
            </div>

            {/* Tombol bayar — trigger checkout */}
            <button
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={submitting}
              onClick={submit}
            >
              Bayar {rupiah(totalAkhir)}
            </button>
          </div>
        </div>
      )}

      {/* Modal BarcodeScanner — muncul saat scanOpen true */}
      {scanOpen && (
        <BarcodeScanner
          onDetected={(value) => {
            // Barcode ditemukan → cari produk by SKU → tutup modal.
            addByBarcode(value);
            setScanOpen(false);
          }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}
