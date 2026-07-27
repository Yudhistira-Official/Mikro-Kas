import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import RupiahInput from "../components/RupiahInput";
import DateField from "../components/DateField";
import SearchSelect from "../components/SearchSelect";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";

export default function SalesKomisi() {
  const { addToast } = useToast();
  const [sales, setSales] = useState([]);
  const [komisi, setKomisi] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nama: "", kode: "", telepon: "", email: "" });
  const [selectedSales, setSelectedSales] = useState(null);
  const [payment, setPayment] = useState({});
  // Tab aktif: master sales atau laporan transaksi per sales.
  const [activeTab, setActiveTab] = useState("data");
  // Filter laporan daftar penjualan; tanggal default hari ini.
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportSalesId, setReportSalesId] = useState("");
  const [reportShiftId, setReportShiftId] = useState("");
  const [shifts, setShifts] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [reportSummary, setReportSummary] = useState({ total_tunai: 0, total_non_tunai: 0, total_omzet: 0 });
  const [reportLoading, setReportLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [salesData, komisiData] = await Promise.all([
        invoke("list_sales"),
        invoke("list_komisi_terutang", { sales_id: null, status: null }),
      ]);
      setSales(salesData || []);
      setKomisi(komisiData || []);
    } catch (error) {
      addToast(String(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Escape closes the active modal (commission detail or sales form).
  useEffect(() => {
    /** Handles Escape for SalesKomisi modals. */
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (showForm) setShowForm(false);
      else if (selectedSales) setSelectedSales(null);
    };
    if (showForm || selectedSales) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showForm, selectedSales]);

  // Memuat daftar shift untuk filter dan laporan penjualan tab Daftar Penjualan.
  // Sales dipakai bersama dari state `load()` di atas, jadi tidak perlu reload.
  const loadReport = async () => {
    setReportLoading(true);
    try {
      const [shiftData, rows, summary] = await Promise.all([
        invoke("list_shift"),
        invoke("list_penjualan_sales", {
          tanggal: reportDate,
          salesId: reportSalesId ? Number(reportSalesId) : null,
          shiftId: reportShiftId ? Number(reportShiftId) : null,
        }),
        invoke("summary_penjualan_sales", {
          tanggal: reportDate,
          salesId: reportSalesId ? Number(reportSalesId) : null,
          shiftId: reportShiftId ? Number(reportShiftId) : null,
        }),
      ]);
      setShifts(shiftData || []);
      setReportRows(rows || []);
      setReportSummary(summary || { total_tunai: 0, total_non_tunai: 0, total_omzet: 0 });
    } catch (error) {
      addToast(String(error), "error");
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "report") loadReport();
  }, [activeTab, reportDate, reportSalesId, reportShiftId]);

  const filteredSales = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sales.filter((item) => `${item.nama} ${item.kode || ""} ${item.telepon || ""} ${item.email || ""}`.toLowerCase().includes(term));
  }, [sales, query]);

  const openForm = (item = null) => {
    setEditing(item);
    setForm(item ? { nama: item.nama, kode: item.kode || "", telepon: item.telepon || "", email: item.email || "" } : { nama: "", kode: "", telepon: "", email: "" });
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.nama.trim()) return addToast("Nama sales wajib diisi", "error");
    const input = { nama: form.nama.trim(), kode: form.kode.trim() || null, telepon: form.telepon.trim() || null, email: form.email.trim() || null };
    try {
      if (editing) {
        const oldData = { ...editing };
        await invoke("update_sales", { id: editing.id, input });
        setShowForm(false);
        addToast("Data sales diperbarui", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("update_sales", {
              id: oldData.id,
              input: {
                nama: oldData.nama,
                kode: oldData.kode,
                telepon: oldData.telepon,
                email: oldData.email,
              },
            });
            load();
          },
        });
      } else {
        const createdId = await invoke("create_sales", { input });
        setShowForm(false);
        addToast("Sales ditambahkan", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("delete_sales", { id: createdId });
            load();
          },
        });
      }
      await load();
    } catch (error) { addToast(String(error), "error"); } 
  };

  const remove = async (id) => {
    if (!window.confirm("Nonaktifkan sales ini?")) return;
    const snapshot = sales.find((item) => item.id === id);
    if (!snapshot) return;
    try {
      await invoke("delete_sales", { id });
      addToast("Sales dinonaktifkan", "success", {
        label: "Urungkan",
        action: async () => {
          await invoke("create_sales", {
            input: {
              nama: snapshot.nama,
              kode: snapshot.kode,
              telepon: snapshot.telepon,
              email: snapshot.email,
            },
          });
          load();
        },
      });
      load();
    } catch (error) { addToast(String(error), "error"); }
  };

  const payCommission = async (item) => {
    const amount = Number(payment[item.id] || item.sisa || 0);
    if (amount <= 0 || amount > item.sisa) return addToast("Nominal pembayaran komisi tidak valid", "error");
    try {
      await invoke("bayar_komisi", { komisi_id: item.id, jumlah_bayar: amount });
      setPayment((prev) => ({ ...prev, [item.id]: "" }));
      addToast("Pembayaran komisi dicatat", "success");
      load();
    } catch (error) { addToast(String(error), "error"); }
  };

  const selectedCommissions = selectedSales ? komisi.filter((item) => item.sales_id === selectedSales.id) : [];
  const totalPending = komisi.reduce((sum, item) => sum + Number(item.sisa || 0), 0);
  const totalPaid = komisi.reduce((sum, item) => sum + Number(item.sudah_dibayar || 0), 0);

  return (
    <PageShell
      eyebrow="MASTER DATA"
      title="Daftar Sales"
      description="Kelola tenaga penjualan, kontak, dan pembayaran komisi secara terpusat."
      actions={
        <button className="btn-primary sales-page__add" onClick={() => openForm()}><span className="material-symbols-outlined">person_add</span>Tambah Sales</button>
      }
      stats={[
        { label: "Sales Aktif", value: sales.length, icon: "groups" },
        { label: "Komisi Terutang", value: rupiah(totalPending), icon: "pending_actions" },
        { label: "Komisi Terbayar", value: rupiah(totalPaid), icon: "payments" },
      ]}
    >
      {/* Tab memisahkan master data sales dari laporan transaksi kasir agar navigasi tetap ringkas. */}
      <div className="sales-tabs" role="tablist" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button type="button" className={activeTab === "data" ? "btn-primary" : "btn-secondary"} onClick={() => setActiveTab("data")} role="tab" aria-selected={activeTab === "data"}>Data Sales</button>
        <button type="button" className={activeTab === "report" ? "btn-primary" : "btn-secondary"} onClick={() => setActiveTab("report")} role="tab" aria-selected={activeTab === "report"}>Daftar Penjualan</button>
      </div>

      {activeTab === "data" && <section className="sales-panel">
        <div className="sales-panel__toolbar"><div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, kode, telepon, atau email..." /></div><button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button></div>
        {loading ? <div className="loading-page"><div className="spinner" /></div> : filteredSales.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">groups</span><p>Belum ada data sales</p></div> : (
          <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Sales</th><th>Kode</th><th>Kontak</th><th>Komisi Terutang</th><th>Aksi</th></tr></thead><tbody>{filteredSales.map((item) => { const due = komisi.filter((row) => row.sales_id === item.id).reduce((sum, row) => sum + Number(row.sisa || 0), 0); return <tr key={item.id}><td><button className="sales-name" onClick={() => setSelectedSales(item)}><span className="sales-avatar">{item.nama.charAt(0).toUpperCase()}</span><span><strong>{item.nama}</strong><small>{item.email || "Tanpa email"}</small></span></button></td><td>{item.kode || "-"}</td><td>{item.telepon || "-"}</td><td className={due ? "sales-amount sales-amount--warning" : "sales-amount"}>{rupiah(due)}</td><td><div className="sales-row-actions"><button className="btn-icon" onClick={() => openForm(item)} title="Edit"><span className="material-symbols-outlined">edit</span></button><button className="btn-icon" onClick={() => remove(item.id)} title="Nonaktifkan"><span className="material-symbols-outlined">delete</span></button></div></td></tr>; })}</tbody></table></div>
        )}
      </section>}

      {/* Tab Daftar Penjualan: laporan transaksi per sales dengan filter tanggal, sales, dan shift. */}
      {activeTab === "report" && <section className="sales-panel">
        {/* Filter bar: tanggal, sales, shift, dan tombol refresh */}
        <div className="sales-panel__toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 160 }}><DateField value={reportDate} onChange={setReportDate} /></div>
            {/* Filter sales opsional; tanpa filter = semua sales */}
            <SearchSelect
              style={{ width: 160 }}
              value={reportSalesId}
              onChange={setReportSalesId}
              placeholder="Semua Sales"
              options={sales.filter((s) => s.is_active).map((s) => ({ value: String(s.id), label: s.nama }))}
            />
            {/* Filter shift opsional; tanpa filter = semua shift */}
            <SearchSelect
              style={{ width: 160 }}
              value={reportShiftId}
              onChange={setReportShiftId}
              placeholder="Semua Shift"
              options={shifts.filter((s) => s.status === "open" || s.status === "closed").map((s) => ({ value: String(s.id), label: `#${s.id} ${s.nama}` }))}
            />
          </div>
          <button className="btn-secondary" onClick={loadReport}><span className="material-symbols-outlined">refresh</span>Refresh</button>
        </div>

        {/* Tabel hasil penjualan per item, mengikuti format laporan kasir sales. */}
        {reportLoading ? <div className="loading-page"><div className="spinner" /></div> : reportRows.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">receipt_long</span><p>Belum ada penjualan untuk filter ini</p></div> : (
          <>
            <div className="sales-table-wrap" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <table className="sales-table" style={{ fontSize: "0.85rem" }}>
                <thead><tr><th>No</th><th>No. Nota</th><th>Pelanggan</th><th>Nama Barang</th><th>Qty</th><th>Harga Satuan</th><th>Total Harga</th><th>Sales</th></tr></thead>
                <tbody>
                  {reportRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td><strong>#{row.no_nota}</strong></td>
                      <td>{row.pelanggan || "-"}</td>
                      <td>{row.produk_nama}</td>
                      <td style={{ textAlign: "right" }}>{row.qty}</td>
                      <td style={{ textAlign: "right" }}>{rupiah(row.harga_satuan)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{rupiah(row.total_harga)}</td>
                      <td>{row.sales_nama || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Footer ringkasan: total tunai, non-tunai, omzet. */}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "0.75rem", padding: "0.75rem", background: "var(--color-surface-container-high)", borderRadius: "8px" }}>
              <div><span className="text-label-md">Total Tunai</span><p className="text-headline-sm" style={{ color: "var(--color-income-green)" }}>{rupiah(reportSummary.total_tunai)}</p></div>
              <div><span className="text-label-md">Total Non-Tunai</span><p className="text-headline-sm">{rupiah(reportSummary.total_non_tunai)}</p></div>
              <div><span className="text-label-md">Total Omzet Harian</span><p className="text-headline-sm" style={{ color: "var(--color-primary)" }}>{rupiah(reportSummary.total_omzet)}</p></div>
            </div>
          </>
        )}
      </section>}

      {selectedSales && <div className="modal-overlay" onClick={() => setSelectedSales(null)}><div className="modal-content sales-commission-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">Komisi {selectedSales.nama}</h2><p className="text-body-md">Rincian komisi terutang per periode.</p></div><button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setSelectedSales(null)}><span className="material-symbols-outlined">close</span></button></div>{selectedCommissions.length === 0 ? <div className="empty-state"><p>Belum ada komisi tercatat</p></div> : <div className="commission-list">{selectedCommissions.map((item) => <div className="commission-row" key={item.id}><div><strong>{item.periode}</strong><small>Total {rupiah(item.total_komisi)} · Sisa {rupiah(item.sisa)}</small></div><div className="commission-pay"><RupiahInput placeholder={String(item.sisa)} value={payment[item.id] || ""} onChange={(val) => setPayment((prev) => ({ ...prev, [item.id]: val }))} /><button className="btn-primary" onClick={() => payCommission(item)} disabled={item.sisa <= 0}>Bayar</button></div></div>)}</div>}</div></div>}

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><h2 className="text-headline-md">{editing ? "Edit Sales" : "Tambah Sales"}</h2><p className="text-body-md">Simpan identitas sales untuk transaksi dan komisi.</p></div><button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setShowForm(false)}><span className="material-symbols-outlined">close</span></button></div><form onSubmit={save} className="sales-form"><label>Nama Sales *<input className="input-field" value={form.nama} onChange={(event) => setForm((prev) => ({ ...prev, nama: event.target.value }))} /></label><label>Kode Sales<input className="input-field" value={form.kode} onChange={(event) => setForm((prev) => ({ ...prev, kode: event.target.value }))} /></label><label>No. Telepon<input className="input-field" inputMode="tel" value={form.telepon} onChange={(event) => setForm((prev) => ({ ...prev, telepon: event.target.value }))} /></label><label>Email<input className="input-field" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button><button className="btn-primary">Simpan</button></div></form></div></div>}
    </PageShell>
  );
}
