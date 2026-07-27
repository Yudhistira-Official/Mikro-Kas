// Shift.jsx — Manajemen Shift: buka/tutup kasir harian, catat saldo awal/akhir, selisih kas.
// Design ref: Stitch — Shift Management.
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, rupiah } from "../components/PageKit";
import SearchSelect from "../components/SearchSelect";

const DENOMINATIONS = [
  { denom: 100000, is_koin: false }, { denom: 50000, is_koin: false }, { denom: 20000, is_koin: false },
  { denom: 10000, is_koin: false }, { denom: 5000, is_koin: false }, { denom: 2000, is_koin: false },
  { denom: 1000, is_koin: false }, { denom: 500, is_koin: true }, { denom: 200, is_koin: true },
  { denom: 100, is_koin: true }, { denom: 50, is_koin: true }, { denom: 25, is_koin: true },
  { denom: 10, is_koin: true }, { denom: 1, is_koin: true },
];

const MAX_QUANTITY = Number.MAX_SAFE_INTEGER;
const parseOpeningQuantity = (value) => value === "" ? { value: 0, error: "" } : /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= MAX_QUANTITY ? { value: Number(value), error: "" } : { value: 0, error: "Jumlah harus bilangan bulat non-negatif yang aman." };
const totalOpening = (rows) => rows.reduce((sum, row) => {
  const quantity = parseOpeningQuantity(String(row.qty_awal));
  const subtotal = quantity.value * row.denom;
  return quantity.error || !Number.isSafeInteger(subtotal) || !Number.isSafeInteger(sum + subtotal) ? NaN : sum + subtotal;
}, 0);
const displayRupiah = (value) => Number.isSafeInteger(Number(value)) ? rupiah(value) : "—";
const initialOpeningRows = () => DENOMINATIONS.map((row) => ({ ...row, qty_awal: "" }));

