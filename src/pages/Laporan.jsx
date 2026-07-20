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

  useEffect(() => { invoke("get_toko").then(setToko).catch(console.error); }, []);

  const filterData = async () => {
    setLoading(true);
    try {
      const [produkData, profitData] = await Promise.all([
        invoke("list_laporan_produk_terjual", { dari, sampai }),
        invoke("get_keuntungan_penjualan", { dari, sampai }),
      ]);
      setBarisProduk(produkData);
      setKeuntungan(profitData);
    } catch (e) {
      addToast(`Gagal memuat data laporan: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { filterData(); }, [dari, sampai]);

  const totalQty = barisProduk.reduce((sum, row) => sum + Number(row.total_qty || 0), 0);
  const totalModal = barisProduk.reduce((sum, row) => sum + Number(row.total_modal || 0), 0);
  const totalHarga = barisProduk.reduce((sum, row) => sum + Number(row.total_harga || 0), 0);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="text-headline-md">Laporan Penjualan</span>
        <button className="btn-primary" onClick={cetakPdf} disabled={generating || !barisProduk.length} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px" }}>
          {generating ? <span className="spinner" style={{ width: "14px", height: "14px" }} /> : <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>picture_as_pdf</span>}
          {generating ? "Membuat PDF…" : "Cetak PDF"}
        </button>
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}><label className="input-label">Dari Tanggal</label><input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="input-label">Sampai Tanggal</label><input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
          <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
            <p className="text-label-md" style={{ opacity: 0.8 }}>Total Penjualan</p>
            <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(totalHarga)}</p>
          </div>
          <div className="card" style={{ textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", color: "white", borderRadius: "12px" }}>
            <p className="text-label-md" style={{ opacity: 0.8 }}>Total Keuntungan</p>
            <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(keuntungan.total_keuntungan)}</p>
          </div>
        </div>

        <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Rincian Penjualan {dari} s.d. {sampai}</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "720px" }}>
            <thead>
              <tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                <th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Nama Produk</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Jumlah</th>
                <th style={{ padding: "10px" }}>Metode Pembayaran</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Harga Awal</th>
                <th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center" }}>Memuat data...</td></tr> : barisProduk.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Tidak ada data penjualan untuk periode ini.</td></tr>
              ) : (<>
                {barisProduk.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}>
                    <td style={{ padding: "10px", fontWeight: 500 }}>{row.produk_nama}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{row.total_qty} terjual</td>
                    <td style={{ padding: "10px" }}>{labelPembayaran(row.metode_bayar)}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(row.total_modal)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{rupiah(row.total_harga)}</td>
                  </tr>
                ))}
                <tr style={{ background: "#dcfce7", color: "#166534", fontWeight: 700 }}>
                  <td style={{ padding: "10px" }}>Total Penjualan</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{totalQty} terjual</td>
                  <td style={{ padding: "10px" }}>—</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalModal)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{rupiah(totalHarga)}</td>
                </tr>
              </>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
