// ============================================================
// Laporan.jsx — Laporan penjualan + PDF agregasi periode.
//
// Pola utama:
//   - Backend mengembalikan produk yang sudah digabung per nama produk + metode bayar.
//   - PDF menampilkan tabel utama lebar penuh: Nama Produk, Jumlah, Metode,
//     Harga Awal/modal, Total harga toko.
//   - Ringkasan bawah memakai lebar tabel yang sama agar rapi di A4.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import SearchSelect from "../components/SearchSelect";
import { formatDateId } from "../utils/dateFormat";
import {
  PageShell,
  DataPanel,
  DataTable,
  InfoNote,
  StatusBadge,
  rupiah,
} from "../components/PageKit";
const today = () => new Date().toISOString().slice(0, 10);

const shareCsv = async (csv, fileName) => {
  try {
    const file = new File([`\ufeff${csv}`], fileName, { type: "text/csv;charset=utf-8" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName, text: "Ekspor data MikroKas" });
      return true;
    }
  } catch {}
  // Fallback: gunakan Tauri native save dialog
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: fileName,
    });
    if (!path) return false;
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, `\ufeff${csv}`);
    return true;
  } catch {}
  return false;
};
const labelPembayaran = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "qris") return "QRIS";
  if (normalized === "transfer") return "Transfer";
  if (normalized === "tunai") return "Tunai";
  return value || "—";
};

