// ============================================================
// Laporan.jsx — Laporan penjualan + PDF agregasi periode.
//
// Pola utama:
//   - Backend mengembalikan produk yang sudah digabung per nama produk + metode bayar.
//   - PDF menampilkan tabel utama lebar penuh: Nama Produk, Jumlah, Metode,
//     Harga Awal/modal, Total harga toko.
//   - Ringkasan bawah memakai lebar tabel yang sama agar rapi di A4.
// ============================================================
import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
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
      ["Nama Produk", "Qty Terjual", "Total Modal", "Total Penjualan", "Laba Kotor", "Margin (%)"],
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
      ["Tanggal", "ID Transaksi", "Supplier", "Produk", "Qty", "Harga Satuan", "Subtotal", "Catatan"],
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
      const col = { nama: margin + 3, qty: margin + 72, metode: margin + 96, modal: margin + 133, total: margin + tableWidth - 3 };
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

      const drawTableHeader = () => {
        doc.setFillColor("#e2e8f0");
        doc.setDrawColor("#cbd5e1");
        doc.rect(margin, y, tableWidth, 9, "FD");
        setFont(7.8, "bold", "#334155");
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

      barisProduk.forEach((row, index) => {
        const productLines = doc.splitTextToSize(row.produk_nama, 66);
        const rowHeight = Math.max(10, productLines.length * 4 + 5);
        addPageIfNeeded(rowHeight, true);
        doc.setFillColor(index % 2 === 0 ? "#ffffff" : "#f8fafc");
        doc.setDrawColor("#e2e8f0");
        doc.rect(margin, y, tableWidth, rowHeight, "FD");
        setFont(7.8, "normal", "#334155");
        doc.text(productLines, col.nama, y + 6);
        doc.text(`${Number(row.total_qty || 0).toLocaleString("id-ID")} terjual`, col.qty, y + 6, { align: "right" });
        doc.text(labelPembayaran(row.metode_bayar), col.metode, y + 6);
        doc.text(rupiah(row.total_modal), col.modal, y + 6, { align: "right" });
        doc.text(rupiah(row.total_harga), col.total, y + 6, { align: "right" });
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
      doc.text(rupiah(totalModal), col.modal, y + 6.5, { align: "right" });
      doc.text(rupiah(totalHarga), col.total, y + 6.5, { align: "right" });
      y += 10;

      addPageIfNeeded(40);
      y += 10;
      drawSectionTitle("Ringkasan Keuangan");
      drawTwoColTable([
        ["Total Penjualan", rupiah(totalHarga)],
        ["Total Modal", rupiah(totalModal)],
        ["Keuntungan", rupiah(totalHarga - totalModal)],
      ], true);

      addPageIfNeeded(32);
      y += 8;
      drawSectionTitle("Ringkasan per Metode Pembayaran");
      const metodeMap = new Map();
      barisProduk.forEach((row) => {
        const metode = labelPembayaran(row.metode_bayar);
        metodeMap.set(metode, (metodeMap.get(metode) || 0) + Number(row.total_harga || 0));
      });
      const metodeRows = Array.from(metodeMap.entries()).map(([metode, total]) => [metode, rupiah(total)]);
      metodeRows.push(["Total", rupiah(totalHarga)]);
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", width: "100%" }}>
        <span className="text-headline-md">Laporan</span>
        <div style={{ display: "flex", gap: "0.5rem", flex: 1, justifyContent: "flex-end", minWidth: "240px" }}>
          {tab === "penjualan" ? (
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: "0.5rem" }}>
              <button className="btn-secondary" onClick={exportCsv} disabled={!barisProduk.length}>Export CSV</button>
              <button className="btn-primary" onClick={cetakPdf} disabled={generating || !barisProduk.length} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px" }}>
                {generating ? <span className="spinner" style={{ width: "14px", height: "14px" }} /> : <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>picture_as_pdf</span>}
                {generating ? "Membuat PDF…" : "Cetak PDF"}
              </button>
            </div>
          ) : tab === "inventori" ? (
            <button className="btn-primary" onClick={exportInventoriCsv} disabled={!barisInv.length}>Export CSV</button>
          ) : tab === "pelanggan" ? (
            <button className="btn-primary" onClick={exportPelangganCsv} disabled={!barisPelanggan.length}>Export CSV</button>
          ) : tab === "pembelian" ? (
            <button className="btn-primary" onClick={exportPembelianCsv} disabled={!barisPembelian.length}>Export CSV</button>
          ) : tab === "pengeluaran" ? (
            <button className="btn-primary" onClick={exportPengeluaranCsv} disabled={!barisPengeluaran.length}>Export CSV</button>
          ) : (
            <button className="btn-primary" onClick={exportMarginCsv} disabled={!barisProduk.length}>Export CSV</button>
          )}
        </div>
      </div>

      {/* Tab laporan — dropdown untuk layar sempit */}
      <div className="card" style={{ padding: "0.75rem", background: "var(--color-surface-container-low)" }}>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: "10px",
            border: "1px solid var(--color-surface-border)",
            background: "var(--color-surface)", color: "var(--color-text-primary)",
            fontSize: "14px", fontWeight: 600, cursor: "pointer",
          }}>
          <option value="penjualan">Penjualan</option>
          <option value="inventori">Inventori</option>
          <option value="pelanggan">Pelanggan</option>
          <option value="pembelian">Pembelian</option>
          <option value="pengeluaran">Pengeluaran</option>
          <option value="margin">Margin</option>
        </select>
      </div>

      {tab === "penjualan" ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
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
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}><th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Nama Produk</th><th style={{ padding: "10px", textAlign: "right" }}>Jumlah</th><th style={{ padding: "10px" }}>Metode Pembayaran</th><th style={{ padding: "10px", textAlign: "right" }}>Harga Awal</th><th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Total</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center" }}>Memuat data...</td></tr> : barisProduk.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Tidak ada data penjualan untuk periode ini.</td></tr>
                ) : (<>
                  {barisProduk.map((row, i) => <tr key={i} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px", fontWeight: 500 }}>{row.produk_nama}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.total_qty} terjual</td><td style={{ padding: "10px" }}>{labelPembayaran(row.metode_bayar)}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_modal)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{rupiah(row.total_harga)}</td></tr>)}
                  <tr style={{ background: "#dcfce7", color: "#166534", fontWeight: 700 }}><td style={{ padding: "10px" }}>Total Penjualan</td><td style={{ padding: "10px", textAlign: "right" }}>{totalQty} terjual</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalModal)}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalHarga)}</td></tr>
                </>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "inventori" ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            {[
              ["Total SKU", `${ringkasanInv?.total_sku || 0} Produk`],
              ["Total Stok", `${Number(ringkasanInv?.total_stok || 0).toLocaleString("id-ID")} Unit`],
              ["Nilai Modal", rupiah(ringkasanInv?.nilai_modal)],
              ["Nilai Jual", rupiah(ringkasanInv?.nilai_jual)],
            ].map(([label, value]) => <div key={label} className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>{label}</p><p className="text-headline-sm" style={{ margin: "4px 0 0 0" }}>{loadingInv ? "…" : value}</p></div>)}
          </div>
          <div className="card" style={{ padding: "1rem", marginBottom: "1rem", background: "linear-gradient(135deg, var(--color-success-green), var(--color-warning-amber))", color: "white", borderRadius: "14px" }}>
            <p className="text-label-md" style={{ opacity: 0.85 }}>Potensi Margin</p>
            <p className="text-headline-md" style={{ margin: "4px 0 0" }}>{loadingInv ? "…" : rupiah(ringkasanInv?.potensi_margin)}</p>
          </div>
          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Laporan Inventori & Nilai Stok</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}><th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Produk</th><th style={{ padding: "10px", textAlign: "right" }}>Stok</th><th style={{ padding: "10px", textAlign: "right" }}>Nilai Modal</th><th style={{ padding: "10px", textAlign: "right" }}>Nilai Jual</th><th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Margin</th></tr></thead>
              <tbody>
                {loadingInv ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center" }}>Memuat inventori...</td></tr> : barisInv.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada data produk aktif.</td></tr>
                ) : barisInv.map((row, i) => <tr key={row.id} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px", fontWeight: 500 }}>{row.nama}{row.sku ? <span className="text-label-md" style={{ marginLeft: "6px", color: "var(--color-text-secondary)" }}>#{row.sku}</span> : null}{row.stok <= row.stok_minimum ? <span className="badge badge-warning" style={{ marginLeft: "6px" }}>LOW STOCK</span> : null}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.stok} {row.satuan}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.nilai_modal)}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.nilai_jual)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "var(--color-success-green)" }}>{rupiah(row.margin)}</td></tr>) }
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "pelanggan" ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>Total Pelanggan</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPelanggan ? "…" : pelangganAktif.length}</p></div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>Total Belanja</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPelanggan ? "…" : rupiah(totalBelanjaPelanggan)}</p></div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.8 }}>Total Poin</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPelanggan ? "…" : totalPoinPelanggan.toLocaleString("id-ID")}</p></div>
          </div>
          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Leaderboard Loyalitas</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}><th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Nama</th><th style={{ padding: "10px" }}>Telepon</th><th style={{ padding: "10px", textAlign: "right" }}>Transaksi</th><th style={{ padding: "10px", textAlign: "right" }}>Total Belanja</th><th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Poin</th></tr></thead>
              <tbody>
                {loadingPelanggan ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center" }}>Memuat pelanggan...</td></tr> : pelangganAktif.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada data pelanggan aktif.</td></tr>
                ) : pelangganAktif.map((row, i) => <tr key={row.customer_id} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px", fontWeight: 500 }}>{row.customer_nama}</td><td style={{ padding: "10px" }}>{row.customer_telepon || "—"}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.total_transaksi}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_belanja)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "var(--color-warning-amber)" }}>{Number(row.poin_loyalty || 0).toLocaleString("id-ID")}</td></tr>) }
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "pembelian" ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "linear-gradient(135deg, var(--color-primary-container), var(--color-tertiary-container))", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.85 }}>Total Pembelian</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPembelian ? "…" : rupiah(totalPembelian)}</p></div>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "linear-gradient(135deg, var(--color-secondary-container), var(--color-warning-amber))", color: "white", borderRadius: "12px" }}><p className="text-label-md" style={{ opacity: 0.85 }}>Qty Restock</p><p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPembelian ? "…" : totalQtyPembelian.toLocaleString("id-ID")}</p></div>
          </div>

          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Laporan Pembelian Supplier</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "860px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}><th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Tanggal</th><th style={{ padding: "10px" }}>Supplier</th><th style={{ padding: "10px" }}>Produk</th><th style={{ padding: "10px", textAlign: "right" }}>Qty</th><th style={{ padding: "10px", textAlign: "right" }}>Harga</th><th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Subtotal</th></tr></thead>
              <tbody>
                {loadingPembelian ? <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center" }}>Memuat pembelian...</td></tr> : barisPembelian.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada pembelian pada periode ini.</td></tr>
                ) : (<>
                  {barisPembelian.map((row, i) => <tr key={`${row.transaksi_id}-${i}`} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px" }}>{row.tanggal}</td><td style={{ padding: "10px", fontWeight: 500 }}>{row.supplier_nama || "—"}</td><td style={{ padding: "10px" }}>{row.produk_nama}</td><td style={{ padding: "10px", textAlign: "right" }}>{row.qty}</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.harga_satuan)}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{rupiah(row.subtotal)}</td></tr>)}
                  <tr style={{ background: "#fef3c7", color: "#92400e", fontWeight: 700 }}><td style={{ padding: "10px" }}>Total</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{totalQtyPembelian}</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalPembelian)}</td></tr>
                </>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "pengeluaran" ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem", background: "linear-gradient(135deg, var(--color-expense-red), var(--color-tertiary))", color: "white", borderRadius: "12px" }}>
              <p className="text-label-md" style={{ opacity: 0.85 }}>Total Pengeluaran</p>
              <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loadingPengeluaran ? "…" : rupiah(totalPengeluaran)}</p>
            </div>
          </div>

          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Laporan Detail Pengeluaran</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "760px" }}>
              <thead><tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}><th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Tanggal</th><th style={{ padding: "10px" }}>Kategori</th><th style={{ padding: "10px" }}>Keterangan</th><th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Jumlah</th></tr></thead>
              <tbody>
                {loadingPengeluaran ? <tr><td colSpan={4} style={{ padding: "20px", textAlign: "center" }}>Memuat pengeluaran...</td></tr> : barisPengeluaran.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Belum ada pengeluaran pada periode ini.</td></tr>
                ) : (<>
                  {barisPengeluaran.map((row, i) => <tr key={row.id} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}><td style={{ padding: "10px" }}>{row.tanggal}</td><td style={{ padding: "10px", fontWeight: 500 }}>{row.kategori}</td><td style={{ padding: "10px" }}>{row.keterangan || "—"}</td><td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: "var(--color-expense-red)" }}>{rupiah(row.jumlah)}</td></tr>)}
                  <tr style={{ background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}><td style={{ padding: "10px" }}>Total</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px" }}>—</td><td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalPengeluaran)}</td></tr>
                </>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
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
                  <th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Nama Produk</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Terjual</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Total Modal</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Total Omset</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Laba Kotor</th>
                  <th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center" }}>Memuat data...</td></tr> : barisProduk.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Tidak ada data penjualan untuk periode ini.</td></tr>
                ) : (<>
                  {barisProduk.map((row, i) => {
                    const laba = row.total_harga - row.total_modal;
                    const persen = row.total_harga > 0 ? ((laba / row.total_harga) * 100).toFixed(1) + "%" : "0%";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}>
                        <td style={{ padding: "10px", fontWeight: 500 }}>{row.produk_nama}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{row.total_qty}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_modal)}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_harga)}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: laba >= 0 ? "var(--color-success-green)" : "var(--color-expense-red)", fontWeight: 600 }}>{rupiah(laba)}</td>
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
    </div>
  );
}
