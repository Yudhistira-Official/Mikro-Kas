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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "../utils/ipc";
import { useLocation } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import BarcodeScanner from "../components/BarcodeScanner";
import RupiahInput from "../components/RupiahInput";
import SearchSelect from "../components/SearchSelect";
import PinGate from "../components/PinGate";
import { readPromoMinimumRule, readPromoBxgyRule, readPromoTebusMurahRule } from "./Promo";
import { isKasirMode, onKasirModeChange } from "../utils/kasirMode";
import { useHardwareScanner } from "../hooks/useHardwareScanner";
import { getPrinterPath } from "../utils/printerSettings";

// Helper format rupiah dari angka integer.
const rupiah = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

// Harga promo aktif jika harga_diskon diisi dan tanggal berlaku belum lewat.
const isDiskonAktif = (p) => Boolean(p) && Number(p.harga_diskon || 0) > 0 && (!p.diskon_berlaku_sampai || p.diskon_berlaku_sampai >= new Date().toISOString().slice(0, 10));
const hargaAktif = (p) => p ? (isDiskonAktif(p) ? Number(p.harga_diskon || 0) : Number(p.harga_jual || 0)) : 0;
// Parse aturan satuan majemuk; gagal parse dianggap belum punya satuan tambahan.
const parseSatuanMulti = (p) => {
  try { return p?.satuan_multi ? JSON.parse(p.satuan_multi) || [] : []; } catch { return []; }
};

