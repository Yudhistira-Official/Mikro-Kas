// ============================================================
// Produk.jsx — CRUD produk, search, kategori, low-stock (PageKit)
// ============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "../utils/ipc";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import RupiahInput from "../components/RupiahInput";
import { generateBarcodeSVG } from "../utils/barcode";
import BarcodeScanner from "../components/BarcodeScanner";
import DropZoneImport from "../components/DropZoneImport";
import SearchSelect from "../components/SearchSelect";
import PinGate from "../components/PinGate";
import {
  PageShell,
  DataPanel,
  DataTable,
  FormModal,
  InfoNote,
  StatusBadge,
  rupiah,
} from "../components/PageKit";

// Daftar satuan standar POS, dikelompokkan agar input manual konsisten.
// Setiap item = [nilai_DB, label_tampil]; pakai singkatan umum di kasir.
// Alias migrasi agar produk lama tetap tampil setelah satuan diubah ke singkatan.
const UNIT_ALIASES = { gram: "gr", miligram: "mg", liter: "L", mililiter: "mL", meter: "m", sentimeter: "cm", yard: "yd", pasang: "psg" };

const UNIT_OPTIONS = [
  { label: "Satuan Unit", options: [["pcs", "pcs"], ["unit", "unit"], ["buah", "buah"], ["biji", "biji"], ["pasang", "psg"], ["set", "set"]] },
  { label: "Satuan Kemasan", options: [["dus", "dus"], ["kodi", "kodi"], ["lusin", "lusin"], ["pack", "pack"], ["box", "box"], ["gross", "gross"], ["renceng", "renceng"], ["lembar", "lembar"]] },
  { label: "Satuan Berat", options: [["kg", "kg"], ["gr", "gr"], ["ons", "ons"], ["mg", "mg"]] },
  { label: "Satuan Volume / Cairan", options: [["L", "L"], ["mL", "mL"], ["botol", "botol"], ["kaleng", "kaleng"], ["galon", "galon"], ["cup", "cup"]] },
  { label: "Satuan Panjang / Luas", options: [["m", "m"], ["cm", "cm"], ["yd", "yd"], ["roll", "roll"], ["lembar", "lembar"]] },
];

// Harga promo aktif jika harga_diskon diisi dan tanggal berlaku belum lewat.
const isDiskonAktif = (p) => Number(p.harga_diskon || 0) > 0 && (!p.diskon_berlaku_sampai || p.diskon_berlaku_sampai >= new Date().toISOString().slice(0, 10));
const hargaAktif = (p) => isDiskonAktif(p) ? Number(p.harga_diskon || 0) : Number(p.harga_jual || 0);