export default function Laporan() {
  const { addToast } = useToast();
  const [dari, setDari] = useState(today);
  const [sampai, setSampai] = useState(today);
  const [toko, setToko] = useState(null);
  const [barisProduk, setBarisProduk] = useState([]);
  const [keuntungan, setKeuntungan] = useState({ total_penjualan: 0, total_modal: 0, total_keuntungan: 0 });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // State tab laporan: "penjualan" (default) atau "inventori".
  // Tab inventori memakai backend get_ringkasan_inventori + list_laporan_inventori.
  const [tab, setTab] = useState("penjualan");
  const [ringkasanInv, setRingkasanInv] = useState(null);
  const [barisInv, setBarisInv] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [barisPelanggan, setBarisPelanggan] = useState([]);
  const [loadingPelanggan, setLoadingPelanggan] = useState(false);
  const [barisPembelian, setBarisPembelian] = useState([]);
  const [loadingPembelian, setLoadingPembelian] = useState(false);
  const [barisPengeluaran, setBarisPengeluaran] = useState([]);
  const [loadingPengeluaran, setLoadingPengeluaran] = useState(false);
  const [totalRetur, setTotalRetur] = useState(0);
  const [sortLaporan, setSortLaporan] = useState({ by: null, order: "asc" });

  // Sort helper: client-side sort berdasarkan field name dan direction
  const sortData = (data, field, order) => {
    if (!field || !data) return data;
    return [...data].sort((a, b) => {
      const va = a[field] ?? "";
      const vb = b[field] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).toLowerCase().localeCompare(String(vb).toLowerCase());
      return order === "desc" ? -cmp : cmp;
    });
  };

  // Handler klik header kolom sortable
  const handleSortLaporan = (tabKey, field) => {
    setSortLaporan((prev) => {
      if (prev.tab === tabKey && prev.by === field) {
        return { tab: tabKey, by: field, order: prev.order === "asc" ? "desc" : "asc" };
      }
      return { tab: tabKey, by: field, order: "asc" };
    });
  };

  // Reset sort saat ganti tab
  useEffect(() => { setSortLaporan({ by: null, order: "asc" }); }, [tab]);

  useEffect(() => { invoke("get_toko").then(setToko).catch(console.error); }, []);

  const filterData = async () => {
    setLoading(true);
    try {
      const [produkData, profitData, returData] = await Promise.all([
        invoke("list_laporan_produk_terjual", { dari, sampai }),
        invoke("get_keuntungan_penjualan", { dari, sampai }),
        invoke("get_total_retur", { dari, sampai }),
      ]);
      setBarisProduk(produkData);
      setKeuntungan(profitData);
      setTotalRetur(returData?.total_retur || 0);
    } catch (e) {
      addToast(`Gagal memuat data laporan: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { filterData(); }, [dari, sampai]);

  // Ambil data laporan inventori hanya saat tab inventori pertama kali dibuka.
  useEffect(() => {
    if (tab !== "inventori" || ringkasanInv) return;
    setLoadingInv(true);
    Promise.all([
      invoke("get_ringkasan_inventori"),
      invoke("list_laporan_inventori"),
    ])
      .then(([ringkasan, rows]) => {
        setRingkasanInv(ringkasan);
        setBarisInv(rows);
      })
      .catch((e) => addToast(`Gagal memuat inventori: ${e}`, "error"))
      .finally(() => setLoadingInv(false));
  }, [tab, ringkasanInv]);

  useEffect(() => {
    if (tab !== "pelanggan") return;
    setLoadingPelanggan(true);
    invoke("get_laporan_pelanggan")
      .then(setBarisPelanggan)
      .catch((e) => addToast(`Gagal memuat laporan pelanggan: ${e}`, "error"))
      .finally(() => setLoadingPelanggan(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== "pembelian") return;
    setLoadingPembelian(true);
    invoke("list_laporan_pembelian_detail", { dari, sampai })
      .then(setBarisPembelian)
      .catch((e) => addToast(`Gagal memuat laporan pembelian: ${e}`, "error"))
      .finally(() => setLoadingPembelian(false));
  }, [tab, dari, sampai]);

  useEffect(() => {
    if (tab !== "pengeluaran") return;
    setLoadingPengeluaran(true);
    invoke("list_kas", { dari, sampai })
      .then((data) => setBarisPengeluaran(data.filter((k) => k.tipe === "pengeluaran")))
      .catch((e) => addToast(`Gagal memuat pengeluaran: ${e}`, "error"))
      .finally(() => setLoadingPengeluaran(false));
  }, [tab, dari, sampai]);

  const totalQty = barisProduk.reduce((sum, row) => sum + Number(row.total_qty || 0), 0);
  const totalModal = barisProduk.reduce((sum, row) => sum + Number(row.total_modal || 0), 0);
  const totalHarga = barisProduk.reduce((sum, row) => sum + Number(row.total_harga || 0), 0);
  const pelangganAktif = barisPelanggan.filter((row) => Number(row.total_transaksi || 0) > 0);
  const totalBelanjaPelanggan = pelangganAktif.reduce((sum, row) => sum + Number(row.total_belanja || 0), 0);
  const totalPoinPelanggan = pelangganAktif.reduce((sum, row) => sum + Number(row.poin_loyalty || 0), 0);
  const totalQtyPembelian = barisPembelian.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const totalPembelian = barisPembelian.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
  const totalPengeluaran = barisPengeluaran.reduce((sum, row) => sum + Number(row.jumlah || 0), 0);

  // Data terurut per tab — sorted client-side
  const sortedPenjualan = useMemo(() => sortData(barisProduk, sortLaporan.tab === "penjualan" ? sortLaporan.by : null, sortLaporan.order), [barisProduk, sortLaporan]);
  const sortedInventori = useMemo(() => sortData(barisInv, sortLaporan.tab === "inventori" ? sortLaporan.by : null, sortLaporan.order), [barisInv, sortLaporan]);
  const sortedPelanggan = useMemo(() => sortData(pelangganAktif, sortLaporan.tab === "pelanggan" ? sortLaporan.by : null, sortLaporan.order), [pelangganAktif, sortLaporan]);
  const sortedPembelian = useMemo(() => sortData(barisPembelian, sortLaporan.tab === "pembelian" ? sortLaporan.by : null, sortLaporan.order), [barisPembelian, sortLaporan]);
  const sortedPengeluaran = useMemo(() => sortData(barisPengeluaran, sortLaporan.tab === "pengeluaran" ? sortLaporan.by : null, sortLaporan.order), [barisPengeluaran, sortLaporan]);
  const sortedMargin = useMemo(() => {
    if (sortLaporan.tab !== "margin" || !sortLaporan.by) return barisProduk;
    const field = sortLaporan.by;
    // laba & margin adalah computed field — fallback ke total_harga atau total_modal
    return sortData(barisProduk, field, sortLaporan.order);
  }, [barisProduk, sortLaporan]);

  // Render sort indicator (arrow) untuk header kolom
  const sortIcon = (field) => {
    if (sortLaporan.by !== field) return null;
    const icon = sortLaporan.order === "desc" ? "expand_less" : "expand_more";
    return <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle", marginLeft: 4 }}>{icon}</span>;
  };

  const exportCsv = () => {
    if (!barisProduk.length) return addToast("Tidak ada data untuk diekspor", "error");
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Nama Produk", "Jumlah", "Metode Pembayaran", "Harga Awal", "Total"],
      ...barisProduk.map((row) => [row.produk_nama, row.total_qty, labelPembayaran(row.metode_bayar), row.total_modal, row.total_harga]),
      ["Total Penjualan", totalQty, "—", totalModal, totalHarga],
    ];
    shareCsv(rows.map((row) => row.map(esc).join(",")).join("\n"), `Laporan_${dari}_${sampai}.csv`);
    addToast("CSV laporan dibagikan", "success");
  };

  const exportInventoriCsv = () => {
    if (!barisInv.length) return addToast("Tidak ada data inventori untuk diekspor", "error");
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Nama Produk", "SKU", "Stok", "Satuan", "Stok Minimum", "Harga Beli", "Harga Jual", "Nilai Modal", "Nilai Jual", "Potensi Margin"],
      ...barisInv.map((row) => [row.nama, row.sku || "", row.stok, row.satuan, row.stok_minimum, row.harga_beli, row.harga_jual, row.nilai_modal, row.nilai_jual, row.margin]),
      ["TOTAL", "", ringkasanInv?.total_stok || 0, "", "", "", "", ringkasanInv?.nilai_modal || 0, ringkasanInv?.nilai_jual || 0, ringkasanInv?.potensi_margin || 0],
    ];
    shareCsv(rows.map((row) => row.map(esc).join(",")).join("\n"), `Laporan_Inventori_${today()}.csv`);
    addToast("CSV inventori dibagikan", "success");
  };

  const exportPelangganCsv = () => {
    if (!barisPelanggan.length) return addToast("Tidak ada data pelanggan untuk diekspor", "error");
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Nama Pelanggan", "Telepon", "Total Transaksi", "Total Belanja", "Poin Loyalty"],
      ...barisPelanggan.map((row) => [row.customer_nama, row.customer_telepon || "", row.total_transaksi, row.total_belanja, row.poin_loyalty]),
      ["TOTAL", "", pelangganAktif.length, totalBelanjaPelanggan, totalPoinPelanggan],
    ];
    shareCsv(rows.map((row) => row.map(esc).join(",")).join("\n"), `Laporan_Loyalty_Pelanggan_${today()}.csv`);
    addToast("CSV pelanggan dibagikan", "success");
  };

  const exportMarginCsv = () => {
    if (!barisProduk.length) return addToast("Tidak ada data untuk diekspor", "error");
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Nama Produk", "Jumlah Terjual", "Total Modal", "Total Penjualan", "Laba Kotor", "Margin (%)"],
      ...barisProduk.map((row) => {
        const laba = row.total_harga - row.total_modal;
        const persen = row.total_harga > 0 ? ((laba / row.total_harga) * 100).toFixed(1) + "%" : "0%";
        return [row.produk_nama, row.total_qty, row.total_modal, row.total_harga, laba, persen];
      }),
      ["TOTAL", totalQty, totalModal, totalHarga, totalHarga - totalModal, totalHarga > 0 ? (((totalHarga - totalModal) / totalHarga) * 100).toFixed(1) + "%" : "0%"],
    ];
    shareCsv(rows.map((row) => row.map(esc).join(",")).join("\n"), `Laporan_Margin_Produk_${dari}_${sampai}.csv`);
    addToast("CSV margin produk dibagikan", "success");
  };

  const exportPembelianCsv = () => {
    if (!barisPembelian.length) return addToast("Tidak ada data pembelian untuk diekspor", "error");
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Tanggal", "ID Transaksi", "Supplier", "Produk", "Jumlah", "Harga Satuan", "Subtotal", "Catatan"],
      ...barisPembelian.map((row) => [row.tanggal, row.transaksi_id, row.supplier_nama || "", row.produk_nama, row.qty, row.harga_satuan, row.subtotal, row.catatan || ""]),
      ["TOTAL", "", "", "", totalQtyPembelian, "", totalPembelian, ""],
    ];
    shareCsv(rows.map((row) => row.map(esc).join(",")).join("\n"), `Laporan_Pembelian_${dari}_${sampai}.csv`);
    addToast("CSV pembelian dibagikan", "success");
  };

  const exportPengeluaranCsv = () => {
    if (!barisPengeluaran.length) return addToast("Tidak ada data pengeluaran untuk diekspor", "error");
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Tanggal", "Kategori", "Jumlah", "Keterangan"],
      ...barisPengeluaran.map((row) => [row.tanggal, row.kategori, row.jumlah, row.keterangan || ""]),
      ["TOTAL", "", totalPengeluaran, ""],
    ];
    shareCsv(rows.map((row) => row.map(esc).join(",")).join("\n"), `Laporan_Pengeluaran_${dari}_${sampai}.csv`);
    addToast("CSV pengeluaran dibagikan", "success");
  };
  const cetakPdf = async () => {
    if (!barisProduk.length) return addToast("Tidak ada data produk terjual di rentang ini", "error");
    setGenerating(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF("p", "mm", "a4");
      const margin = 14;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const tableWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 18;
      // Kolom PDF — A4: 210mm, margin 14mm kiri+kanan → tableWidth ~182mm
      // Layout: No(8mm) | Nama(50mm) | [gap] | Qty | Metode | Modal | Total
      // Setiap kolom uang punya 2 sub-kolom tetap: "Rp" (kiri, fixed x) + angka (kanan, right-align)
      // Dengan demikian semua "Rp" sejajar vertikal, dan semua angka rata kanan kolom
      const RIGHT_START = margin + 75;
      const COL_STEP    = 29;
      // total right edge = 193mm, reserve 24mm untuk angka → total_rp = 169
      // modal right edge = RIGHT_START + COL_STEP*2 = 133, reserve 24mm → modal_rp = 109
      const NUM_RESERVE = 24; // mm cukup untuk "99.999.999,00" pada font 7.8pt
      const col = {
        no:         margin + 3,
        nama:       margin + 11,
        qty:        RIGHT_START,
        metode:     RIGHT_START + COL_STEP * 0 + 4,
        modal:      RIGHT_START + COL_STEP * 2,
        modal_rp:   RIGHT_START + COL_STEP * 2 - NUM_RESERVE,
        total:      margin + tableWidth - 3,
        total_rp:   margin + tableWidth - 3 - NUM_RESERVE,
      };

      /**
       * wrapText — potong teks jadi array baris dengan batas maksimum karakter per baris.
       * Tidak pakai splitTextToSize (berbasis mm, tidak reliable antar font/size).
       * Char-based: tiap baris max maxChars karakter, potong di spasi terdekat agar
       * tidak memotong di tengah kata.
       *
       * @param {string} text     - Teks asli
       * @param {number} maxChars - Maksimum karakter per baris (default 30)
       * @returns {string[]}      - Array baris teks
       */
      const wrapText = (text, maxChars = 30) => {
        if (!text) return [""];
        // Jika teks pendek, kembalikan langsung tanpa looping
        if (text.length <= maxChars) return [text];
        const lines = [];
        let remaining = text.trim();
        while (remaining.length > maxChars) {
          // Cari spasi terakhir sebelum maxChars untuk potong di kata
          let cutAt = remaining.lastIndexOf(" ", maxChars);
          // Tidak ada spasi → paksa potong di maxChars (nama tanpa spasi)
          if (cutAt <= 0) cutAt = maxChars;
          lines.push(remaining.slice(0, cutAt).trim());
          remaining = remaining.slice(cutAt).trim();
        }
        if (remaining.length > 0) lines.push(remaining);
        return lines;
      };

      let y = 18;

      const setFont = (size, style = "normal", color = "#1f2937") => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(color);
      };

      const drawReportHeader = (showTitle = true) => {
        doc.setFillColor("#0f172a");
        doc.rect(0, 0, pageWidth, 31, "F");
        setFont(showTitle ? 16 : 11, "bold", "#ffffff");
        doc.text(showTitle ? "LAPORAN PENJUALAN" : "LAPORAN PENJUALAN — LANJUTAN", margin, 14);
        setFont(9, "normal", "#dbeafe");
        doc.text(toko?.nama_toko || "Toko Saya", margin, 21);
        setFont(8, "normal", "#cbd5e1");
        doc.text(`Periode ${dari} s.d. ${sampai}`, margin, 27);
        doc.text(`Dicetak ${new Date().toLocaleString("id-ID")}`, pageWidth - margin, 27, { align: "right" });
        y = 40;
      };

      const drawSectionTitle = (title) => {
        setFont(11, "bold", "#0f172a");
        doc.text(title, margin, y);
        y += 6;
      };

      /**
       * rupiahStr — format nilai rupiah jadi string dengan suffix ",00".
       * Khusus untuk konteks string (drawTwoColTable, metodeRows array).
       * Hasil: "Rp 1.234.567,00"
       *
       * @param {number} value - Nilai numerik
       * @returns {string} String terformat dengan ,00
       */
      const rupiahStr = (value) =>
        `Rp ${Math.floor(Number(value || 0)).toLocaleString("id-ID")},00`;

      /**
       * rupiahPdf — render harga di PDF dengan alignment ketat:
       *   - "Rp" SELALU di rpX (fixed per kolom) → vertikal sejajar
       *   - angka+",00" right-aligned ke rightEdge → rata kanan kolom
       *   - desimal sejajar otomatis karena ",00" lebar tetap
       *
       * @param {number} value      - Nilai numerik
       * @param {number} rpX        - X tetap untuk label "Rp" (SAMA setiap baris)
       * @param {number} rightEdge  - X kanan kolom untuk right-align angka
       * @param {number} yPos       - Y posisi
       * @param {string} [color]    - Warna opsional
       */
      const rupiahPdf = (value, rpX, rightEdge, yPos, color) => {
        if (color) doc.setTextColor(color);
        const intStr = Math.floor(Number(value || 0)).toLocaleString("id-ID");
        // Angka + ",00" digabung → right-align ke rightEdge → rata kanan + desimal sejajar
        doc.text(`${intStr},00`, rightEdge, yPos, { align: "right" });
        // "Rp" di posisi tetap per kolom → vertikal sejajar semua baris
        doc.text("Rp", rpX, yPos);
        if (color) doc.setTextColor("#334155");
      };

      /**
       * drawTableHeader — render baris header tabel produk.
       * Dipanggil di awal halaman dan saat addPage (withTable=true).
       */
      const drawTableHeader = () => {
        doc.setFillColor("#e2e8f0");
        doc.setDrawColor("#cbd5e1");
        doc.rect(margin, y, tableWidth, 9, "FD");
        setFont(7.8, "bold", "#334155");
        // Kolom No di kiri — 8mm, semua kolom lain digeser kanan
        doc.text("No", col.no, y + 6);
        doc.text("Nama Produk", col.nama, y + 6);
        doc.text("Jumlah", col.qty, y + 6, { align: "right" });
        doc.text("Metode", col.metode, y + 6);
        doc.text("Harga Awal", col.modal, y + 6, { align: "right" });
        doc.text("Total", col.total, y + 6, { align: "right" });
        y += 9;
      };

      const addPageIfNeeded = (height, withTable = false) => {
        if (y + height <= bottomLimit) return;
        doc.addPage();
        drawReportHeader(false);
        if (withTable) drawTableHeader();
      };

      const drawTwoColTable = (rows, highlightLast = false) => {
        doc.setFillColor("#0f172a");
        doc.rect(margin, y, tableWidth, 9, "F");
        setFont(8.5, "bold", "#ffffff");
        doc.text("Keterangan", margin + 3, y + 6);
        doc.text("Nominal", margin + tableWidth - 3, y + 6, { align: "right" });
        y += 9;
        rows.forEach(([label, value], index) => {
          const hi = highlightLast && index === rows.length - 1;
          doc.setFillColor(hi ? "#dcfce7" : "#ffffff");
          doc.setDrawColor("#e2e8f0");
          doc.rect(margin, y, tableWidth, 9, "FD");
          setFont(8.5, hi ? "bold" : "normal", hi ? "#166534" : "#334155");
          doc.text(label, margin + 3, y + 6);
          doc.text(value, margin + tableWidth - 3, y + 6, { align: "right" });
          y += 9;
        });
      };

      drawReportHeader();
      drawSectionTitle(`Rincian Penjualan ${dari} s.d. ${sampai}`);
      drawTableHeader();

      // PDF menggunakan sortedPenjualan agar urutan PDF sesuai urutan tabel di layar
      sortedPenjualan.forEach((row, index) => {
        const productLines = wrapText(row.produk_nama, 30);
        // rowHeight = lines × line pitch + top/bottom padding.
        // Line pitch 5mm untuk font 7.8pt — cukup aman, tidak hardcode jsPDF internal.
        const LINE_PITCH = 5;
        const ROW_PAD = 4;
        const rowHeight = Math.max(11, productLines.length * LINE_PITCH + ROW_PAD);
        addPageIfNeeded(rowHeight, true);
        doc.setFillColor(index % 2 === 0 ? "#ffffff" : "#f8fafc");
        doc.setDrawColor("#e2e8f0");
        doc.rect(margin, y, tableWidth, rowHeight, "FD");
        setFont(7.8, "normal", "#334155");
        // Nomor urut item di kolom No (1-based)
        doc.text(String(index + 1), col.no, y + 6);
        doc.text(productLines, col.nama, y + 6);
        doc.text(`${Number(row.total_qty || 0).toLocaleString("id-ID")} terjual`, col.qty, y + 6, { align: "right" });
        doc.text(labelPembayaran(row.metode_bayar), col.metode, y + 6);
        // rupiahPdf: Rp sejajar, angka decimal-aligned, suffix .00
        rupiahPdf(row.total_modal, col.modal_rp, col.modal, y + 6);
        rupiahPdf(row.total_harga, col.total_rp, col.total, y + 6);
        y += rowHeight;
      });

      // Baris total berada di tabel utama, bukan tabel terpisah.
      addPageIfNeeded(10, true);
      doc.setFillColor("#dcfce7");
      doc.setDrawColor("#86efac");
      doc.rect(margin, y, tableWidth, 10, "FD");
      setFont(8.3, "bold", "#166534");
      doc.text("Total Penjualan", col.nama, y + 6.5);
      doc.text(`${totalQty.toLocaleString("id-ID")} terjual`, col.qty, y + 6.5, { align: "right" });
      doc.text("—", col.metode, y + 6.5);
      rupiahPdf(totalModal, col.modal_rp, col.modal, y + 6.5, "#166534");
      rupiahPdf(totalHarga, col.total_rp, col.total, y + 6.5, "#166534");
      y += 10;

      addPageIfNeeded(40);
      y += 10;
      drawSectionTitle("Ringkasan Keuangan");
      drawTwoColTable([
        ["Total Penjualan", rupiahStr(totalHarga)],
        ["Total Modal", rupiahStr(totalModal)],
        ["Keuntungan", rupiahStr(totalHarga - totalModal)],
      ], true);

      addPageIfNeeded(32);
      y += 8;
      drawSectionTitle("Ringkasan per Metode Pembayaran");
      const metodeMap = new Map();
      barisProduk.forEach((row) => {
        const metode = labelPembayaran(row.metode_bayar);
        metodeMap.set(metode, (metodeMap.get(metode) || 0) + Number(row.total_harga || 0));
      });
      const metodeRows = Array.from(metodeMap.entries()).map(([metode, total]) => [metode, rupiahStr(total)]);
      metodeRows.push(["Total", rupiahStr(totalHarga)]);
      drawTwoColTable(metodeRows, true);

      const pageCount = doc.internal.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor("#e2e8f0");
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        setFont(7.5, "normal", "#64748b");
        doc.text(`${toko?.nama_toko || "MikroKas"} • Halaman ${page} dari ${pageCount}`, margin, pageHeight - 7);
        doc.text("Laporan ini dibuat otomatis oleh sistem", pageWidth - margin, pageHeight - 7, { align: "right" });
      }

      await invoke("simpan_pdf", { pdfBase64: doc.output("datauristring"), namaFile: `Laporan_${dari}_${sampai}.pdf` });
      addToast("PDF berhasil dibuka di viewer default", "success");
    } catch (e) {
      addToast(`Gagal mencetak PDF: ${e}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PageShell
      eyebrow="ANALITIK"
      title="Laporan"
      description="Ringkasan penjualan, inventori, pelanggan, pembelian, pengeluaran, dan margin. Export CSV atau cetak PDF."
      actions={
        tab === "penjualan" ? (
          <>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!barisProduk.length}>Export CSV</button>
            <button type="button" className="btn-primary" onClick={cetakPdf} disabled={generating || !barisProduk.length}>
              {generating ? "Membuat PDF..." : "Cetak PDF"}
            </button>
          </>
        ) : tab === "inventori" ? (
          <button type="button" className="btn-primary" onClick={exportInventoriCsv} disabled={!barisInv.length}>Export CSV</button>
        ) : tab === "pelanggan" ? (
          <button type="button" className="btn-primary" onClick={exportPelangganCsv} disabled={!barisPelanggan.length}>Export CSV</button>
        ) : tab === "pembelian" ? (
          <button type="button" className="btn-primary" onClick={exportPembelianCsv} disabled={!barisPembelian.length}>Export CSV</button>
        ) : tab === "pengeluaran" ? (
          <button type="button" className="btn-primary" onClick={exportPengeluaranCsv} disabled={!barisPengeluaran.length}>Export CSV</button>
        ) : (
          <button type="button" className="btn-primary" onClick={exportMarginCsv} disabled={!barisProduk.length}>Export CSV</button>
        )
      }
      stats={
        tab === "penjualan"
          ? [
              { label: "Omzet", value: loading ? "…" : rupiah(totalHarga), icon: "payments", tone: "var(--color-income-green)" },
              { label: "Retur", value: loading ? "…" : rupiah(totalRetur), icon: "undo", tone: "var(--color-expense-red)" },
              { label: "Bersih", value: loading ? "…" : rupiah(totalHarga - totalRetur), icon: "savings" },
              { label: "Modal", value: loading ? "…" : rupiah(totalModal), icon: "inventory_2" },
            ]
          : tab === "inventori"
          ? [
              { label: "SKU Aktif", value: loadingInv ? "…" : (ringkasanInv?.total_sku ?? 0), icon: "inventory" },
              { label: "Nilai Modal", value: loadingInv ? "…" : rupiah(ringkasanInv?.nilai_modal), icon: "payments" },
              { label: "Stok Menipis", value: loadingInv ? "…" : (ringkasanInv?.stok_menipis ?? 0), icon: "warning", tone: "var(--color-warning-amber)" },
            ]
          : tab === "pembelian"
          ? [
              { label: "Total Pembelian", value: loadingPembelian ? "…" : rupiah(totalPembelian), icon: "local_shipping" },
              { label: "Jumlah", value: loadingPembelian ? "…" : totalQtyPembelian, icon: "shopping_cart" },
            ]
          : tab === "pengeluaran"
          ? [
              { label: "Total Pengeluaran", value: loadingPengeluaran ? "…" : rupiah(totalPengeluaran), icon: "money_off", tone: "var(--color-expense-red)" },
            ]
          : tab === "margin"
          ? [
              { label: "Omzet", value: loading ? "…" : rupiah(totalHarga), icon: "trending_up" },
              { label: "Laba", value: loading ? "…" : rupiah(totalHarga - totalModal), icon: "savings", tone: "var(--color-income-green)" },
            ]
          : [
              { label: "Pelanggan", value: loadingPelanggan ? "…" : barisPelanggan.length, icon: "group" },
            ]
      }
    >
      <InfoNote icon="analytics">
        Pilih tab laporan, atur rentang tanggal, lalu export CSV atau cetak PDF (tab Penjualan).
      </InfoNote>

      <section className="sales-panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="input-label">Dari Tanggal</label>
            <DateField value={dari} onChange={setDari} />
          </div>
          <div>
            <label className="input-label">Sampai Tanggal</label>
            <DateField value={sampai} onChange={setSampai} />
          </div>
        </div>
      </section>

      {/* Tab laporan — dropdown untuk layar sempit */}
      <div className="card" style={{ padding: "0.75rem", background: "var(--color-surface-container-low)" }}>
         <SearchSelect
           value={tab}
           onChange={setTab}
           style={{ width: "100%" }}
           options={[
             { value: "penjualan", label: "Penjualan" },
             { value: "inventori", label: "Inventori" },
             { value: "pelanggan", label: "Pelanggan" },
             { value: "pembelian", label: "Pembelian" },
             { value: "pengeluaran", label: "Pengeluaran" },
             { value: "margin", label: "Margin" },
           ]}
         />
      </div>

      {tab === "penjualan" ? (
        <div className="card" style={{ padding: "1.25rem", background: "var(--color-surface-container)" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><DateField value={dari} onChange={setDari} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><DateField value={sampai} onChange={setSampai} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
              <p className="text-label-md" style={{ opacity: 0.8 }}>Total Penjualan</p>
              <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(totalHarga)}</p>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
              <p className="text-label-md" style={{ opacity: 0.8 }}>Total Retur</p>
              <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(totalRetur)}</p>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
              <p className="text-label-md" style={{ opacity: 0.8 }}>Penjualan Bersih</p>
              <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(totalHarga - totalRetur)}</p>
            </div>
          </div>

          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Rincian Penjualan {dari} s.d. {sampai}</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "720px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                <th style={{ padding: "10px", borderRadius: "8px 0 0 0", width: "40px", textAlign: "center" }}>No</th>
                <th style={{ padding: "10px", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("penjualan", "produk_nama")}>Nama Produk{sortIcon("produk_nama")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("penjualan", "total_qty")}>Jumlah{sortIcon("total_qty")}</th>
                <th style={{ padding: "10px 14px", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("penjualan", "metode_bayar")}>Metode Pembayaran{sortIcon("metode_bayar")}</th>
                <th style={{ padding: "10px 15px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("penjualan", "total_modal")}>Harga Awal{sortIcon("total_modal")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none", borderRadius: "0 8px 0 0" }} onClick={() => handleSortLaporan("penjualan", "total_harga")}>Total{sortIcon("total_harga")}</th>
              </tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center" }}>Memuat data...</td></tr> : barisProduk.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Tidak ada data penjualan untuk periode ini.</td></tr>
                ) : (<>
                  {sortedPenjualan.map((row, i) => <tr key={i} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "12px", width: "40px" }}>{i + 1}</td><td style={{ padding: "10px", fontWeight: 500 }}>{row.produk_nama}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.total_qty} terjual</td><td style={{ padding: "10px" }}>{labelPembayaran(row.metode_bayar)}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_modal)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{rupiah(row.total_harga)}</td></tr>)}
                  <tr style={{ background: "#dcfce7", color: "#166534", fontWeight: 700 }}><td style={{ padding: "10px" }}></td><td style={{ padding: "10px" }}>Total Penjualan</td><td style={{ padding: "10px", textAlign: "right" }}>{totalQty} terjual</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalModal)}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalHarga)}</td></tr>
                </>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "inventori" ? (
        <div className="card" style={{ padding: "1.25rem", background: "var(--color-surface-container)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            {[
              ["Total SKU", `${ringkasanInv?.total_sku || 0} Produk`],
              ["Total Stok", `${Number(ringkasanInv?.total_stok || 0).toLocaleString("id-ID")} Unit`],
              ["Nilai Modal", rupiah(ringkasanInv?.nilai_modal)],
              ["Nilai Jual", rupiah(ringkasanInv?.nilai_jual)],
            ].map(([label, value]) => <div key={label} className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>{label}</p><p className="text-headline-sm" style={{ margin: "4px 0 0 0" }}>{loadingInv ? "…" : value}</p></div>)}
          </div>
          <div className="card" style={{ padding: "1rem", marginBottom: "1rem", background: "var(--color-primary)", color: "white", borderRadius: "14px", border: "none" }}>
            <p className="text-label-md" style={{ opacity: 0.85 }}>Potensi Margin</p>
            <p className="text-headline-md" style={{ margin: "4px 0 0" }}>{loadingInv ? "…" : rupiah(ringkasanInv?.potensi_margin)}</p>
          </div>
          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Laporan Inventori & Nilai Stok</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                <th style={{ padding: "10px", borderRadius: "8px 0 0 0", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("inventori", "nama")}>Produk{sortIcon("nama")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("inventori", "stok")}>Stok{sortIcon("stok")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("inventori", "nilai_modal")}>Nilai Modal{sortIcon("nilai_modal")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("inventori", "nilai_jual")}>Nilai Jual{sortIcon("nilai_jual")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none", borderRadius: "0 8px 0 0" }} onClick={() => handleSortLaporan("inventori", "margin")}>Margin{sortIcon("margin")}</th>
              </tr></thead>
              <tbody>
                {loadingInv ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center" }}>Memuat inventori...</td></tr> : barisInv.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada data produk aktif.</td></tr>
                ) : sortedInventori.map((row, i) => <tr key={row.id} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px", fontWeight: 500 }}>{row.nama}{row.sku ? <span className="text-label-md" style={{ marginLeft: "6px", color: "var(--color-text-secondary)" }}>#{row.sku}</span> : null}{row.stok <= row.stok_minimum ? <span className="badge badge-warning" style={{ marginLeft: "6px" }}>LOW STOCK</span> : null}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.stok} {row.satuan}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.nilai_modal)}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.nilai_jual)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "var(--color-income-green)" }}>{rupiah(row.margin)}</td></tr>) }
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "pelanggan" ? (
        <div className="card" style={{ padding: "1.25rem", background: "var(--color-surface-container)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>Total Pelanggan</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPelanggan ? "…" : pelangganAktif.length}</p></div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>Total Belanja</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPelanggan ? "…" : rupiah(totalBelanjaPelanggan)}</p></div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>Total Poin</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPelanggan ? "…" : totalPoinPelanggan.toLocaleString("id-ID")}</p></div>
          </div>
          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Leaderboard Loyalitas</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                <th style={{ padding: "10px", borderRadius: "8px 0 0 0", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pelanggan", "customer_nama")}>Nama{sortIcon("customer_nama")}</th>
                <th style={{ padding: "10px", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pelanggan", "customer_telepon")}>Telepon{sortIcon("customer_telepon")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pelanggan", "total_transaksi")}>Transaksi{sortIcon("total_transaksi")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pelanggan", "total_belanja")}>Total Belanja{sortIcon("total_belanja")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none", borderRadius: "0 8px 0 0" }} onClick={() => handleSortLaporan("pelanggan", "poin_loyalty")}>Poin{sortIcon("poin_loyalty")}</th>
              </tr></thead>
              <tbody>
                {loadingPelanggan ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center" }}>Memuat pelanggan...</td></tr> : pelangganAktif.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada data pelanggan aktif.</td></tr>
                ) : sortedPelanggan.map((row, i) => <tr key={row.customer_id} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px", fontWeight: 500 }}>{row.customer_nama}</td><td style={{ padding: "10px" }}>{row.customer_telepon || "—"}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.total_transaksi}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_belanja)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "var(--color-warning-amber)" }}>{Number(row.poin_loyalty || 0).toLocaleString("id-ID")}</td></tr>) }
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "pembelian" ? (
        <div className="card" style={{ padding: "1.25rem", background: "var(--color-surface-container)" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><DateField value={dari} onChange={setDari} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><DateField value={sampai} onChange={setSampai} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary)", color: "white", borderRadius: "12px", border: "none" }}><p className="text-label-md" style={{ opacity: 0.85 }}>Total Pembelian</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPembelian ? "…" : rupiah(totalPembelian)}</p></div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary)", color: "white", borderRadius: "12px", border: "none" }}><p className="text-label-md" style={{ opacity: 0.85 }}>Jumlah Restock</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPembelian ? "…" : totalQtyPembelian.toLocaleString("id-ID")}</p></div>
          </div>

          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Laporan Pembelian Supplier</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "860px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                <th style={{ padding: "10px", borderRadius: "8px 0 0 0", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pembelian", "tanggal")}>Tanggal{sortIcon("tanggal")}</th>
                <th style={{ padding: "10px", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pembelian", "supplier_nama")}>Supplier{sortIcon("supplier_nama")}</th>
                <th style={{ padding: "10px", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pembelian", "produk_nama")}>Produk{sortIcon("produk_nama")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pembelian", "qty")}>Jumlah{sortIcon("qty")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pembelian", "harga_satuan")}>Harga{sortIcon("harga_satuan")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none", borderRadius: "0 8px 0 0" }} onClick={() => handleSortLaporan("pembelian", "subtotal")}>Subtotal{sortIcon("subtotal")}</th>
              </tr></thead>
              <tbody>
                {loadingPembelian ? <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center" }}>Memuat pembelian...</td></tr> : barisPembelian.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada pembelian pada periode ini.</td></tr>
                ) : (<>
                  {sortedPembelian.map((row, i) => <tr key={`${row.transaksi_id}-${i}`} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px" }}>{formatDateId(row.tanggal)}</td><td style={{ padding: "10px", fontWeight: 500 }}>{row.supplier_nama || "—"}</td><td style={{ padding: "10px" }}>{row.produk_nama}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.qty}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.harga_satuan)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{rupiah(row.subtotal)}</td></tr>)}
                  <tr style={{ background: "#fef3c7", color: "#92400e", fontWeight: 700 }}><td style={{ padding: "10px" }}>Total</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{totalQtyPembelian}</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalPembelian)}</td></tr>
                </>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "pengeluaran" ? (
        <div className="card" style={{ padding: "1.25rem", background: "var(--color-surface-container)" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><DateField value={dari} onChange={setDari} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><DateField value={sampai} onChange={setSampai} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary)", color: "white", borderRadius: "12px", border: "none" }}>
              <p className="text-label-md" style={{ opacity: 0.85 }}>Total Pengeluaran</p>
              <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPengeluaran ? "…" : rupiah(totalPengeluaran)}</p>
            </div>
          </div>

          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Laporan Detail Pengeluaran</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                <th style={{ padding: "10px", borderRadius: "8px 0 0 0", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pengeluaran", "tanggal")}>Tanggal{sortIcon("tanggal")}</th>
                <th style={{ padding: "10px", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pengeluaran", "kategori")}>Kategori{sortIcon("kategori")}</th>
                <th style={{ padding: "10px", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("pengeluaran", "keterangan")}>Keterangan{sortIcon("keterangan")}</th>
                <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none", borderRadius: "0 8px 0 0" }} onClick={() => handleSortLaporan("pengeluaran", "jumlah")}>Jumlah{sortIcon("jumlah")}</th>
              </tr></thead>
              <tbody>
                {loadingPengeluaran ? <tr><td colSpan={4} style={{ padding: "20px", textAlign: "center" }}>Memuat pengeluaran...</td></tr> : barisPengeluaran.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada pengeluaran pada periode ini.</td></tr>
                ) : (<>
                  {sortedPengeluaran.map((row, i) => <tr key={row.id} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px" }}>{formatDateId(row.tanggal)}</td><td style={{ padding: "10px", fontWeight: 500 }}>{row.kategori}</td><td style={{ padding: "10px" }}>{row.keterangan || "—"}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "var(--color-expense-red)" }}>{rupiah(row.jumlah)}</td></tr>)}
                  <tr style={{ background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}><td style={{ padding: "10px" }}>Total</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalPengeluaran)}</td></tr>
                </>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "1.25rem", background: "var(--color-surface-container)" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><DateField value={dari} onChange={setDari} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><DateField value={sampai} onChange={setSampai} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
              <p className="text-label-md" style={{ opacity: 0.8 }}>Total Omset</p>
              <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(totalHarga)}</p>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
              <p className="text-label-md" style={{ opacity: 0.8 }}>Laba Kotor</p>
              <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(totalHarga - totalModal)}</p>
            </div>
          </div>

          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Laporan Margin & Profitabilitas</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead>
                <tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                  <th style={{ padding: "10px", borderRadius: "8px 0 0 0", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("margin", "produk_nama")}>Nama Produk{sortIcon("produk_nama")}</th>
                  <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("margin", "total_qty")}>Terjual{sortIcon("total_qty")}</th>
                  <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("margin", "total_modal")}>Total Modal{sortIcon("total_modal")}</th>
                  <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("margin", "total_harga")}>Total Omset{sortIcon("total_harga")}</th>
                  <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleSortLaporan("margin", "total_harga")}>Laba Kotor{sortIcon("total_harga")}</th>
                  <th style={{ padding: "10px", textAlign: "right", cursor: "pointer", userSelect: "none", borderRadius: "0 8px 0 0" }} onClick={() => handleSortLaporan("margin", "total_harga")}>Margin{sortIcon("total_harga")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center" }}>Memuat data...</td></tr> : barisProduk.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Tidak ada data penjualan untuk periode ini.</td></tr>
                ) : (<>
                  {sortedMargin.map((row, i) => {
                    const laba = row.total_harga - row.total_modal;
                    const persen = row.total_harga > 0 ? ((laba / row.total_harga) * 100).toFixed(1) + "%" : "0%";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}>
                        <td style={{ padding: "10px", fontWeight: 500 }}>{row.produk_nama}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{row.total_qty}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_modal)}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_harga)}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: laba >= 0 ? "var(--color-income-green)" : "var(--color-expense-red)", fontWeight: 600 }}>{rupiah(laba)}</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "var(--color-warning-amber)" }}>{persen}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#dcfce7", color: "#166534", fontWeight: 700 }}>
                    <td style={{ padding: "10px" }}>Total</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{totalQty}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalModal)}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalHarga)}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalHarga - totalModal)}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{totalHarga > 0 ? (((totalHarga - totalModal) / totalHarga) * 100).toFixed(1) + "%" : "0%"}</td>
                  </tr>
                </>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