export default function Transaksi() {
  // Hook toast untuk notifikasi sukses/error.
  const { addToast } = useToast();
  // Hook location untuk reorder dari riwayat.
  const location = useLocation();

  // --- State data ---
  const [produk, setProduk] = useState([]);       // Daftar produk aktif (paginated)
  const [produkPage, setProdukPage] = useState(0);
  const [produkHasMore, setProdukHasMore] = useState(true);
  const [produkLoading, setProdukLoading] = useState(false);
  const PAGE_SIZE = 50;
  const gridRef = useRef(null);
  const searchInputRef = useRef(null);
  const scanInProgressRef = useRef(false);
  const [gridCols, setGridCols] = useState(4);
  // Hitung jumlah kolom berdasarkan lebar container (card min 180px + gap 1.05rem ≈ 197px)
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const calc = () => setGridCols(Math.max(1, Math.floor(el.clientWidth / 197)));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [customers, setCustomers] = useState([]); // Daftar customer untuk dropdown
  // Daftar sales aktif untuk mengaitkan transaksi kasir secara opsional.
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState("");       // Filter pencarian produk
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [cart, setCart] = useState([]);            // Item keranjang: [{produk_id, qty}]
  const [metodeBayar, setMetodeBayar] = useState("tunai"); // tunai | qris
  const [customerId, setCustomerId] = useState("");       // ID customer terpilih (opsional)
  // Sales terpilih boleh kosong; transaksi tanpa sales tetap sah.
  const [salesId, setSalesId] = useState("");
  const [diskonTipe, setDiskonTipe] = useState("nominal");   // "nominal" | "persen"
  const [diskonValue, setDiskonValue] = useState("");          // Angka input (nominal Rp atau persen %)
  const [pajakNominal, setPajakNominal] = useState("");        // PPN/pajak nominal checkout
  const [biayaLayanan, setBiayaLayanan] = useState("");        // Service charge nominal checkout
  const [ongkir, setOngkir] = useState("");                    // Biaya pengiriman nominal checkout
  const [showPaymentError, setShowPaymentError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
     // Flag disable tombol saat checkout
  const [view, setView] = useState(() => localStorage.getItem("kasirView") || "card"); // card | list
  const [scanOpen, setScanOpen] = useState(false); // Kontrol modal BarcodeScanner
  const [cartCollapsed, setCartCollapsed] = useState(false);
  const [uangDiterima, setUangDiterima] = useState("");
  const [promoRule, setPromoRule] = useState(readPromoMinimumRule); // Rule minimum belanja dari halaman Promo.
  const [bxgyRule, setBxgyRule] = useState(readPromoBxgyRule); // Rule Beli X Gratis Y dari halaman Promo.
  const [tmRule, setTmRule] = useState(readPromoTebusMurahRule); // Rule Tebus Murah dari halaman Promo.
  const [hasPins, setHasPins] = useState(false); // Ada PIN aktif untuk keamanan kasir
  // PPN otomatis dari pajak_setting — di-load dari backend saat mount.
  const [ppnSetting, setPpnSetting] = useState({ ppn_mode: "non", ppn_persen: 0 });
  const [showPinGate, setShowPinGate] = useState(false); // Tampilkan modal PIN gate saat checkout
  const [notFoundSku, setNotFoundSku] = useState(null); // SKU yang discan tapi tidak ada di produk
  const [showPrintConfirm, setShowPrintConfirm] = useState(false); // Konfirmasi cetak faktur
  const [lastTransactionId, setLastTransactionId] = useState(null); // ID transaksi untuk cetak struk
  const [paymentSnapshot, setPaymentSnapshot] = useState(null); // Snapshot cart+state sebelum reset

  // Flag guard: cegah setState setelah unmount (crash saat cepat ganti tab).
  const cancelledRef = useRef(false);

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
      const [customerData, salesData] = await Promise.all([
        invoke("list_customer"),
        invoke("list_sales"),
      ]);
      if (!cancelledRef.current) {
        invoke("get_pajak_setting").then(setPpnSetting).catch(() => {});
        setCustomers(customerData);
        setSales(salesData);
        // Reorder dari halaman Riwayat membawa item lama ke cart kasir tanpa mengubah transaksi asal.
        // ponytail: validasi stok per item detail bisa ditambah jika reorder lintas hari mulai sering dipakai.
        if (location.state?.reorderItems?.length) {
          setCart(location.state.reorderItems);
          window.history.replaceState({}, document.title, window.location.pathname);
          addToast("Item riwayat dimuat ke keranjang", "success");
        }
        log(`data dimuat; customer=${customerData.length}; sales=${salesData.length}`);
      }
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("no such table") && !msg.includes("no such column")) {
        addToast(msg, "error");
      }
      log(`gagal memuat data: ${msg.slice(0, 200)}`);
    }
  };

  const sentinelRef = useRef(null);
  const produkRef = useRef(produk);
  const searchRequestRef = useRef(0);
  produkRef.current = produk;

  // Load more produk via cursor pagination (lebih cepat dari OFFSET)
  const loadMore = useCallback(async () => {
    if (produkLoading || !produkHasMore || cancelledRef.current) return;
    const requestId = searchRequestRef.current;
    const current = produkRef.current;
    if (!current.length) return;
    const last = current[current.length - 1];
    setProdukLoading(true);
    try {
      const next = await invoke("list_produk_kasir", {
        limit: PAGE_SIZE,
        cursorId: last.id,
        cursorVal: last.nama,
        search: debouncedSearch || null,
      });
      if (!cancelledRef.current && requestId === searchRequestRef.current) {
        // Dedup by id — cegah produk dobel saat loadMore race / cursor overlap
        setProduk((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const extra = (next || []).filter((p) => !seen.has(p.id));
          return extra.length ? [...prev, ...extra] : prev;
        });
        setProdukPage((p) => p + 1);
        setProdukHasMore((next || []).length >= PAGE_SIZE);
      }
    } catch (e) {
      log(`gagal load more: ${String(e).slice(0, 100)}`);
    } finally {
      if (!cancelledRef.current) setProdukLoading(false);
    }
  }, [produkPage, produkHasMore, produkLoading, debouncedSearch]);

  // Reset pagination saat search berubah
  useEffect(() => {
    const requestId = ++searchRequestRef.current;
    (async () => {
      try {
        const filtered = await invoke("list_produk_kasir", {
          limit: PAGE_SIZE,
          search: debouncedSearch || null,
        });
        if (!cancelledRef.current && requestId === searchRequestRef.current) { setProduk(filtered); setProdukPage(0); setProdukHasMore(filtered.length >= PAGE_SIZE); }
      } catch (e) { if (requestId === searchRequestRef.current) log(`gagal search: ${String(e).slice(0, 100)}`); }
    })();
  }, [debouncedSearch]);

  // IntersectionObserver untuk infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !produkHasMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { root: gridRef.current, rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [produkHasMore, loadMore]);

  // Mount: load data. Unmount: set cancelled flag.
  useEffect(() => {
    cancelledRef.current = false;
    log("halaman kasir dimuat");
    setPromoRule(readPromoMinimumRule());
    setBxgyRule(readPromoBxgyRule());
    setTmRule(readPromoTebusMurahRule());
    load();
    // Cek apakah ada PIN kasir aktif untuk keamanan
    invoke("list_kasir_pins")
      .then((pins) => { if (!cancelledRef.current) setHasPins(pins.length > 0); })
      .catch(() => {});
    if (window.innerWidth >= 768) setCartCollapsed(false);
    return () => {
      cancelledRef.current = true;
      log("halaman kasir di-unmount");
    };
  }, []);

  // Map id→produk untuk lookup O(1) di cart/total/promo
  const produkMap = useMemo(() => new Map(produk.map((p) => [p.id, p])), [produk]);
  // Map sku→produk untuk barcode scan O(1)
  // Map semua barcode/SKU → produk (multi-SKU: secondary barcode ikut terdaftar)
  const skuMap = useMemo(() => {
    const map = new Map();
    for (const p of produk) {
      const list = Array.isArray(p.skus) && p.skus.length ? p.skus : [p.sku];
      for (const s of list) {
        const key = String(s || "").trim();
        if (key) map.set(key, p);
      }
    }
    return map;
  }, [produk]);

  // Virtual scrolling untuk grid/list produk Kasir
  const produkVirtualizer = useVirtualizer({
    count: view === "card" ? Math.ceil(produk.length / Math.max(gridCols, 1)) : produk.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => view === "card" ? 140 : 72,
    overscan: view === "card" ? 3 : 5,
  });
  const virtualItems = produkVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const virtualCount = view === "card" ? Math.ceil(produk.length / Math.max(gridCols, 1)) : produk.length;
  const preloadRows = view === "card" ? Math.ceil(15 / Math.max(gridCols, 1)) : 15;

  // Muat batch berikutnya saat tersisa 15 item; batch 50 siap sebelum user mencapai ujung.
  useEffect(() => {
    if (produkHasMore && !produkLoading && lastVirtualIndex >= virtualCount - preloadRows) loadMore();
  }, [lastVirtualIndex, virtualCount, preloadRows, produkHasMore, produkLoading, loadMore]);

  // Helper harga item dengan multi-unit
  const hargaItemAktif = (p, satuan_pilihan) => {
    if (!p) return 0;
    // Cart snap sudah punya harga_jual, harga_diskon, diskon_berlaku_sampai
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
  // Resolve produk: prefer snapshot di cart (aman saat search mereset list)
  const resolveCartProduct = (item) => {
    const live = produkMap.get(item.produk_id);
    if (live) {
      return {
        ...live,
        nama: live.nama || item.nama || "",
        harga_jual: live.harga_jual ?? item.harga_jual,
        harga_diskon: live.harga_diskon ?? item.harga_diskon,
        diskon_berlaku_sampai: live.diskon_berlaku_sampai ?? item.diskon_berlaku_sampai,
        satuan: live.satuan || item.satuan || "pcs",
        satuan_multi: live.satuan_multi ?? item.satuan_multi,
        stok: live.stok ?? item.stok,
      };
    }
    if (item.nama || item.harga_jual != null) {
      return {
        id: item.produk_id,
        nama: item.nama || "",
        sku: item.sku || "",
        harga_jual: Number(item.harga_jual || 0),
        harga_diskon: Number(item.harga_diskon || 0),
        diskon_berlaku_sampai: item.diskon_berlaku_sampai || null,
        satuan: item.satuan || "pcs",
        satuan_multi: item.satuan_multi || null,
        stok: Number(item.stok || 0),
      };
    }
    return null;
  };

  const total = cart.reduce(
    (sum, item) => {
      const p = resolveCartProduct(item);
      return sum + (p ? hargaItemAktif(p, item.satuan_pilihan) : 0) * item.qty;
    },
    0,
  );
  // Diskon bisa nominal Rp atau persen %.
  const diskonValueNumber = Number(diskonValue || 0);
  const diskonNominal = diskonTipe === "persen"
    ? Math.min(total, Math.round((total * diskonValueNumber) / 100))
    : Math.min(total, diskonValueNumber);
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
  const bxgyProduk = bxgyEligible ? produkMap.get(bxgyRule.produkId) : null;
  const bxgyNominal = bxgyProduk ? hargaAktif(bxgyProduk) * Number(bxgyRule.qtyGratis || 1) : 0;

  // Tebus Murah — diskon pada produk tertentu jika subtotal memenuhi minimum.
  const tmMin = Number(tmRule.minBelanja || 0);
  const tmHarga = Number(tmRule.hargaTebus || 0);
  const tmInCart = tmRule.produkId ? cart.find((item) => item.produk_id === tmRule.produkId) : null;
  const tmEligible = Boolean(tmRule.aktif) && total >= tmMin && tmMin > 0 && tmRule.produkId && tmInCart && tmHarga > 0;
  const tmProduk = tmEligible ? produkMap.get(tmRule.produkId) : null;
  const tmNormalHarga = tmProduk ? hargaAktif(tmProduk) : 0;
  const tmNominal = tmEligible ? Math.max(0, tmNormalHarga - tmHarga) : 0;

  // Auto-calculate PPN from pajak_setting config on the taxable amount (total after discounts).
  const taxableAmount = Math.max(0, total - diskonNominal - promoNominal - bxgyNominal - tmNominal);
  const ppnPersen = ppnSetting.ppn_persen || 0;
  const ppnAmount = ppnSetting.ppn_mode === "exclude"
    ? taxableAmount * (ppnPersen / 100)
    : ppnSetting.ppn_mode === "include"
      ? taxableAmount - taxableAmount / (1 + ppnPersen / 100)
      : 0;
  const pajakValue = Math.round(ppnAmount);

  // exclude mode: add PPN on top of taxable amount
  // include/non mode: PPN already embedded or zero
  const ppnTambah = ppnSetting.ppn_mode === "exclude" ? pajakValue : 0;
  const totalAkhir = taxableAmount + ppnTambah + biayaValue + ongkirValue;
  const kembalian = Math.max(0, Number(uangDiterima || 0) - totalAkhir);
  const pembayaranTidakMencukupi = Number(uangDiterima || 0) < totalAkhir;

  // End key → fokus ke input uang diterima
  // Escape menutup popup Kasir paling atas tanpa membatalkan keranjang atau checkout aktif.
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (showPrintConfirm) { event.preventDefault(); setShowPrintConfirm(false); return; }
      if (notFoundSku) { event.preventDefault(); setNotFoundSku(null); }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showPrintConfirm, notFoundSku]);

  useEffect(() => {
    const handle = (e) => {
      if (e.key === "End" && cart.length > 0) {
        e.preventDefault();
        document.querySelector('input[aria-label="uang diterima"]')?.focus();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [cart.length]);

  // -------------------------------------------------------
  // ADD — tambah produk ke keranjang (+1 qty).
  // -------------------------------------------------------
  const handleSearchKeyDown = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    const requestId = ++searchRequestRef.current;
    let result = produk;
    if (query !== debouncedSearch.trim()) {
      try {
        result = await invoke("list_produk_kasir", { limit: PAGE_SIZE, search: query });
      } catch {
        result = [];
      }
    }
    if (requestId !== searchRequestRef.current) return;
    const q = query.toLowerCase();
    const exact = result.find((item) => {
      const list = Array.isArray(item.skus) && item.skus.length ? item.skus : [item.sku];
      return list.some((s) => String(s || "").trim().toLowerCase() === q);
    });
    const product = exact || result[0];
    if (!product) {
      addToast("Barang tidak ada", "error");
      return;
    }
    if (Number(product.stok) <= 0) {
      add(product);
      return;
    }
    setProduk((current) => current.some((item) => item.id === product.id) ? current : [...current, product]);
    if (add(product) === false) return;
    ++searchRequestRef.current;
    setSearch("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const add = (p) => {
    if (!p?.id) return false;
    if (Number(p.stok) <= 0) {
      addToast(`Stok ${p.nama} habis, tidak bisa ditambahkan`, "error");
      return false;
    }
    log(`tambah ke cart: id=${p.id}; nama=${p.nama}`);
    // Snapshot data produk ke cart agar tidak hilang saat list produk di-reset search
    const snap = {
      produk_id: p.id,
      qty: 1,
      satuan_pilihan: "",
      nama: p.nama || "",
      sku: p.sku || "",
      harga_jual: Number(p.harga_jual || 0),
      harga_diskon: Number(p.harga_diskon || 0),
      diskon_berlaku_sampai: p.diskon_berlaku_sampai || null,
      satuan: p.satuan || "pcs",
      satuan_multi: p.satuan_multi || null,
      stok: Number(p.stok || 0),
    };
    setCart((old) => {
      const existing = old.find((i) => i.produk_id === p.id);
      if (existing && existing.qty >= Number(p.stok)) {
        addToast(`Stok ${p.nama} hanya tersisa ${p.stok}`, "error");
        return old;
      }
      return existing
        ? old.map((i) => (i.produk_id === p.id ? { ...i, ...snap, qty: i.qty + 1 } : i))
        : [...old, snap];
    });
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
  const addByBarcode = async (kode) => {
    const value = String(kode).trim();
    if (!value || scanInProgressRef.current) return;
    scanInProgressRef.current = true;
    log(`scan barcode diterima: kode=${value.slice(0, 60)}`);
    try {
      let found = skuMap.get(value);
      if (!found) {
        const matches = await invoke("list_produk_kasir", { limit: PAGE_SIZE, search: value });
        found = (matches || []).find((item) => {
          const list = Array.isArray(item.skus) && item.skus.length ? item.skus : [item.sku];
          return list.some((s) => String(s || "").trim() === value);
        });
      }
      if (!found) {
        log(`barcode tidak ditemukan: kode=${value.slice(0, 60)}`);
        setNotFoundSku(value);
        addToast("Barang tidak ada", "error");
        return;
      }
      if (Number(found.stok) <= 0) {
        add(found);
        return;
      }
      setProduk((current) => current.some((item) => item.id === found.id) ? current : [...current, found]);
      if (add(found) === false) return;
      ++searchRequestRef.current;
      setSearch("");
      requestAnimationFrame(() => searchInputRef.current?.focus());
      addToast(`${found.nama} masuk keranjang`, "success");
      log(`barcode cocok: id=${found.id}; nama=${found.nama}`);
    } catch (error) {
      log(`gagal mencari barcode: ${String(error).slice(0, 100)}`);
      addToast("Gagal mencari barang", "error");
    } finally {
      scanInProgressRef.current = false;
    }
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
        salesId: salesId ? Number(salesId) : null,
        pajakNominal: pajakValue > 0 ? pajakValue : null,
        biayaLayanan: biayaValue > 0 ? biayaValue : null,
        ongkir: ongkirValue > 0 ? ongkirValue : null,
        // Uang diterima dari keranjang — dipakai struk (Tunai/Kembali)
        dibayar: Number(uangDiterima || 0) > 0 ? Number(uangDiterima) : Number(totalAkhir || 0),
      };
      const r = await invoke("buat_transaksi_penjualan", payload);
      log(`checkout sukses; transaksi_id=${r.transaksi_id}; total=${r.total}`);
      localStorage.setItem("customer_display_transaction_id", String(r.transaksi_id));

      // Reset cart + diskon setelah sukses.
      setCart([]);
      setDiskonValue("");
      setBiayaLayanan("");
      setOngkir("");
      setUangDiterima("");
       load();
       setLastTransactionId(r.transaksi_id);
       setShowPrintConfirm(true);
       addToast(`Penjualan selesai: ${rupiah(r.total)}`, "success");
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
    if (pembayaranTidakMencukupi) {
      setShowPaymentError(true);
      document.querySelector('input[aria-label="uang diterima"]')?.focus();
      return;
    }
    setPaymentSnapshot({
      cart: cart.map((item) => ({ ...item })),
      metodeBayar,
      customerId,
      diskonTipe,
      diskonValue,
      pajakNominal,
      biayaLayanan,
      ongkir,
      uangDiterima,
    });
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

  const [kasirModeActive, setKasirModeActive] = useState(() => isKasirMode());
  useEffect(() => onKasirModeChange(setKasirModeActive), []);

  // USB/HID barcode scanner (keyboard wedge) — universal, model-agnostic
  useHardwareScanner(
    (code) => {
      if (scanOpen || showPinGate || showPrintConfirm) return;
      addByBarcode(code);
    },
    { enabled: true, minLength: 3, maxGapMs: 55 }
  );

  // -------------------------------------------------------
  // RENDER — UI kasir: search bar, filter, produk grid, cart footer.
  // -------------------------------------------------------
  return (
    <div className={`kasir-page${kasirModeActive ? " kasir-page--focus" : ""}`}>
      {/* Toolbar: search, scan, view toggle, customer, diskon */}
      <div className="kasir-toolbar">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={searchInputRef}
            className="input-field"
            style={{ flex: 1 }}
            placeholder="Cari / scan barcode SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            data-scanner="allow"
          />
          {/* Tombol buka BarcodeScanner modal */}
          <button
            className="btn-icon kasir-scan-btn"
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
        {/* Dropdown customer dan sales; diskon dikelola di panel keranjang kanan. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Customer opsional; placeholder UMUM tampil abu-abu, tanpa opsi kosong */}
          <SearchSelect
            className="input-field"
            style={{ flex: 1, minWidth: 160 }}
            value={customerId}
            onChange={setCustomerId}
            placeholder="UMUM"
            options={customers.map((c) => ({ value: String(c.id), label: c.nama }))}
          />
          {/* Sales opsional; placeholder abu-abu, tanpa opsi kosong */}
          <SearchSelect
            className="input-field"
            style={{ flex: 1, minWidth: 140 }}
            value={salesId}
            onChange={setSalesId}
            placeholder="Tanpa sales"
            options={sales.map((s) => ({ value: String(s.id), label: s.nama }))}
          />
        </div>
      </div>

      <div className="kasir-products-area" ref={gridRef}>
      {/* Grid/list produk — virtual scrolling via tanstack-virtual */}
      {(() => {
        return (
          <>
            <div style={{ position: "relative", height: `${produkVirtualizer.getTotalSize()}px` }}>
              {produkVirtualizer.getVirtualItems().map((virtualRow) => {
                if (view === "card") {
                  const start = virtualRow.index * gridCols;
                  const rowItems = produk.slice(start, start + gridCols);
                  return (
                    <div key={virtualRow.key} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)`, display: "grid", gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: "1.05rem", paddingRight: "1.05rem" }}>
                      {rowItems.map((p) => (
                        <button key={p.id} type="button" className="card" onClick={() => add(p)} style={{ textAlign: "left", border: 0, cursor: "pointer" }}>
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
                  );
                }
                const p = produk[virtualRow.index];
                return (
                  <div key={virtualRow.key} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}>
                    <button type="button" className="card" onClick={() => add(p)} style={{ border: 0, borderBottom: "1px solid var(--color-outline-variant)", borderRadius: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", textAlign: "left", width: "100%" }}>
                      <span>
                        <b>{p.nama}</b><br />
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
                          {p.sku && <span className="text-label-md" style={{ fontSize: "11px", background: "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px" }}>{p.sku}</span>}
                          <span style={{ fontSize: "11px", background: p.stok === 0 ? "rgba(239,68,68,0.12)" : "var(--color-surface-container-high)", padding: "2px 6px", borderRadius: "4px", color: p.stok === 0 ? "var(--color-error)" : p.stok <= p.stok_minimum ? "var(--color-warning-amber)" : "inherit" }}>
                            Stok: {p.stok} {p.satuan}
                          </span>
                        </div>
                      </span>
                      <b style={{ color: isDiskonAktif(p) ? "var(--color-expense-red)" : "var(--color-primary)" }}>{rupiah(hargaAktif(p))}</b>
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Sentinel untuk infinite scroll */}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {produkLoading && <div className="text-label-md" style={{ textAlign: "center", padding: 8, color: "var(--color-text-secondary)" }}>Memuat...</div>}
          </>
        );
      })()}
      </div>

      {/* Cart footer — panel tetap terlihat di desktop meski cart kosong */}
      <div className={`cart-footer${cart.length ? "" : " cart-footer--empty"}`}>
          <div className="cart-footer-inner">
            {/* Zona 1: Total Bayar */}
            <div className="kasir-total-section">
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>Total Bayar</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: "var(--color-primary)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {rupiah(totalAkhir)}
              </div>
            </div>

            {/* Zona 2: List produk */}
            <div className="kasir-list-section">
            <button
              className="btn-icon kasir-collapse-btn"
              type="button"
              onClick={() => setCartCollapsed((v) => !v)}
              aria-label={cartCollapsed ? "buka keranjang" : "tutup keranjang"}
              style={{ alignSelf: "center", margin: "-4px auto 4px" }}
            >
              <span className="material-symbols-outlined">
                {cartCollapsed ? "keyboard_arrow_up" : "keyboard_arrow_down"}
              </span>
            </button>

            <div className={`kasir-cart-items${cartCollapsed ? " kasir-cart-items--collapsed" : ""}`}>
              <div className="kasir-cart-header">
                <span>Nama Produk</span>
                <span>Harga</span>
                <span>Jumlah</span>
              </div>
              {cart.map((i) => {
                const p = resolveCartProduct(i);
                const harga = hargaItemAktif(p, i.satuan_pilihan);
                const rules = parseSatuanMulti(p);
                return (
                  <div className="kasir-cart-row" key={i.produk_id}>
                    <div className="kasir-cart-product">
                      <span>{p?.nama || i.nama || "—"}</span>
                      {rules.length > 0 && (
                        <SearchSelect
                          className="input-field"
                          value={i.satuan_pilihan || ""}
                          onChange={(value) => {
                            setCart((old) => old.map((x) => x.produk_id === i.produk_id ? { ...x, satuan_pilihan: value } : x));
                          }}
                          options={[{ value: "", label: p?.satuan || i.satuan || "pcs" }, ...rules.map((r) => ({ value: r.satuan, label: `${r.satuan} (${r.konversi}x)` }))]}
                          placeholder={p?.satuan || i.satuan || "pcs"}
                        />
                      )}
                    </div>
                    <div className="kasir-cart-price" aria-label={`harga ${rupiah(harga * i.qty)}`}>
                      <span>Rp</span>
                      <span>{Number(harga * i.qty).toLocaleString("id-ID")}</span>
                    </div>
                    <div className="kasir-cart-quantity">
                      <button className="btn-icon" type="button" onClick={() => qty(i.produk_id, -1)} aria-label="kurangi qty">−</button>
                      <input
                        className="input-field"
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
                      <button className="btn-icon" type="button" onClick={() => qty(i.produk_id, 1)} aria-label="tambah qty">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>

            {/* Zona 3: Detail pembayaran dan tombol Bayar */}
            <div className="kasir-actions-section">
            <div className="kasir-payment-details">
            {/* Pilihan metode pembayaran */}
            {!cartCollapsed && (
              <>
                <div className="kasir-payment-methods">
                  <button
                    type="button"
                    className={`filter-chip kasir-payment-method${metodeBayar === "tunai" ? " active" : ""}`}
                    onClick={() => setMetodeBayar("tunai")}
                  >
                    Tunai
                  </button>
                  <button
                    type="button"
                    className={`filter-chip kasir-payment-method${metodeBayar === "qris" ? " active" : ""}`}
                    onClick={() => setMetodeBayar("qris")}
                  >
                    QRIS
                  </button>
                  <button
                    type="button"
                    className={`filter-chip kasir-payment-method${metodeBayar === "transfer" ? " active" : ""}`}
                    onClick={() => setMetodeBayar("transfer")}
                  >
                    Transfer
                  </button>
                </div>
              </>
            )}

            {/* Biaya tambahan: service charge, ongkir — rata kanan, sejajar, responsif */}
            {!cartCollapsed && (
              <div className="kasir-fee-row" style={{ marginBottom: 8 }}>
                {ppnSetting.ppn_mode !== "non" && (
                  <div className="kasir-fee-field">
                    <span className="kasir-fee-label">
                      PPN {ppnSetting.ppn_persen}%{ppnSetting.ppn_mode === "include" ? " incl" : " excl"}
                    </span>
                    <div className="kasir-fee-ppn">{rupiah(pajakValue)}</div>
                  </div>
                )}
                <div className="kasir-fee-field">
                  <span className="kasir-fee-label">Service</span>
                  <RupiahInput
                    style={{ textAlign: "right", fontSize: 12 }}
                    placeholder="0"
                    value={biayaLayanan}
                    onChange={(val) => setBiayaLayanan(val)}
                  />
                </div>
                <div className="kasir-fee-field">
                  <span className="kasir-fee-label">Ongkir</span>
                  <RupiahInput
                    style={{ textAlign: "right", fontSize: 12 }}
                    placeholder="0"
                    value={ongkir}
                    onChange={(val) => setOngkir(val)}
                  />
                </div>
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
                <span>Diskon</span>
                {cartCollapsed ? (
                  <b style={{ textAlign: "right" }}>{rupiah(diskonNominal)}</b>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      type="button"
                      className="filter-chip active"
                      style={{ minWidth: 36, padding: "4px 10px", fontSize: 13 }}
                      onClick={() => setDiskonTipe(diskonTipe === "nominal" ? "persen" : "nominal")}
                    >
                      {diskonTipe === "nominal" ? "Rp" : "%"}
                    </button>
                    <RupiahInput
                      style={{ width: 100 }}
                      placeholder="0"
                      value={diskonValue}
                      onChange={(val) => setDiskonValue(val)}
                    />
                  </div>
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
             {showPaymentError && pembayaranTidakMencukupi && (
               <div className="kasir-payment-error">Pembayaran &quot;Tidak Mencukupi&quot;</div>
             )}
             <input
               className={`input-field${showPaymentError && pembayaranTidakMencukupi ? " kasir-payment-input--error" : ""}`}
               style={{ textAlign: "right", marginBottom: 8 }}
               inputMode="numeric"
               placeholder="Uang diterima"
               value={uangDiterima ? `Rp ${Number(uangDiterima).toLocaleString("id-ID")}` : ""}
               onChange={(e) => {
                 setUangDiterima(e.target.value.replace(/\D/g, ""));
                 setShowPaymentError(false);
               }}
               onKeyDown={(e) => {
                 if (e.key === "Enter") {
                   e.preventDefault();
                   submit();
                 }
               }}
               aria-label="uang diterima"
               aria-invalid={showPaymentError && pembayaranTidakMencukupi}
             />
            {Number(uangDiterima || 0) > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 15, color: "var(--color-income-green)" }}>
                <span>Kembalian</span>
                <b style={{ textAlign: "right" }}>{rupiah(kembalian)}</b>
              </div>
            )}
            </div>

            {/* Tombol bayar — trigger checkout */}
             <div className="kasir-pay-btn-wrap">
              <button
                className="btn-primary"
                style={{ width: "100%" }}
                disabled={submitting}
                onClick={submit}
              >
                 Bayar
              </button>
            </div>
            </div>
          </div>
        </div>

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
               position: "relative",
              borderRadius: 24,
              padding: 20,
              background: "#ffffff",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.35)",
            }}
          >
<div style={{ width: 64, height: 64, margin: "0 auto 12px", borderRadius: 20, display: "grid", placeItems: "center", background: "#fef2f2", color: "#dc2626" }}>
               <span className="material-symbols-outlined" style={{ fontSize: 36 }}>inventory_2</span>
             </div>
             <button type="button" aria-label="Tutup" onClick={() => setNotFoundSku(null)} style={{ position: "absolute", top: 8, right: 8, border: 0, background: "transparent", cursor: "pointer", color: "#64748b" }}><span className="material-symbols-outlined">close</span></button>
             <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#0f172a" }}>SKU tidak ada dalam database</h2>
            <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 14 }}>
              Kamera membaca SKU berikut, tapi produk belum terdaftar:
            </p>
            <div style={{ margin: "0 auto 16px", padding: "10px 12px", borderRadius: 12, background: "#f8fafc", color: "var(--color-primary)", fontWeight: 800, wordBreak: "break-all" }}>
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
          onCancel={() => setShowPinGate(false)}
          onSuccess={() => {
            setShowPinGate(false);
            executeSubmit();
          }}
        />
      )}

      {/* Popup cetak: tutup dulu; Ya=print (gagal→rollback DB); Tidak=skip print, data tetap */}
      {showPrintConfirm && (
        <PrintConfirmDialog
          onYes={async () => {
            setShowPrintConfirm(false);
            const txId = lastTransactionId;
            const path = getPrinterPath() || null;
            try {
              const msg = await invoke("print_struk", { transaksiId: txId, printerPath: path });
              addToast(msg || "Struk dicetak", "success");
            } catch (err) {
              // Gagal cetak: batalkan transaksi agar tidak masuk laporan
              try {
                if (txId) await invoke("delete_transaksi_penjualan", { id: txId });
              } catch (_) {}
              if (paymentSnapshot) {
                setCart(paymentSnapshot.cart);
                setMetodeBayar(paymentSnapshot.metodeBayar);
                setCustomerId(paymentSnapshot.customerId);
                setDiskonTipe(paymentSnapshot.diskonTipe);
                setDiskonValue(paymentSnapshot.diskonValue);
                setPajakNominal(paymentSnapshot.pajakNominal);
                setBiayaLayanan(paymentSnapshot.biayaLayanan);
                setOngkir(paymentSnapshot.ongkir);
                setUangDiterima(paymentSnapshot.uangDiterima);
                setShowPaymentError(false);
              }
              setLastTransactionId(null);
              localStorage.removeItem("customer_display_transaction_id");
              await load();
              addToast(`Cetak gagal — transaksi dibatalkan: ${err}`, "error");
            }
          }}
          onNo={() => {
            setShowPrintConfirm(false);
            // Data sudah tersimpan; tanpa cetak
          }}
        />
      )}
    </div>
  );
}


/**
 * PrintConfirmDialog — Ya kiri, Tidak kanan.
 * Tutup sinkron dulu; Arrow L/R pilih; Enter jalankan; Escape = Tidak.
 */
function PrintConfirmDialog({ onYes, onNo }) {
  const [focusIdx, setFocusIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const yesRef = useRef(null);
  const noRef = useRef(null);
  const onYesRef = useRef(onYes);
  const onNoRef = useRef(onNo);
  onYesRef.current = onYes;
  onNoRef.current = onNo;

  useEffect(() => {
    (focusIdx === 0 ? yesRef : noRef).current?.focus();
  }, [focusIdx]);

  useEffect(() => {
    const onKey = (e) => {
      if (busy) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIdx(0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIdx(1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        if (focusIdx === 0) onYesRef.current?.();
        else onNoRef.current?.();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        onNoRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focusIdx, busy]);

  const handleYes = () => {
    if (busy) return;
    setBusy(true);
    onYesRef.current?.();
  };
  const handleNo = () => {
    if (busy) return;
    setBusy(true);
    onNoRef.current?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cetak struk"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        className="card"
        style={{
          width: "min(92vw, 360px)",
          textAlign: "center",
          borderRadius: 24,
          padding: 28,
          background: "#ffffff",
          boxShadow: "0 24px 60px rgba(15,23,42,0.25)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            margin: "0 auto 12px",
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: "var(--color-primary-fixed)",
            color: "var(--color-primary)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>print</span>
        </div>
        <button
          type="button"
          aria-label="Tutup"
          onClick={handleNo}
          disabled={busy}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            border: 0,
            background: "transparent",
            cursor: "pointer",
            color: "#64748b",
          }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "var(--color-text-primary)" }}>
          Cetak struk?
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--color-text-secondary)" }}>
          Ya = cetak (gagal membatalkan transaksi). Tidak = simpan tanpa cetak.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={yesRef}
            type="button"
            className="btn-primary"
            disabled={busy}
            style={{
              flex: 1,
              outline: focusIdx === 0 ? "2px solid var(--color-primary)" : undefined,
              outlineOffset: 2,
            }}
            onFocus={() => setFocusIdx(0)}
            onClick={handleYes}
          >
            Ya, Cetak
          </button>
          <button
            ref={noRef}
            type="button"
            className="btn-secondary"
            disabled={busy}
            style={{
              flex: 1,
              outline: focusIdx === 1 ? "2px solid var(--color-primary)" : undefined,
              outlineOffset: 2,
            }}
            onFocus={() => setFocusIdx(1)}
            onClick={handleNo}
          >
            Tidak
          </button>
        </div>
      </div>
    </div>
  );
}