export default function Shift() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [cashboxes, setCashboxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeShift, setActiveShift] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nama: "", cashbox_id: "", rows: initialOpeningRows() });
  const [currentUser, setCurrentUser] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([invoke("list_shift", {}), invoke("list_cashbox").catch(() => [])])
      .then(([data, boxes]) => {
        setList(data);
        setCashboxes(boxes || []);
        if (!form.cashbox_id && boxes?.length === 1) setForm((current) => ({ ...current, cashbox_id: String(boxes[0].id) }));
        const open = data.find((s) => s.status === "open");
        setActiveShift(open || null);
      })
      .catch((e) => addToast(`Gagal memuat shift: ${e}`, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    invoke("get_current_user")
      .then(setCurrentUser)
      .catch((e) => addToast(`Gagal memuat sesi: ${e}`, "error"));
    load();
  }, []);

  const bukaShift = async () => {
    if (!currentUser) return addToast("Login diperlukan untuk membuka shift", "error");
    if (cashboxes.length === 0) return addToast("Buat cashbox terlebih dahulu", "error");
    const nama = form.nama.trim() || `Shift ${new Date().toLocaleDateString("id-ID")}`;
    const parsedRows = form.rows.map((row) => ({ ...row, parsed: parseOpeningQuantity(String(row.qty_awal)) }));
    const quantityError = parsedRows.find((row) => row.parsed.error)?.parsed.error;
    if (quantityError) return addToast(quantityError, "error");
    const rows = parsedRows.map(({ parsed, ...row }) => ({ ...row, qty_awal: parsed.value, qty_akhir: 0 }));
    const saldo_awal = totalOpening(rows);
    if (!Number.isSafeInteger(saldo_awal)) return addToast("Total saldo awal terlalu besar.", "error");
    try {
      await invoke("buka_shift", { input: { nama, saldo_awal, cashbox_id: Number(form.cashbox_id), rows } });
      addToast("Shift berhasil dibuka", "success");
      setShowForm(false);
      setForm({ nama: "", cashbox_id: cashboxes.length === 1 ? String(cashboxes[0].id) : "", rows: initialOpeningRows() });
      load();
    } catch (e) {
      addToast(`Gagal buka shift: ${e}`, "error");
    }
  };

  const updateOpeningQty = (index, value) => {
    if (value !== "" && !/^\d+$/.test(value)) return;
    setForm((current) => ({ ...current, rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, qty_awal: value } : row) }));
  };

  const selisihColor = (s) => s === 0 ? "var(--color-income-green)" : s > 0 ? "var(--color-warning-amber)" : "var(--color-expense-red)";
  const closedShifts = list.filter((s) => s.status !== "open");
  const totalPenjualan = list.reduce((sum, s) => sum + Number(s.total_penjualan || 0), 0);

  return (
    <PageShell
      eyebrow="OPERASIONAL KASIR"
      title="Manajemen Shift"
       description="Buka dan tutup shift kasir dengan pencatatan saldo yang rapi."
       actions={
         <>
           <span style={{ marginRight: "8px", fontSize: "13px", color: "var(--color-text-secondary)" }}>Kasir: {currentUser?.nama_lengkap || currentUser?.username || "—"}</span>
           {!activeShift && <button className="btn-primary sales-page__add" onClick={() => setShowForm(true)}><span className="material-symbols-outlined">add</span>Buka Shift</button>}
          </>

       }
      stats={[
        { label: "Riwayat Selesai", value: closedShifts.length, icon: "history" },
        { label: "Total Penjualan", value: rupiah(totalPenjualan), icon: "payments" },
      ]}
    >
      {activeShift && (
        <section className="sales-panel" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--color-primary)" }}>
          <div style={{ padding: "1rem 1.25rem", background: "var(--color-primary)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><p style={{ fontSize: "11px", opacity: 0.8, letterSpacing: "0.08em", fontWeight: 700 }}>SHIFT AKTIF</p><h2 className="text-headline-sm">{activeShift.nama}</h2></div>
            <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: "20px", padding: "4px 10px", fontSize: "11px", fontWeight: 700 }}>OPEN</span>
          </div>
          <div style={{ padding: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              <div><span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Saldo Awal</span><p style={{ fontSize: "18px", fontWeight: 700, marginTop: "3px" }}>{rupiah(activeShift.saldo_awal)}</p></div>
              <div><span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Dibuka</span><p style={{ fontSize: "14px", fontWeight: 600, marginTop: "5px" }}>{activeShift.opened_at}</p></div>
              <div><span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Penjualan</span><p style={{ fontSize: "18px", fontWeight: 700, marginTop: "3px" }}>{rupiah(activeShift.total_penjualan)}</p></div>
            </div>
            <button className="btn-primary" onClick={() => navigate(`/cashbox?shift=${activeShift.id}`)} style={{ width: "100%" }}><span className="material-symbols-outlined" style={{ fontSize: "17px", verticalAlign: "middle", marginRight: "5px" }}>lock</span>Hitung & Tutup Shift</button>
          </div>
        </section>
      )}

      {!activeShift && !showForm && <div className="empty-state"><span className="material-symbols-outlined">schedule</span><h3>Belum ada shift aktif</h3><p>Buka shift untuk mulai mencatat aktivitas kasir.</p><button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: "12px" }}>Buka Shift</button></div>}

      {showForm && (
        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}><span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>lock_open</span><div><p className="sales-page__eyebrow">FORM SHIFT</p><h2 className="text-headline-sm">Buka Shift Baru</h2></div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
             <div><label className="input-label">Nama Shift</label><input className="input-field" placeholder="Shift Pagi / Shift Malam" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
             <div><label className="input-label">Register / Cashbox</label><SearchSelect value={form.cashbox_id} onChange={(value) => setForm({ ...form, cashbox_id: value })} options={cashboxes.map((box) => ({ value: String(box.id), label: box.nama }))} placeholder="Pilih register" required /></div>
             <div><label className="input-label">Denominasi Kas Awal</label><div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Pecahan</th><th>Jumlah</th><th>Subtotal</th></tr></thead><tbody>{form.rows.map((row, index) => <tr key={`${row.denom}-${row.is_koin}`}><td>{rupiah(row.denom)} {row.is_koin ? "(koin)" : ""}</td><td><input className="input-field" type="number" min="0" step="1" inputMode="numeric" value={row.qty_awal} onChange={(event) => updateOpeningQty(index, event.target.value)} aria-label={`Jumlah awal ${row.denom}`} /></td><td>{displayRupiah(row.denom * parseOpeningQuantity(String(row.qty_awal)).value)}</td></tr>)}<tr><th>Total</th><th>—</th><th>{rupiah(totalOpening(form.rows))}</th></tr></tbody></table></div></div>
             <div style={{ display: "flex", gap: "8px" }}><button className="btn-primary" onClick={bukaShift} style={{ flex: 1 }} disabled={!form.cashbox_id}>Buka Shift</button><button className="btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Batal</button></div>
          </div>
        </section>
      )}

      <section className="sales-panel">
        <div className="sales-panel__toolbar"><div><p className="sales-page__eyebrow">HISTORI</p><h2 className="text-headline-sm">Riwayat Shift</h2></div><button className="btn-secondary" onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", padding: "7px 12px" }}><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>Refresh</button></div>
        {loading ? <div className="loading-page" style={{ minHeight: "140px" }}><div className="spinner" /><span>Memuat riwayat…</span></div> : list.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">history</span><p>Belum ada riwayat shift</p></div> : <div style={{ overflowX: "auto" }}><table className="sales-table"><thead><tr><th>Nama Shift</th><th>Status</th><th>Saldo Awal</th><th>Saldo Akhir</th><th>Penjualan</th><th>Selisih</th><th>Ditutup</th></tr></thead><tbody>{list.map((s) => <tr key={s.id}><td><strong>{s.nama}</strong></td><td><span className={`badge ${s.status === "open" ? "badge-success" : ""}`}>{s.status === "open" ? "OPEN" : "CLOSED"}</span></td><td>{rupiah(s.saldo_awal)}</td><td>{s.saldo_akhir != null ? rupiah(s.saldo_akhir) : "—"}</td><td>{rupiah(s.total_penjualan)}</td><td style={{ color: selisihColor(Number(s.selisih || 0)), fontWeight: 700 }}>{s.selisih != null ? rupiah(s.selisih) : "—"}</td><td style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{s.closed_at || "—"}</td></tr>)}</tbody></table></div>}
      </section>
    </PageShell>
  );
}