// Konversi Uint8Array dari plugin-fs menjadi base64 untuk dikirim ke Rust.
const bytesToBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export default function Produk() {
  const { addToast } = useToast();
  const [produk, setProduk] = useState([]);
  // Header stats dari backend (total DB, bukan length list paginated)
  const [headerStats, setHeaderStats] = useState({ total: 0, stok_menipis: 0, nilai_modal: 0, total_kategori: 0 });
  const [kategori, setKategori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kategoriId, setKategoriId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ stok_baru: "", alasan: "" });
  const [showAdjustPin, setShowAdjustPin] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("produkView") || "card");
  // Barcode generator
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [sortBy, setSortBy] = useState("nama");
  const [sortOrder, setSortOrder] = useState("asc");
  const [produkHasMore, setProdukHasMore] = useState(true);
  const [produkLoading, setProdukLoading] = useState(false);
  const PAGE_SIZE = 50;
  const scrollRef = useRef(null);
  const produkRef = useRef(produk);
  const produkRequestRef = useRef(0);
  produkRef.current = produk;
  const toggleView = () => {
    const next = viewMode === "card" ? "list" : "card";
    setViewMode(next);
    localStorage.setItem("produkView", next);
  };

  // Map column key ke backend sort field
  const SORT_FIELD = { nama: "nama", harga: "harga_jual", stok: "stok" };
  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder(key === "nama" ? "asc" : "desc");
    }
  };

  const loadHeaderStats = useCallback(() => {
    invoke("get_produk_stats")
      .then((s) => setHeaderStats({
        total: Number(s?.total || 0),
        stok_menipis: Number(s?.stok_menipis || 0),
        nilai_modal: Number(s?.nilai_modal || 0),
        total_kategori: Number(s?.total_kategori || 0),
      }))
      .catch(() => {});
  }, []);

  const loadProduk = useCallback(() => {
    const requestId = ++produkRequestRef.current;
    const initialLoad = produkRef.current.length === 0;
    if (initialLoad) setLoading(true);
    setProdukHasMore(true);
    loadHeaderStats();
    invoke("list_produk", { search: search || null, kategoriId, onlyActive: false, limit: PAGE_SIZE, sortBy: SORT_FIELD[sortBy], sortOrder })
      .then((data) => {
        if (requestId !== produkRequestRef.current) return;
        setProduk(data);
        setProdukHasMore(data.length >= PAGE_SIZE);
      })
      .catch((error) => { if (requestId === produkRequestRef.current) console.error(error); })
      .finally(() => { if (requestId === produkRequestRef.current) setLoading(false); });
  }, [search, kategoriId, sortBy, sortOrder, loadHeaderStats]);

  // Load more via cursor (only for default sort)
  const loadMore = useCallback(() => {
    if (produkLoading || !produkHasMore) return;
    const current = produkRef.current;
    if (!current.length) return;
    const requestId = produkRequestRef.current;
    const last = current[current.length - 1];
    const cursorValue = sortBy === "nama" ? last.nama : String(last[SORT_FIELD[sortBy]] ?? "0");
    setProdukLoading(true);
    invoke("list_produk", { search: search || null, kategoriId, onlyActive: false, limit: PAGE_SIZE, cursorId: last.id, cursorVal: cursorValue, sortBy: SORT_FIELD[sortBy], sortOrder })
      .then((data) => {
        if (requestId !== produkRequestRef.current) return;
        setProduk((prev) => [...prev, ...data]);
        setProdukHasMore(data.length >= PAGE_SIZE);
      })
      .catch(console.error)
      .finally(() => setProdukLoading(false));
  }, [search, kategoriId, sortBy, sortOrder, produkHasMore, produkLoading]);

  // Load awal kategori
  useEffect(() => {
    invoke("list_kategori")
      .then(setKategori)
      .catch(console.error);
  }, []);

  // Re-fetch saat search, kategori, atau sort berubah
  useEffect(() => { loadProduk(); }, [loadProduk]);

  // Virtual scrolling untuk card view
  const gridCols = 4;
  const produkVirtualizer = useVirtualizer({
    count: viewMode === "card" ? Math.ceil(produk.length / gridCols) : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 150,
    overscan: 3,
  });

  // Infinite scroll: ketika scroll mendekati akhir, load more
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading || !produkHasMore || produkLoading) return;
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) loadMore();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [produkHasMore, produkLoading, loadMore, loading]);

  // Escape menutup popup produk yang paling atas terlebih dahulu.
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (barcodeItem) { event.preventDefault(); setBarcodeItem(null); return; }
      if (showImportCSV) { event.preventDefault(); setShowImportCSV(false); }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [barcodeItem, showImportCSV]);

  const handleDelete = async (id, nama) => {
    if (!confirm(`Hapus produk "${nama}"?`)) return;
    try {
      await invoke("delete_produk", { id });
      addToast("Produk dihapus", "success");
      loadProduk();
    } catch (e) {
      addToast(`Gagal hapus: ${e}`, "error");
    }
  };

  const openAdjust = (p) => {
    setAdjustProduct(p);
    setAdjustForm({ stok_baru: String(p.stok), alasan: "" });
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    if (!adjustProduct) return;
    const alasan = adjustForm.alasan.trim();
    if (alasan.length < 5) return addToast("Alasan minimal 5 karakter", "error");
    if ([...alasan].every((char) => char === alasan[0])) return addToast("Alasan tidak boleh memakai karakter yang sama", "error");
    void checkPinsThenAdjust();
  };

  const doAdjust = async (pin) => {
    try {
      await invoke("adjust_stock", { input: { produkId: adjustProduct.id, stokBaru: Number(adjustForm.stok_baru || 0), alasan: adjustForm.alasan.trim(), adminPin: pin || null } });
      addToast("Stok disesuaikan dan audit dicatat", "success");
      setAdjustProduct(null);
      setShowAdjustPin(false);
      loadProduk();
    } catch (e) { addToast(`Gagal penyesuaian stok: ${e}`, "error"); }
  };

  const checkPinsThenAdjust = async () => {
    const pins = await invoke("list_kasir_pins");
    const adminPins = (pins || []).filter((p) => p.role === "admin" || p.role === "supervisor");
    if (adminPins.length === 0) {
      await doAdjust("");
    } else {
      setShowAdjustPin(true);
    }
  };

  // Proses file XLSX — parsing di Rust agar tidak lag di frontend
  const processXlsxFile = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const res = await invoke("import_produk_xlsx", { fileBytes: Array.from(bytes) });
      setImportResult(res);
      addToast(`Import XLSX: ${res.dibuat} baru, ${res.diupdate} update, ${res.dilewati} lewat`, "success");
      setShowImportCSV(false);
      setSearch("");
      setKategoriId(null);
      setLoading(true);
      invoke("list_produk", { onlyActive: false })
        .then(setProduk)
        .catch(console.error)
        .finally(() => setLoading(false));
    } catch (e) {
      addToast(`Gagal import: ${String(e)}`, "error");
    }
  };
  // Format S multi-barcode (Item.xlsx / Item 3 / Item 4) — BARCODE1..4
  const XLSX_HEADERS = [
    "KODEITEM", "NAMAITEM", "JENIS", "MEREK",
    "SATUAN1", "SATUAN2", "SATUAN3", "SATUAN4",
    "BARCODE1", "BARCODE2", "BARCODE3", "BARCODE4",
    "KONVERSI1", "KONVERSI2", "KONVERSI3", "KONVERSI4",
    "HARGAPOKOK1", "HARGAPOKOK2", "HARGAPOKOK3", "HARGAPOKOK4",
    "HARGAJUAL1", "HARGAJUAL2", "HARGAJUAL3", "HARGAJUAL4",
    "STOK", "STOKMIN", "TIPE", "SERIAL", "RAK", "DEPT", "SUPPLIER", "KONSINYASI", "SISTEMHPP", "KETERANGAN",
  ];

  const downloadTemplateCSV = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const data = [
        ["TIPE", "S", "=> PENTING JANGAN HAPUS BARIS INI"],
        XLSX_HEADERS,
        [
          "CAM001", "Contoh Produk Multi SKU", "CAMPURAN", "MEREK A",
          "PCS", "", "", "",
          "8991234567890", "8991234567891", "", "",
          "1", "0", "0", "0",
          "5000", "0", "0", "0",
          "7500", "0", "0", "0",
          "20", "5", "BARANG", "N", "RAK-A1", "UTM", "Supplier A", "N", "FIFO", "Keterangan",
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Item");
      const xlsxBytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: "template-produk.xlsx",
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
      });
      if (!path) return;
      await writeFile(path, xlsxBytes);
      addToast("Template XLSX tersimpan", "success");
    } catch (e) {
      addToast(`Gagal menyimpan template: ${e}`, "error");
    }
  };

  const exportCSV = async () => {
    try {
      const XLSX = await import("xlsx");
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: `produk-${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
      });
      if (!path) return;
      const wb = XLSX.utils.book_new();
      const rows = [
        ["TIPE", "S", "=> PENTING JANGAN HAPUS BARIS INI"],
        XLSX_HEADERS,
        ...produk.map((p) => {
          const barcodes = Array.isArray(p.skus) && p.skus.length ? p.skus : (p.sku ? [p.sku] : []);
          return [
            p.kode_item || "",
            p.nama || "",
            p.kategori_nama || "",
            p.merek || "",
            (p.satuan || "pcs").toUpperCase(), "", "", "",
            barcodes[0] || "", barcodes[1] || "", barcodes[2] || "", barcodes[3] || "",
            "1", "0", "0", "0",
            String(p.harga_beli || 0), "0", "0", "0",
            String(p.harga_jual || 0), "0", "0", "0",
            String(p.stok || 0),
            String(p.stok_minimum || 0),
            p.tipe_item || "BARANG",
            "N",
            p.rak || "",
            "",
            p.supplier_nama || "",
            "N",
            "FIFO",
            p.kata_kunci || "",
          ];
        }),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Item");
      const xlsxBytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      await writeFile(path, xlsxBytes);
      addToast("Data produk berhasil diexport ke XLSX", "success");
    } catch (e) {
      addToast(`Gagal export XLSX: ${e}`, "error");
    }
  };

  const lowStock = useMemo(() => produk.filter((p) => Number(p.stok) <= Number(p.stok_minimum || 0)), [produk]);
  const nilaiStok = useMemo(
    () => produk.reduce((s, p) => s + Number(p.stok || 0) * Number(p.harga_beli || 0), 0),
    [produk]
  );

  const columns = [
    {
      key: "nama",
      label: "Produk",
      render: (p) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {p.foto_path ? (
            <img src={convertFileSrc(p.foto_path)} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: "var(--color-text-secondary)" }}>inventory_2</span>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{p.nama}</div>
            <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{p.sku || "—"} · {p.satuan || "pcs"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "harga",
      label: "Harga",
      align: "right",
      render: (p) => (
        <div>
          {isDiskonAktif(p) ? (
            <>
              <div style={{ textDecoration: "line-through", fontSize: 11, color: "var(--color-text-secondary)" }}>{rupiah(p.harga_jual)}</div>
              <strong style={{ color: "var(--color-expense-red)" }}>{rupiah(hargaAktif(p))}</strong>
            </>
          ) : (
            <strong>{rupiah(hargaAktif(p))}</strong>
          )}
        </div>
      ),
    },
    {
      key: "stok",
      label: "Stok",
      align: "right",
      render: (p) => (
        <StatusBadge
          label={`${p.stok}`}
          tone={Number(p.stok) <= Number(p.stok_minimum || 0) ? "danger" : "success"}
        />
      ),
    },
    {
      key: "aksi",
      label: "Aksi",
      render: (p) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button type="button" className="btn-icon" title="Edit" onClick={() => { setEditId(p.id); setShowForm(true); }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
          </button>
          <button type="button" className="btn-icon" title="Sesuaikan stok" onClick={() => openAdjust(p)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
          </button>
          <button type="button" className="btn-icon" title="Barcode" onClick={() => setBarcodeItem(p)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>barcode</span>
          </button>
          <button type="button" className="btn-icon" title="Hapus" onClick={() => handleDelete(p.id, p.nama)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-expense-red)" }}>delete</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="MASTER DATA"
      title="Daftar Item / Barang"
      description="Kelola katalog produk, stok, harga promo, barcode, dan import/export Excel."
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={toggleView}>
            <span className="material-symbols-outlined">{viewMode === "card" ? "view_list" : "grid_view"}</span>
            {viewMode === "card" ? "List" : "Kartu"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => { setImportResult(null); setShowImportCSV(true); }}>
            <span className="material-symbols-outlined">upload_file</span>
            Import Excel
          </button>
          <button type="button" className="btn-secondary" onClick={downloadTemplateCSV}>
            <span className="material-symbols-outlined">download</span>
            Template Excel
          </button>
          <button type="button" className="btn-secondary" onClick={exportCSV}>
            <span className="material-symbols-outlined">file_download</span>
            Export Excel
          </button>
          <button type="button" className="btn-primary sales-page__add" onClick={() => { setEditId(null); setShowForm(true); }}>
            <span className="material-symbols-outlined">add</span>
            Tambah Produk
          </button>
        </>
      }
      stats={[
        { label: "Total Produk", value: headerStats.total, icon: "inventory_2" },
        { label: "Stok Menipis", value: headerStats.stok_menipis, icon: "warning", tone: headerStats.stok_menipis ? "var(--color-warning-amber)" : undefined },
        { label: "Nilai Modal Stok", value: rupiah(headerStats.nilai_modal), icon: "payments" },
        { label: "Kategori", value: headerStats.total_kategori || kategori.length, icon: "category" },
      ]}
    >
      <InfoNote icon="inventory">
        Filter kategori dan cari nama/SKU. Stok menipis ditandai merah. Penyesuaian stok tercatat di audit trail.
      </InfoNote>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          type="button"
          className={kategoriId == null ? "btn-primary" : "btn-secondary"}
          onClick={() => setKategoriId(null)}
          style={{ padding: "6px 12px", fontSize: 13 }}
        >
          Semua
        </button>
        {kategori.map((k) => (
          <button
            key={k.id}
            type="button"
            className={kategoriId === k.id ? "btn-primary" : "btn-secondary"}
            onClick={() => setKategoriId(k.id)}
            style={{ padding: "6px 12px", fontSize: 13 }}
          >
            {k.nama}
          </button>
        ))}
      </div>

      <DataPanel
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Cari nama / SKU produk..."
        onRefresh={loadProduk}
        loading={loading}
        isEmpty={produk.length === 0}
        emptyIcon="inventory_2"
        emptyTitle="Belum ada produk"
        emptyHint="Tambah produk manual atau import CSV."
      >
        <div ref={scrollRef} className="sales-panel__scroll" style={{ height: "calc(100vh - 320px)", overflowY: "scroll", scrollbarGutter: "stable" }}>
          {viewMode === "list" ? (
            <DataTable columns={columns} rows={produk} rowKey={(p) => p.id}
              sortable={["nama", "harga", "stok"]}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
          ) : (
            <div style={{ height: produkVirtualizer.getTotalSize() + "px", width: "100%", position: "relative" }}>
              {produkVirtualizer.getVirtualItems().map((vRow) => {
                const startIdx = vRow.index * gridCols;
                const rowItems = produk.slice(startIdx, startIdx + gridCols);
                return (
                  <div
                    key={vRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: vRow.size + "px",
                      transform: "translateY(" + vRow.start + "px)",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {rowItems.map((p) => {
                      const low = Number(p.stok) <= Number(p.stok_minimum || 0);
                      return (
                        <div key={p.id} className="card" style={{ padding: 12, border: low ? "1px solid var(--color-expense-red)" : undefined }}>
                          <div style={{ height: 100, borderRadius: 10, background: "var(--color-surface-container-low)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 8 }}>
                            {p.foto_path ? (
                              <img src={convertFileSrc(p.foto_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "var(--color-text-secondary)" }}>inventory_2</span>
                            )}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{p.nama}</div>
                          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{p.sku || "—"}</div>
                          <div style={{ marginTop: 6 }}>
                            {isDiskonAktif(p) ? (
                              <>
                                <span style={{ textDecoration: "line-through", fontSize: 11, color: "var(--color-text-secondary)", marginRight: 6 }}>{rupiah(p.harga_jual)}</span>
                                <strong style={{ color: "var(--color-expense-red)" }}>{rupiah(hargaAktif(p))}</strong>
                              </>
                            ) : (
                              <strong>{rupiah(hargaAktif(p))}</strong>
                            )}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <StatusBadge label={"Stok " + p.stok} tone={low ? "danger" : "success"} />
                          </div>
                          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                            <button type="button" className="btn-icon" onClick={() => { setEditId(p.id); setShowForm(true); }} aria-label="edit">
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                            </button>
                            <button type="button" className="btn-icon" onClick={() => openAdjust(p)} aria-label="adjust">
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
                            </button>
                            <button type="button" className="btn-icon" onClick={() => setBarcodeItem(p)} aria-label="barcode">
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>barcode</span>
                            </button>
                            <button type="button" className="btn-icon" onClick={() => handleDelete(p.id, p.nama)} aria-label="hapus">
                              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-expense-red)" }}>delete</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {produkLoading && <div style={{ textAlign: "center", padding: "1rem", color: "var(--color-text-secondary)" }}>Memuat...</div>}
        </div>
      </DataPanel>

      {showForm && (
        <ProdukForm
          editId={editId}
          kategori={kategori}
          onClose={() => { setShowForm(false); setEditId(null); }}
          onSaved={() => { setShowForm(false); setEditId(null); loadProduk(); }}
          onCategoryCreated={(k) => setKategori((prev) => [...prev, k])}
        />
      )}

      {adjustProduct && (
        <FormModal
          title="Sesuaikan Stok"
          description={`${adjustProduct.nama} — stok saat ini ${adjustProduct.stok}`}
          onClose={() => setAdjustProduct(null)}
          onSubmit={submitAdjust}
          submitLabel="Simpan Stok"
        >
          <div>
            <label className="input-label">Stok Baru</label>
            <input
              className="input-field"
              inputMode="numeric"
              value={adjustForm.stok_baru}
              onChange={(e) => setAdjustForm((f) => ({ ...f, stok_baru: e.target.value.replace(/\D/g, "") }))}
            />
          </div>
          <div>
            <label className="input-label">Alasan</label>
            <input
              className="input-field"
              value={adjustForm.alasan}
              onChange={(e) => setAdjustForm((f) => ({ ...f, alasan: e.target.value }))}
              placeholder="Contoh: koreksi opname"
            />
          </div>
        </FormModal>
      )}

      {showAdjustPin && (
        <PinGate autoSuccess role="admin" onCancel={() => { setShowAdjustPin(false); setAdjustProduct(null); }} onSuccess={doAdjust} />
      )}

      {showImportCSV && (
        <div className="modal-overlay" onClick={() => setShowImportCSV(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, position: "relative" }}>
            <button type="button" className="btn-icon" onClick={() => setShowImportCSV(false)} aria-label="Tutup" style={{ position: "absolute", top: 12, right: 12 }}>
              <span className="material-symbols-outlined">close</span>
            </button>
            <h3 className="text-headline-md">Import Produk Excel</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", margin: "0.25rem 0 1rem" }}>
              Format: KODEITEM, NAMAITEM, JENIS, SATUAN1, HARGAPOKOK1, HARGAJUAL1, STOK, STOKMIN
            </p>
            <DropZoneImport
              title="Pilih atau Drop File XLSX di sini"
              onFile={async (file) => { await processXlsxFile(file); }}
            />
            {importResult && (
              <div className="card" style={{ padding: "0.75rem", marginTop: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Dibuat</span><strong>{importResult.dibuat}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Diupdate</span><strong>{importResult.diupdate}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Dilewati</span><strong style={{ color: "var(--color-expense-red)" }}>{importResult.dilewati}</strong></div>
                {importResult.errors?.length > 0 && (
                  <div style={{ maxHeight: 80, overflowY: "auto", fontSize: 11, color: "var(--color-expense-red)", marginTop: 4 }}>
                    {importResult.errors.map((err, i) => <div key={i}>{err}</div>)}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => setShowImportCSV(false)}>
              Tutup
            </button>
          </div>
        </div>
      )}

      {barcodeItem && (
        <div className="modal-overlay" onClick={() => setBarcodeItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, position: "relative" }}>
            <button type="button" className="btn-icon" onClick={() => setBarcodeItem(null)} aria-label="Tutup" style={{ position: "absolute", top: 12, right: 12 }}><span className="material-symbols-outlined">close</span></button>
            <h3 className="text-headline-md" style={{ marginBottom: "0.5rem" }}>Barcode Produk</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              {barcodeItem.nama} — {barcodeItem.sku || "tanpa SKU"}
            </p>
            <div
              style={{ display: "flex", justifyContent: "center", padding: 12, background: "#fff", borderRadius: 8 }}
              dangerouslySetInnerHTML={{
                __html: generateBarcodeSVG(barcodeItem.sku || String(barcodeItem.id), 400, 100),
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setBarcodeItem(null)}>
                Tutup
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  try {
                    const svg = generateBarcodeSVG(barcodeItem.sku || String(barcodeItem.id), 400, 100);
                    const { save } = await import("@tauri-apps/plugin-dialog");
                    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                    const path = await save({
                      filters: [{ name: "SVG", extensions: ["svg"] }],
                      defaultPath: `barcode-${barcodeItem.sku || barcodeItem.id}.svg`,
                    });
                    if (path) {
                      await writeTextFile(path, svg);
                      addToast("Barcode tersimpan", "success");
                    }
                  } catch (err) {
                    addToast(`Gagal simpan: ${err}`, "error");
                  }
                }}
              >
                Simpan SVG
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}


function ProdukForm({ editId, kategori, onClose, onSaved, onCategoryCreated }) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showNewKat, setShowNewKat] = useState(false);
  const [newKatNama, setNewKatNama] = useState("");
  const [katList, setKatList] = useState(kategori);
  const [supplierList, setSupplierList] = useState([]);
  const [form, setForm] = useState({
    nama: "", kata_kunci: "", kategori_id: null, supplier_id: null, sku: "", satuan: "pcs",
    harga_beli: "", harga_jual: "", stok: "", stok_minimum: "",
    harga_diskon: "", diskon_berlaku_sampai: "",
    merek: "", tipe_item: "BARANG", rak: "", kode_item: "",
  });
  // Multi-SKU: SKU pertama = utama (tampil di kasir); sisanya barcode alternatif.
  const [skus, setSkus] = useState([""]);
  const [marginPersen, setMarginPersen] = useState("");
  // State khusus foto produk: path dari Rust (persisten) dan preview base64 lokal.
  const [fotoPath, setFotoPath] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoDirty, setFotoDirty] = useState(false);
  const [scanSkuOpen, setScanSkuOpen] = useState(false); // Modal scan barcode untuk SKU
  const [scanSkuIndex, setScanSkuIndex] = useState(0);

  useEffect(() => { setKatList(kategori); }, [kategori]);
  useEffect(() => { invoke("list_supplier").then(setSupplierList).catch(console.error); }, []);

  useEffect(() => {
    if (editId) {
      invoke("get_produk", { id: editId }).then((p) => {
        const list = Array.isArray(p.skus) && p.skus.length ? p.skus : (p.sku ? [p.sku] : [""]);
        setSkus(list.length ? list : [""]);
        setForm({
          nama: p.nama, kata_kunci: p.kata_kunci || "", kategori_id: p.kategori_id, supplier_id: p.supplier_id, sku: list[0] || p.sku || "",
          // Migrasi satuan lama ke singkatan baru via alias agar produk existing tidak error.
          satuan: UNIT_ALIASES[p.satuan] || p.satuan, harga_beli: String(p.harga_beli),
          harga_jual: String(p.harga_jual), stok: String(p.stok),
          stok_minimum: String(p.stok_minimum),
          harga_diskon: p.harga_diskon ? String(p.harga_diskon) : "",
          diskon_berlaku_sampai: p.diskon_berlaku_sampai || "",
          merek: p.merek || "",
          tipe_item: p.tipe_item || "BARANG",
          rak: p.rak || "",
          kode_item: p.kode_item || "",
        });
        // Inisialisasi foto produk: konversi path absolut ke URL yang bisa dirender WebView.
        setFotoPath(p.foto_path || null);
        setFotoPreview(p.foto_path ? convertFileSrc(p.foto_path) : null);
        setFotoDirty(false);
      }).catch(console.error);
    }
  }, [editId]);

  const handleNewKat = async () => {
    const nama = newKatNama.trim();
    if (!nama) { addToast("Nama kategori wajib diisi", "error"); return; }
    // Cek duplikat lokal untuk respons instan.
    if (katList.some((k) => k.nama.toLowerCase() === nama.toLowerCase())) {
      addToast("Nama kategori sudah ada", "error");
      return;
    }
    try {
      const k = await invoke("create_kategori", { input: { nama } });
      setKatList((prev) => [...prev, k].sort((a, b) => a.nama.localeCompare(b.nama)));
      // Parent juga diperbarui agar filter kategori tidak stale setelah modal ditutup.
      onCategoryCreated(k);
      setForm((prev) => ({ ...prev, kategori_id: k.id }));
      setNewKatNama("");
      setShowNewKat(false);
      addToast(`Kategori "${k.nama}" ditambahkan`, "success");
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  // Pilih foto produk lewat native file picker, simpan preview lokal.
  const pickFoto = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Gambar", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (!selected) return;
      const bytes = await readFile(selected);
      const blob = new Blob([bytes], { type: "image/jpeg" });
      setFotoPreview(URL.createObjectURL(blob));
      setFotoPath(selected);
      setFotoDirty(true);
    } catch (e) {
      addToast(`Gagal ambil foto: ${e}`, "error");
    }
  };

  const removeFoto = () => {
    setFotoPreview(null);
    setFotoPath(null);
    setFotoDirty(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) { addToast("Nama produk wajib diisi", "error"); return; }
    if (!form.harga_jual) { addToast("Harga jual wajib diisi", "error"); return; }
    setSaving(true);
    try {
      const skuList = skus.map((s) => s.trim()).filter(Boolean);
      const input = {
        nama: form.nama.trim(),
        kata_kunci: (form.kata_kunci || "").trim() || null,
        kategori_id: form.kategori_id || null,
        supplier_id: form.supplier_id || null,
        sku: skuList[0] || null,
        skus: skuList,
        satuan: form.satuan.trim() || "pcs",
        harga_beli: parseInt(form.harga_beli) || 0,
        harga_jual: parseInt(form.harga_jual),
        ...(editId ? {} : { stok: parseInt(form.stok) || 0 }),
        stok_minimum: parseInt(form.stok_minimum) || 0,
         foto_path: fotoPath,
         harga_diskon: parseInt(form.harga_diskon) || 0,
        diskon_berlaku_sampai: form.diskon_berlaku_sampai || null,
        merek: form.merek?.trim() || null,
        tipe_item: form.tipe_item?.trim() || null,
        rak: form.rak?.trim() || null,
        kode_item: form.kode_item?.trim() || null,
      };
      let savedId = editId;
      if (editId) {
        await invoke("update_produk", { id: editId, input });
        addToast("Produk diupdate", "success");
      } else {
        const created = await invoke("create_produk", { input });
        savedId = created.id;
        addToast("Produk ditambahkan", "success");
      }
      // Jika ada foto baru yang dipilih, kirim base64 ke Rust untuk disimpan permanen.
      if (fotoDirty && fotoPath && savedId) {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(fotoPath);
        await invoke("save_produk_foto", { produkId: savedId, fotoBase64: bytesToBase64(bytes) });
      } else if (fotoDirty && !fotoPath && savedId) {
        await invoke("delete_produk_foto", { produkId: savedId });
      }
      onSaved();
    } catch (e) {
      addToast(`Gagal: ${e}`, "error");
    }
    setSaving(false);
  };

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const setNum = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value.replace(/\D/g, "") }));

  // Escape menutup form produk hanya saat tidak sedang menyimpan perubahan.
  useEffect(() => {
    const handleEscape = (event) => { if (event.key === "Escape" && !saving) { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, saving]);

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        {/* Tombol close X kanan atas, disabled saat penyimpanan berlangsung */}
        <button type="button" className="btn-icon" onClick={onClose} disabled={saving} aria-label="Tutup" style={{ position: "absolute", top: 12, right: 12 }}>
          <span className="material-symbols-outlined">close</span>
        </button>
        <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>
          {editId ? "Edit Produk" : "Tambah Produk"}
        </h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Section Foto Produk (Stok & Visual Gap KasGo) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "16px",
                background: fotoPreview ? "none" : "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                border: "2px solid var(--color-surface-container-high)",
                boxShadow: "var(--shadow-elevation-low)",
                position: "relative"
              }}
            >
              {fotoPreview ? (
                <img src={fotoPreview} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: "40px", color: "#ffffff" }}>image</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={pickFoto}>
                {fotoPreview ? "Ubah Foto" : "Pilih Foto"}
              </button>
              {fotoPreview && (
                <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px", color: "var(--color-expense-red)", borderColor: "var(--color-expense-red)" }} onClick={removeFoto}>
                  Hapus
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="input-label">Nama Produk *</label>
            <input className="input-field" value={form.nama} onChange={set("nama")} placeholder="Nama produk" />
          </div>
          <div>
            <label className="input-label">Kata Kunci Lainnya</label>
            <input
              className="input-field"
              value={form.kata_kunci}
              onChange={set("kata_kunci")}
              placeholder="Contoh: colokan, colok, stop kontak"
            />
            <small className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Pisahkan kata kunci dengan koma.</small>
          </div>
          <div>
            <label className="input-label">Kategori</label>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <SearchSelect
                value={form.kategori_id || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, kategori_id: v ? parseInt(v) : null }))}
                options={katList.map((k) => ({ value: String(k.id), label: k.nama }))}
                placeholder="— Pilih Kategori —"
                className="input-field"
              />
              <button type="button" className="btn-icon" onClick={() => setShowNewKat(!showNewKat)} title="Tambah Kategori Baru">
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>add_circle</span>
              </button>
            </div>
            {showNewKat && (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <input className="input-field" style={{ flex: 1, fontSize: "13px" }} placeholder="Nama kategori baru" value={newKatNama} onChange={(e) => setNewKatNama(e.target.value)} autoFocus />
                <button type="button" className="btn-primary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={handleNewKat}>Buat</button>
                <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }} onClick={() => { setShowNewKat(false); setNewKatNama(""); }}>Batal</button>
              </div>
            )}
          </div>
          <div>
            <label className="input-label">Supplier</label>
            <SearchSelect
              value={form.supplier_id || ""}
              onChange={(v) => setForm((prev) => ({ ...prev, supplier_id: v ? parseInt(v) : null }))}
              options={supplierList.map((s) => ({ value: String(s.id), label: s.nama }))}
              placeholder="— Pilih Supplier —"
            />
          </div>
          <div>
            <label className="input-label">SKU / Barcode</label>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 6px" }}>
              SKU pertama tampil di kasir. Tambah barcode lain untuk warna/varian yang sama.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {skus.map((s, idx) => (
                <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)", minWidth: 52 }}>
                    {idx === 0 ? "Utama" : `#${idx + 1}`}
                  </span>
                  <input
                    className="input-field"
                    style={{ flex: 1 }}
                    value={s}
                    onChange={(e) => setSkus((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))}
                    placeholder={idx === 0 ? "SKU / barcode utama" : "Barcode tambahan"}
                  />
                  <button
                    type="button"
                    className="btn-icon"
                    title="Scan barcode"
                    onClick={() => { setScanSkuIndex(idx); setScanSkuOpen(true); }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>qr_code_scanner</span>
                  </button>
                  {skus.length > 1 && (
                    <button
                      type="button"
                      className="btn-icon"
                      title="Hapus"
                      onClick={() => setSkus((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                style={{ alignSelf: "flex-start", fontSize: 12, padding: "4px 10px" }}
                onClick={() => setSkus((prev) => [...prev, ""])}
              >
                + Tambah SKU
              </button>
            </div>
          </div>
          <div>
            <label className="input-label">Satuan</label>
            <SearchSelect
              value={form.satuan}
              onChange={(v) => setForm((prev) => ({ ...prev, satuan: v }))}
              options={UNIT_OPTIONS.flatMap((g) => g.options.map(([val, label]) => ({ value: val, label })))}
              placeholder="pcs"
            />
          </div>
          <div>
            <label className="input-label">Harga Beli</label>
            <RupiahInput value={form.harga_beli} onChange={(val) => {
              setForm((prev) => ({ ...prev, harga_beli: val }));
              const beli = parseInt(val.replace(/\D/g, "")) || 0;
              if (beli > 0 && marginPersen) {
                const persen = parseFloat(marginPersen) || 0;
                setForm((prev) => ({ ...prev, harga_jual: String(Math.round(beli * (1 + persen / 100))) }));
              }
            }} placeholder="0" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.75rem" }}>
            <div>
              <label className="input-label">Keuntungan (%)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input className="input-field" value={marginPersen} onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                  setMarginPersen(raw);
                  const persen = parseFloat(raw) || 0;
                  const beli = parseInt(form.harga_beli.replace(/\D/g, "")) || 0;
                  if (beli > 0) setForm((prev) => ({ ...prev, harga_jual: String(Math.round(beli * (1 + persen / 100))) }));
                }} placeholder="0" inputMode="decimal" />
                <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>%</span>
              </div>
            </div>
            <div>
              <label className="input-label">Harga Jual *</label>
              <RupiahInput value={form.harga_jual} onChange={(val) => {
                setForm((prev) => ({ ...prev, harga_jual: val }));
                const jual = parseInt(val.replace(/\D/g, "")) || 0;
                const beli = parseInt(form.harga_beli.replace(/\D/g, "")) || 0;
                setMarginPersen(beli > 0 ? ((jual - beli) / beli * 100).toFixed(1) : "");
              }} placeholder="Contoh: 5000" />
            </div>
          </div>
          <div>
            <label className="input-label">Harga Diskon (Promo)</label>
            <RupiahInput value={form.harga_diskon} onChange={(val) => setForm((prev) => ({ ...prev, harga_diskon: val }))} placeholder="Opsional" />
          </div>
          <div>
            <label className="input-label">Berlaku Sampai</label>
            <DateField value={form.diskon_berlaku_sampai} onChange={(v) => set("diskon_berlaku_sampai")({ target: { value: v } })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="input-label">Merek</label>
              <input className="input-field" value={form.merek} onChange={set("merek")} placeholder="Opsional" />
            </div>
            <div>
              <label className="input-label">Tipe Item</label>
              <select className="input-field" value={form.tipe_item} onChange={set("tipe_item")}>
                <option value="BARANG">BARANG</option>
                <option value="JASA">JASA</option>
                <option value="PAKET">PAKET</option>
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Rak / Lokasi</label>
            <input className="input-field" value={form.rak} onChange={set("rak")} placeholder="Contoh: RAK-A1" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: editId ? "1fr" : "1fr 1fr", gap: "0.75rem" }}>
             {!editId && (
               <div>
                 <label className="input-label">Stok Awal</label>
                 <input className="input-field" value={form.stok} onChange={setNum("stok")} placeholder="0" inputMode="numeric" />
               </div>
             )}
            <div>
              <label className="input-label">Stok Minimum</label>
              <input className="input-field" value={form.stok_minimum} onChange={setNum("stok_minimum")} placeholder="0" inputMode="numeric" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>Batal</button>
            <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
              {saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : (editId ? "Simpan" : "Tambah")}
            </button>
          </div>
        </form>
      </div>
    </div>
      {scanSkuOpen && (
        <BarcodeScanner
          onDetected={(value) => {
            if (value && value.trim()) {
              const v = value.trim();
              setSkus((prev) => prev.map((x, i) => (i === scanSkuIndex ? v : x)));
            }
            setScanSkuOpen(false);
          }}
          onClose={() => setScanSkuOpen(false)}
        />
      )}
    </>
  );
}