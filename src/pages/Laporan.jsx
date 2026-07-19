import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

// Helper format rupiah standar Indonesia.
const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
// Default periode adalah hari ini.
const today = () => new Date().toISOString().slice(0, 10);

// Normalisasi tanggal ke format YYYY-MM-DD agar konsisten di UI dan PDF.
const tanggalLaporan = (value) => String(value || "").slice(0, 10) || "—";

// Label metode pembayaran dibuat rapi dengan casing standar.
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
  
  // Data diagregasi per produk (digunakan untuk tabel UI dan cetak PDF)
  const [barisProduk, setBarisProduk] = useState([]);
  const [keuntungan, setKeuntungan] = useState({ 
    total_penjualan: 0, 
    total_modal: 0, 
    total_keuntungan: 0 
  });
  
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Ambil data profil toko saat komponen mount.
  useEffect(() => {
    invoke("get_toko").then(setToko).catch(console.error);
  }, []);

  // Ambil data produk terjual dan keuntungan saat periode berubah.
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

  // Logika pembuatan PDF profesional dengan layout rapi.
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
      let y = 18;

      // Helper pembuat font agar kode lebih ringkas.
      const setFont = (size, style = "normal", color = "#1f2937") => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(color);
      };

      // Header profesional yang berulang di setiap halaman baru.
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

      // Judul section laporan.
      const drawSectionTitle = (title) => {
        setFont(11, "bold", "#0f172a");
        doc.text(title, margin, y);
        y += 6;
      };

      // Header tabel dengan border modern.
      const drawTableHeader = () => {
        doc.setFillColor("#e2e8f0");
        doc.setDrawColor("#cbd5e1");
        doc.rect(margin, y, tableWidth, 9, "FD");
        setFont(8, "bold", "#334155");
        doc.text("Tahun-Bulan-Tanggal", margin + 3, y + 6);
        doc.text("Produk Terjual", margin + 39, y + 6);
        doc.text("Pembayaran", margin + 119, y + 6);
        doc.text("Total", margin + tableWidth - 3, y + 6, { align: "right" });
        y += 9;
      };

      // Pindah halaman jika konten melebihi batas bawah.
      const addPageIfNeeded = (height) => {
        if (y + height <= bottomLimit) return;
        doc.addPage();
        y = 18;
        drawReportHeader(false);
        drawTableHeader();
      };

      drawReportHeader();
      drawSectionTitle("Rincian Produk Terjual");
      drawTableHeader();

      // Isi tabel dengan efek zebra row agar rapi.
      barisProduk.forEach((row, index) => {
        const produk = `${row.produk_nama} (${Number(row.total_qty || 0).toLocaleString("id-ID")} terjual)`;
        const productLines = doc.splitTextToSize(produk, 74);
        const rowHeight = Math.max(10, productLines.length * 4 + 5);
        
        addPageIfNeeded(rowHeight);

        doc.setFillColor(index % 2 === 0 ? "#ffffff" : "#f8fafc");
        doc.setDrawColor("#e2e8f0");
        doc.rect(margin, y, tableWidth, rowHeight, "FD");
        
        setFont(8, "normal", "#334155");
        doc.text(tanggalLaporan(row.tanggal), margin + 3, y + 6);
        doc.text(productLines, margin + 39, y + 6);
        doc.text(labelPembayaran(row.metode_bayar), margin + 119, y + 6);
        
        setFont(8, "normal", "#0f172a");
        doc.text(rupiah(row.total_harga), margin + tableWidth - 3, y + 6, { align: "right" });
        
        y += rowHeight;
      });

      // Tabel Ringkasan Keuangan dipindahkan ke bagian bawah file.
      addPageIfNeeded(40);
      y += 10;
      drawSectionTitle("Ringkasan Keuangan");

      // Membuat tabel ringkasan yang sejajar rapi.
      const summaryWidth = 95;
      const summaryStartX = margin + (tableWidth - summaryWidth) / 2;
      
      // Header tabel ringkasan
      doc.setFillColor("#0f172a");
      doc.rect(summaryStartX, y, summaryWidth, 9, "F");
      setFont(8.5, "bold", "#ffffff");
      doc.text("Keterangan", summaryStartX + 3, y + 6);
      doc.text("Nominal", summaryStartX + summaryWidth - 3, y + 6, { align: "right" });
      y += 9;

      const summaryRows = [
        ["Total Penjualan", rupiah(keuntungan.total_penjualan)],
        ["Total Modal", rupiah(keuntungan.total_modal)],
        ["Keuntungan", rupiah(keuntungan.total_keuntungan)],
      ];

      summaryRows.forEach(([label, value], index) => {
        const bgColor = index === 2 ? "#dcfce7" : "#ffffff";
        const textColor = index === 2 ? "#166534" : "#334155";
        const fontStyle = index === 2 ? "bold" : "normal";
        
        doc.setFillColor(bgColor);
        doc.setDrawColor("#e2e8f0");
        doc.rect(summaryStartX, y, summaryWidth, 9, "FD");
        
        setFont(8.5, fontStyle, textColor);
        doc.text(label, summaryStartX + 3, y + 6);
        doc.text(value, summaryStartX + summaryWidth - 3, y + 6, { align: "right" });
        y += 9;
      });

      // Footer profesional dengan nomor halaman.
      const pageCount = doc.internal.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor("#e2e8f0");
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        setFont(7.5, "normal", "#64748b");
        doc.text(`${toko?.nama_toko || "MikroKas"} • Halaman ${page} dari ${pageCount}`, margin, pageHeight - 7);
        doc.text("Laporan ini dibuat secara otomatis oleh sistem", pageWidth - margin, pageHeight - 7, { align: "right" });
      }

      // Buka PDF melalui plugin native.
      await invoke("simpan_pdf", {
        pdfBase64: doc.output("datauristring"),
        namaFile: `Laporan_${dari}_${sampai}.pdf`,
      });
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
        <button className="btn-primary" onClick={cetakPdf} disabled={generating || !barisProduk.length} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px" }}>
          {generating ? <span className="spinner" style={{width:"14px",height:"14px"}} /> : <span className="material-symbols-outlined" style={{fontSize:"18px"}}>picture_as_pdf</span>}
          {generating ? "Membuat PDF…" : "Cetak PDF"}
        </button>
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        {/* Filter Periode */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label className="input-label">Dari Tanggal</label>
            <input className="input-field" type="date" value={dari} onChange={(e) => setDari(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="input-label">Sampai Tanggal</label>
            <input className="input-field" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} />
          </div>
        </div>

        {/* Kartu Ringkasan */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
          <div className="card" style={{ textAlign:"center", padding:"1rem", background:"var(--color-primary-container)", color:"white", borderRadius:"12px" }}>
            <p className="text-label-md" style={{ opacity:0.8 }}>Total Penjualan</p>
            <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(keuntungan.total_penjualan)}</p>
          </div>
          <div className="card" style={{ textAlign:"center", padding:"1rem", background:"var(--color-primary-container)", color:"white", borderRadius:"12px" }}>
            <p className="text-label-md" style={{ opacity:0.8 }}>Total Keuntungan</p>
            <p className="text-headline-md" style={{ margin: "4px 0 0 0" }}>{loading ? "…" : rupiah(keuntungan.total_keuntungan)}</p>
          </div>
        </div>

        {/* Tabel Rincian Produk */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "var(--color-surface-container-high)", textAlign: "left" }}>
                <th style={{ padding: "10px", borderRadius: "8px 0 0 0" }}>Tanggal</th>
                <th style={{ padding: "10px" }}>Produk Terjual</th>
                <th style={{ padding: "10px" }}>Pembayaran</th>
                <th style={{ padding: "10px", textAlign: "right", borderRadius: "0 8px 0 0" }}>Total Harga</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ padding: "20px", textAlign: "center" }}>Memuat data...</td>
                </tr>
              ) : barisProduk.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "20px", textAlign: "center", color: "#999" }}>Tidak ada data penjualan untuk periode ini.</td>
                </tr>
              ) : (
                barisProduk.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--color-surface-container)" }}>
                    <td style={{ padding: "10px" }}>{tanggalLaporan(row.tanggal)}</td>
                    <td style={{ padding: "10px", fontWeight: 500 }}>{row.produk_nama} <span style={{color:"#666", fontSize:"11px"}}>({row.total_qty}x)</span></td>
                    <td style={{ padding: "10px" }}>{labelPembayaran(row.metode_bayar)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{rupiah(row.total_harga)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
