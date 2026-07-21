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
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import BarcodeScanner from "../components/BarcodeScanner";
import PinGate from "../components/PinGate";
import { readPromoMinimumRule, readPromoBxgyRule, readPromoTebusMurahRule } from "./Promo";

// Helper format rupiah dari angka integer.
const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

// Harga promo aktif jika harga_diskon diisi dan tanggal berlaku belum lewat.
const isDiskonAktif = (p) => Number(p.harga_diskon || 0) > 0 && (!p.diskon_berlaku_sampai || p.diskon_berlaku_sampai >= new Date().toISOString().slice(0, 10));
const hargaAktif = (p) => isDiskonAktif(p) ? Number(p.harga_diskon || 0) : Number(p.harga_jual || 0);
// Parse aturan satuan majemuk; gagal parse dianggap belum punya satuan tambahan.
const parseSatuanMulti = (p) => {
  try { return p?.satuan_multi ? JSON.parse(p.satuan_multi) || [] : []; } catch { return []; }
};

export default function Transaksi() {
  // Hook toast untuk notifikasi sukses/error.
  const { addToast } = useToast();
  // Hook navigate/location untuk redirect QRIS dan reorder dari riwayat.
  const navigate = useNavigate();
  const location = useLocation();

  // --- State data ---
  const [produk, setProduk] = useState([]);       // Daftar produk aktif
  const [customers, setCustomers] = useState([]); // Daftar customer untuk dropdown
  const [search, setSearch] = useState("");       // Filter pencarian produk
  const [cart, setCart] = useState([]);            // Item keranjang: [{produk_id, qty}]
  const [metodeBayar, setMetodeBayar] = useState("tunai"); // tunai | qris
  const [customerId, setCustomerId] = useState("");       // ID customer terpilih (opsional)
  const [diskonTipe, setDiskonTipe] = useState("nominal");   // "nominal" | "persen"
  const [diskonValue, setDiskonValue] = useState("");          // Angka input (nominal Rp atau persen %)
  const [pajakNominal, setPajakNominal] = useState("");        // PPN/pajak nominal checkout
  const [biayaLayanan, setBiayaLayanan] = useState("");        // Service charge nominal checkout
  const [ongkir, setOngkir] = useState("");                    // Biaya pengiriman nominal checkout
  const [submitting, setSubmitting] = useState(false);     // Flag disable tombol saat checkout
  const [view, setView] = useState(() => localStorage.getItem("kasirView") || "card"); // card | list
  const [scanOpen, setScanOpen] = useState(false); // Kontrol modal BarcodeScanner
  const [cartCollapsed, setCartCollapsed] = useState(false);
  const [promoRule, setPromoRule] = useState(readPromoMinimumRule); // Rule minimum belanja dari halaman Promo.
  const [bxgyRule, setBxgyRule] = useState(readPromoBxgyRule); // Rule Beli X Gratis Y dari halaman Promo.
  const [tmRule, setTmRule] = useState(readPromoTebusMurahRule); // Rule Tebus Murah dari halaman Promo.
  const [hasPins, setHasPins] = useState(false); // Ada PIN aktif untuk keamanan kasir
  const [showPinGate, setShowPinGate] = useState(false); // Tampilkan modal PIN gate saat checkout
  const [notFoundSku, setNotFoundSku] = useState(null); // SKU yang discan tapi tidak ada di produk

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
        // Reorder dari halaman Riwayat membawa item lama ke cart kasir tanpa mengubah transaksi asal.
        // ponytail: validasi stok per item detail bisa ditambah jika reorder lintas hari mulai sering dipakai.
        if (location.state?.reorderItems?.length) {
          setCart(location.state.reorderItems);
          window.history.replaceState({}, document.title, window.location.pathname);
          addToast("Item riwayat dimuat ke keranjang", "success");
        }
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
    setPromoRule(readPromoMinimumRule());
    setBxgyRule(readPromoBxgyRule());
    setTmRule(readPromoTebusMurahRule());
    load();
    // Cek apakah ada PIN kasir aktif untuk keamanan
    invoke("list_kasir_pins")
      .then((pins) => { if (!cancelled) setHasPins(pins.length > 0); })
      .catch(() => {});
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

  // Helper harga item dengan multi-unit
  const hargaItemAktif = (p, satuan_pilihan) => {
    if (satuan_pilihan && p.satuan_multi) {
      try {
        const rules = JSON.parse(p.satuan_multi) || [];
        const rule = rules.find((r) => r.satuan.toLowerCase() === satuan_pilihan.toLowerCase());
        if (rule) return Number(rule.harga_jual || 0);
      } catch (e) {}
    }
    return hargaAktif(p);
  };

  // -------------------------------------------------------
  // HITUNG TOTAL — subtotal cart, diskon, total akhir.
  // -------------------------------------------------------
  const total = cart.reduce(
    (sum, item) => {
      const p = produk.find((prod) => prod.id === item.produk_id);
      return sum + (p ? hargaItemAktif(p, item.satuan_pilihan) : 0) * item.qty;
    },
    0,
  );
  // Diskon bisa nominal Rp atau persen %.
  const diskonValueNumber = Number(diskonValue || 0);
  const diskonNominal = diskonTipe === "persen"
    ? Math.min(total, Math.round((total * diskonValueNumber) / 100))
    : Math.min(total, diskonValueNumber);
  const pajakValue = Number(pajakNominal || 0);
  const biayaValue = Number(biayaLayanan || 0);
  const ongkirValue = Number(ongkir || 0);
  // Promo minimum belanja otomatis; disimpan lokal agar kasir tetap offline-first.
  const promoMinBelanja = Number(promoRule.minBelanja || 0);
  const promoValue = Number(promoRule.nilai || 0);
  const promoEligible = Boolean(promoRule.aktif) && total >= promoMinBelanja && promoMinBelanja > 0 && promoValue > 0;
  const promoNominal = promoEligible
    ? Math.min(total - diskonNominal, promoRule.tipe === "persen" ? Math.round((total * promoValue) / 100) : promoValue)
    : 0;

  // Beli X Gratis Y — gratis produk jika subtotal mencapai minimum belanja.
  const bxgyMin = Number(bxgyRule.minBelanja || 0);
  const bxgyEligible = Boolean(bxgyRule.aktif) && total >= bxgyMin && bxgyMin > 0 && bxgyRule.produkId && Number(bxgyRule.qtyGratis || 1) > 0;
  // Harga produk gratis dikurangi dari total akhir.
  const bxgyProduk = bxgyEligible ? produk.find((p) => p.id === bxgyRule.produkId) : null;
  const bxgyNominal = bxgyProduk ? hargaAktif(bxgyProduk) * Number(bxgyRule.qtyGratis || 1) : 0;

  // Tebus Murah — diskon pada produk tertentu jika subtotal memenuhi minimum.
  // Hanya berlaku untuk 1 unit produk tebus murah.
  const tmMin = Number(tmRule.minBelanja || 0);
  const tmHarga = Number(tmRule.hargaTebus || 0);
  const tmInCart = tmRule.produkId ? cart.find((item) => item.produk_id === tmRule.produkId) : null;
  const tmEligible = Boolean(tmRule.aktif) && total >= tmMin && tmMin > 0 && tmRule.produkId && tmInCart && tmHarga > 0;
  const tmProduk = tmEligible ? produk.find((p) => p.id === tmRule.produkId) : null;
  const tmNormalHarga = tmProduk ? hargaAktif(tmProduk) : 0;
  // Diskon TM = (harga normal - harga tebus) × 1 unit.
  const tmNominal = tmEligible ? Math.max(0, tmNormalHarga - tmHarga) : 0;

  const totalAkhir = total - diskonNominal - promoNominal - bxgyNominal - tmNominal + pajakValue + biayaValue + ongkirValue;

  // -------------------------------------------------------
  // ADD — tambah produk ke keranjang (+1 qty).
  // -------------------------------------------------------
  const add = (p) => {
    log(`tambah ke cart: id=${p.id}; nama=${p.nama}`);
    setCart((old) =>
      old.some((i) => i.produk_id === p.id)
        ? old.map((i) => (i.produk_id === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...old, { produk_id: p.id, qty: 1, satuan_pilihan: "" }],
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
      log(`barcode tidak ditemukan: kode=${String(kode).slice(0, 60)}`);
      setNotFoundSku(String(kode));
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
  const executeSubmit = async () => {
    if (!cart.length) {
      addToast("Keranjang kosong", "error");
      return;
    }
    setSubmitting(true);
    log(`checkout dimulai; items=${cart.length}; metode=${metodeBayar}; diskon=${diskonNominal}; promo=${promoNominal}; customer=${customerId || "none"}`);

    try {
      // Jika BxGY / Tebus Murah eligible, kurangi total bayar via diskonNominal agar history keuntungan/nilai barang valid.
      const totalDiskon = diskonNominal + promoNominal + bxgyNominal + tmNominal;
      const promoNotes = [
        bxgyEligible ? `Gratis ${bxgyRule.qtyGratis}x ${bxgyRule.produkNama}` : null,
        tmEligible ? `Tebus Murah ${tmRule.produkNama} Rp ${Number(tmRule.hargaTebus).toLocaleString("id-ID")}` : null
      ].filter(Boolean).join(", ");
      
      const payload = {
        items: cart,
        metodeBayar,
        catatan: promoNotes.length > 0 ? `Promo: ${promoNotes}` : null,
        diskonNominal: totalDiskon > 0 ? totalDiskon : null,
        customerId: customerId ? Number(customerId) : null,
        pajakNominal: pajakValue > 0 ? pajakValue : null,
        biayaLayanan: biayaValue > 0 ? biayaValue : null,
        ongkir: ongkirValue > 0 ? ongkirValue : null,
      };
      const r = await invoke("buat_transaksi_penjualan", payload);
      log(`checkout sukses; transaksi_id=${r.transaksi_id}; total=${r.total}`);

      // Reset cart + diskon setelah sukses.
      setCart([]);
      setDiskonValue("");
      setPajakNominal("");
      setBiayaLayanan("");
      setOngkir("");
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

  const submit = () => {
    if (!cart.length) {
      addToast("Keranjang kosong", "error");
      return;
    }
    if (hasPins) {
      setShowPinGate(true);
    } else {
      executeSubmit();
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
              <p className="text-body-md" style={{ color: isDiskonAktif(p) ? "var(--color-expense-red)" : "var(--color-primary)", fontWeight: 700 }}>
                {rupiah(hargaAktif(p))}
              </p>
              {isDiskonAktif(p) && <small style={{ color: "var(--color-text-secondary)", textDecoration: "line-through" }}>{rupiah(p.harga_jual)}</small>}
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)", display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                {p.sku && <span className="text-label-md" style={{ fontSize: "11px", background: "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px" }}>{p.sku}</span>}
                <span style={{ fontSize: "11px", background: p.stok === 0 ? "rgba(239,68,68,0.12)" : "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px", color: p.stok === 0 ? "var(--color-error)" : p.stok <= p.stok_minimum ? "var(--color-warning-amber)" : "inherit" }}>
                  Stok: {p.stok} {p.satuan}
                </span>
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
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
                  {p.sku && <span className="text-label-md" style={{ fontSize: "11px", background: "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px" }}>{p.sku}</span>}
                  <span style={{ fontSize: "11px", background: p.stok === 0 ? "rgba(239,68,68,0.12)" : "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px", color: p.stok === 0 ? "var(--color-error)" : p.stok <= p.stok_minimum ? "var(--color-warning-amber)" : "inherit" }}>
                    Stok: {p.stok} {p.satuan}
                  </span>
                </div>
              </span>
              <b style={{ color: isDiskonAktif(p) ? "var(--color-expense-red)" : "var(--color-primary)" }}>{rupiah(hargaAktif(p))}</b>
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
                    <span style={{ fontWeight: 600 }}>{p?.nama}</span>
                    {(() => {
                      const rules = parseSatuanMulti(p);
                      if (rules.length === 0) return <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{rupiah(hargaItemAktif(p, i.satuan_pilihan))}</span>;
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{rupiah(hargaItemAktif(p, i.satuan_pilihan))}</span>
                          <select
                            className="input-field"
                            style={{ padding: "2px 4px", fontSize: "11px", height: "auto", width: "fit-content" }}
                            value={i.satuan_pilihan || ""}
                            onChange={(e) => {
                              setCart((old) => old.map((x) => x.produk_id === i.produk_id ? { ...x, satuan_pilihan: e.target.value } : x));
                            }}
                          >
                            <option value="">{p.satuan}</option>
                            {rules.map((r, idx) => (
                              <option key={idx} value={r.satuan}>{r.satuan} ({r.konversi}x)</option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
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

            {/* Biaya tambahan KasGo Phase 1: pajak, service charge, ongkir */}
            {!cartCollapsed && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                <input
                  className="input-field"
                  style={{ textAlign: "right", padding: "8px 6px", fontSize: 12 }}
                  inputMode="numeric"
                  placeholder="Pajak"
                  value={pajakNominal}
                  onChange={(e) => setPajakNominal(e.target.value.replace(/\D/g, ""))}
                  aria-label="pajak nominal"
                />
                <input
                  className="input-field"
                  style={{ textAlign: "right", padding: "8px 6px", fontSize: 12 }}
                  inputMode="numeric"
                  placeholder="Service"
                  value={biayaLayanan}
                  onChange={(e) => setBiayaLayanan(e.target.value.replace(/\D/g, ""))}
                  aria-label="biaya layanan"
                />
                <input
                  className="input-field"
                  style={{ textAlign: "right", padding: "8px 6px", fontSize: 12 }}
                  inputMode="numeric"
                  placeholder="Ongkir"
                  value={ongkir}
                  onChange={(e) => setOngkir(e.target.value.replace(/\D/g, ""))}
                  aria-label="ongkir"
                />
              </div>
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
            {promoRule.aktif && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 13, color: promoEligible ? "var(--color-expense-red)" : "var(--color-text-secondary)" }}>
                <span>{promoEligible ? "Promo minimum belanja" : `Promo aktif di ${rupiah(promoMinBelanja)}`}</span>
                <b style={{ textAlign: "right" }}>{promoEligible ? `-${rupiah(promoNominal)}` : "Belum memenuhi"}</b>
              </div>
            )}
            {/* Beli X Gratis Y indicator */}
            {bxgyRule.aktif && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 13, color: bxgyEligible ? "#D97706" : "var(--color-text-secondary)" }}>
                <span>{bxgyEligible ? `🎁 Gratis ${bxgyProduk?.nama || "produk"}` : `BxGY aktif di ${rupiah(bxgyMin)}`}</span>
                <b style={{ textAlign: "right" }}>{bxgyEligible ? `-${rupiah(bxgyNominal)}` : "Belum memenuhi"}</b>
              </div>
            )}
            {/* Tebus Murah indicator */}
            {tmRule.aktif && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 13, color: tmEligible ? "#0891B2" : "var(--color-text-secondary)" }}>
                <span>{tmEligible ? `🏷️ Tebus Murah: ${tmProduk?.nama || "produk"}` : `Tebus Murah aktif di ${rupiah(tmMin)}`}</span>
                <b style={{ textAlign: "right" }}>{tmEligible ? `-${rupiah(tmNominal)}` : "Belum memenuhi"}</b>
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

      {/* Popup SKU tidak ditemukan — hasil scan terbaca tapi tidak ada di database produk. */}
      {notFoundSku && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="SKU tidak ada dalam database"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(15, 23, 42, 0.72)",
          }}
        >
          <div
            className="card"
            style={{
              width: "min(92vw, 380px)",
              textAlign: "center",
              borderRadius: 24,
              padding: 20,
              background: "#ffffff",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.35)",
            }}
          >
            <div style={{ width: 64, height: 64, margin: "0 auto 12px", borderRadius: 20, display: "grid", placeItems: "center", background: "#fef2f2", color: "#dc2626" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36 }}>inventory_2</span>
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#0f172a" }}>SKU tidak ada dalam database</h2>
            <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 14 }}>
              Kamera membaca SKU berikut, tapi produk belum terdaftar:
            </p>
            <div style={{ margin: "0 auto 16px", padding: "10px 12px", borderRadius: 12, background: "#f8fafc", color: "#7C3AED", fontWeight: 800, wordBreak: "break-all" }}>
              {notFoundSku}
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={() => setNotFoundSku(null)}
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {/* PIN Gate — muncul saat checkout perlu verifikasi PIN */}
      {showPinGate && (
        <PinGate
          role="kasir"
          onSuccess={() => {
            setShowPinGate(false);
            executeSubmit();
          }}
        />
      )}
    </div>
  );
}
