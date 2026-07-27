import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { InfoNote, PageShell, rupiah, StatusBadge } from "../components/PageKit";
import SearchSelect from "../components/SearchSelect";

const MAX_QUANTITY = Number.MAX_SAFE_INTEGER;

const safeTotal = (rows, quantityKey) => rows.reduce((sum, row) => {
  const quantity = Number(row[quantityKey] || 0);
  const subtotal = quantity * Number(row.denom);
  return Number.isSafeInteger(quantity) && Number.isSafeInteger(subtotal) && Number.isSafeInteger(sum + subtotal) ? sum + subtotal : NaN;
}, 0);
export const totalAwal = (rows) => safeTotal(rows, "qtyAwal");
export const totalAkhir = (rows) => safeTotal(rows, "qtyAkhir");
export const variance = (actual, pos) => Number.isSafeInteger(Number(actual)) && Number.isSafeInteger(Number(pos)) && Number.isSafeInteger(Number(actual) - Number(pos)) ? Number(actual) - Number(pos) : NaN;
const displayRupiah = (value) => Number.isSafeInteger(Number(value)) ? rupiah(value) : "—";

const parseQuantity = (value) => {
  const text = String(value ?? "");
  if (text === "") return { value: 0, error: "" };
  if (!/^\d+$/.test(text)) return { value: 0, error: "Jumlah harus bilangan bulat non-negatif." };
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > MAX_QUANTITY) return { value: 0, error: "Jumlah terlalu besar." };
  return { value: number, error: "" };
};

const formatShiftDate = (value) => value ? new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z")).toLocaleDateString("id-ID") : "—";
const formatShiftTime = (value) => value ? new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z")).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function Cashbox() {
  const { addToast } = useToast();
  const [shifts, setShifts] = useState([]);
  const [cashboxes, setCashboxes] = useState([]);
  const [mutasiAll, setMutasiAll] = useState([]);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get("shift") || "");
  const [selectedBox, setSelectedBox] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [boxNama, setBoxNama] = useState("");
  const [mutasiForm, setMutasiForm] = useState({ tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: "" });
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(null);
  const [closingQty, setClosingQty] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shiftLoadError, setShiftLoadError] = useState("");

  const activeShift = shifts.find((shift) => shift.status === "open") || null;
  const selectedShift = shifts.find((shift) => String(shift.id) === String(selectedId)) || activeShift;
  const legacyFallback = Boolean(sheet) && sheet.has_pecahan === false;
  const editable = selectedShift?.status === "open";

  const load = async (requestedId = selectedId) => {
    setLoading(true);
    try {
      const [shiftResult, boxResult, mutasiResult] = await Promise.allSettled([
        invoke("list_shift", {}),
        invoke("list_cashbox"),
        invoke("list_cashbox_mutasi", { cashbox_id: null }),
      ]);
      const nextShifts = shiftResult.status === "fulfilled" ? (shiftResult.value || []) : [];
      setShiftLoadError(shiftResult.status === "rejected" ? "Tidak berwenang memuat riwayat shift." : "");
      setShifts(nextShifts);
      setCashboxes(boxResult.status === "fulfilled" ? (boxResult.value || []) : []);
      setMutasiAll(mutasiResult.status === "fulfilled" ? (mutasiResult.value || []) : []);
      const nextId = requestedId && nextShifts.some((shift) => String(shift.id) === String(requestedId))
        ? requestedId
        : String((nextShifts.find((shift) => shift.status === "open") || nextShifts[0])?.id || "");
      setSelectedId(nextId);
      if (nextId) {
        const nextSheet = await invoke("get_shift_cash_count", { shiftId: Number(nextId) });
        setSheet(nextSheet);
        setClosingQty(Object.fromEntries((nextSheet.rows || []).map((row) => [row.denom + (row.is_koin ? "-coin" : "-bill"), String(row.qty_akhir ?? 0)])));
      } else {
        setSheet(null);
        setClosingQty({});
      }
    } catch (error) {
      addToast(`Gagal memuat lembar kas: ${error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedShift || selectedShift.status !== "open") return undefined;
    let cancelled = false;
    const refreshSummary = async () => {
      try {
        const nextSheet = await invoke("get_shift_cash_count", { shiftId: Number(selectedShift.id) });
        if (!cancelled) setSheet((current) => ({ ...nextSheet, rows: current?.rows || nextSheet.rows }));
      } catch (error) {
        if (!cancelled) console.error("Failed to refresh shift summary:", error);
      }
    };
    const intervalId = window.setInterval(refreshSummary, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedShift?.id, selectedShift?.status]);

  const createBox = async (event) => {
    event.preventDefault();
    if (!boxNama.trim()) return addToast("Nama kas wajib diisi", "error");
    try { await invoke("create_cashbox", { nama: boxNama.trim() }); setBoxNama(""); setShowCreate(false); await load(); addToast("Cashbox baru dibuat", "success"); } catch (error) { addToast(String(error), "error"); }
  };

  const handleMutasi = async (event) => {
    event.preventDefault();
    const jumlah = Number(mutasiForm.jumlah);
    if (!Number.isSafeInteger(jumlah) || jumlah <= 0) return addToast("Jumlah harus bilangan bulat lebih dari 0", "error");
    if (!selectedBox) return addToast("Pilih cashbox terlebih dahulu", "error");
    if (mutasiForm.tipe === "pindah" && !mutasiForm.dari_cashbox_id) return addToast("Cashbox asal wajib diisi", "error");
    try {
      await invoke("mutasi_cashbox", { input: { cashbox_id: selectedBox.id, tipe: mutasiForm.tipe, jumlah, dari_cashbox_id: mutasiForm.tipe === "pindah" ? Number(mutasiForm.dari_cashbox_id) : null, keterangan: mutasiForm.keterangan.trim() || null } });
      setMutasiForm({ tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: "" });
      await load();
      setSelectedBox((current) => (cashboxes.find((box) => box.id === current?.id) || current));
      addToast("Mutasi kas berhasil", "success");
    } catch (error) { addToast(String(error), "error"); }
  };

  const filteredCashboxes = cashboxes.filter((box) => box.nama.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedMutasi = mutasiAll.filter((item) => item.cashbox_id === selectedBox?.id);
  const handleSelect = async (value) => {
    setSelectedId(value);
    await load(value);
  };

  const rows = useMemo(() => (sheet?.rows || []).map((row) => {
    const key = row.denom + (row.is_koin ? "-coin" : "-bill");
    const parsed = parseQuantity(closingQty[key]);
    return { ...row, key, qtyAwal: Number(row.qty_awal || 0), qtyAkhir: parsed.value, rawAkhir: closingQty[key] ?? "", error: parsed.error };
  }), [sheet, closingQty]);

  const totals = useMemo(() => {
    const calculatedAwal = totalAwal(rows);
    const calculatedAkhir = totalAkhir(rows);
    const awal = legacyFallback ? Number(sheet?.total_awal || 0) : calculatedAwal;
    const akhir = legacyFallback ? Number(sheet?.total_akhir || 0) : calculatedAkhir;
    const sales = Number(sheet?.total_penjualan || 0);
    const expenses = Number(sheet?.total_pengeluaran || 0);
    const actualIncome = Number.isSafeInteger(akhir) && Number.isSafeInteger(awal) && Number.isSafeInteger(expenses) && Number.isSafeInteger(akhir - awal + expenses) ? akhir - awal + expenses : NaN;
    return { awal, akhir, sales, expenses, actualIncome, variance: variance(actualIncome, sales) };
  }, [rows, selectedShift, sheet, legacyFallback]);

  const quantityError = rows.find((row) => row.error)?.error || "";
  const totalError = !Number.isSafeInteger(totals.akhir) || !Number.isSafeInteger(totals.actualIncome) || !Number.isSafeInteger(totals.variance) ? "Total hitungan kas terlalu besar." : "";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!editable || !selectedShift || quantityError || totalError) return addToast(quantityError || totalError, "error");
    setSaving(true);
    try {
      await invoke("tutup_shift", {
        id: selectedShift.id,
        saldo_akhir: totals.akhir,
        rows: legacyFallback ? null : rows.map(({ denom, is_koin, qtyAwal, qtyAkhir }) => ({ denom, is_koin, qty_awal: qtyAwal, qty_akhir: qtyAkhir })),
        catatan: null,
      });
      addToast("Shift berhasil ditutup", "success");
      await load(String(selectedShift.id));
    } catch (error) {
      addToast(`Gagal menyimpan hitungan kas: ${error}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const boxName = cashboxes.find((box) => String(box.id) === String(selectedShift?.cashbox_id))?.nama;
  const shiftOptions = shifts.map((shift) => ({
    value: String(shift.id),
    label: `${shift.nama} · ${shift.status === "open" ? "Aktif" : "Ditutup"} · ${formatShiftDate(shift.opened_at)}`,
  }));

  return (
    <PageShell
      eyebrow="KAS & KEUANGAN"
      title="Cash Box Count Sheet"
      description="Hitung kas fisik, rekonsiliasi penjualan POS, dan tutup shift aktif."
      actions={<><button className="btn-secondary" type="button" onClick={() => load()} disabled={loading}><span className="material-symbols-outlined">refresh</span>Refresh</button><button className="btn-primary" type="button" onClick={() => setShowCreate((value) => !value)}>Buat Cashbox</button></>}
      stats={[
        { label: "Saldo Awal", value: displayRupiah(totals.awal), icon: "input" },
        { label: "Kas Fisik Akhir", value: displayRupiah(totals.akhir), icon: "payments" },
        { label: "Selisih", value: rupiah(totals.variance), icon: "compare_arrows", tone: totals.variance === 0 ? "var(--color-income-green)" : "var(--color-expense-red)" },
      ]}
    >
      {showCreate && <section className="sales-panel" style={{ padding: "1.25rem" }}><form onSubmit={createBox} style={{ display: "flex", gap: 8 }}><input className="input-field" placeholder="Nama cashbox" value={boxNama} onChange={(event) => setBoxNama(event.target.value)} /><button className="btn-primary" type="submit">Simpan</button></form></section>}
      <section className="sales-panel" style={{ padding: "1.25rem" }}><div className="sales-panel__toolbar"><input className="input-field" placeholder="Cari cashbox" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Cashbox</th><th>Saldo</th><th>Aksi</th></tr></thead><tbody>{filteredCashboxes.map((box) => <tr key={box.id}><td>{box.nama}</td><td>{rupiah(box.saldo)}</td><td><button className="btn-secondary" type="button" onClick={() => setSelectedBox(box)}>Mutasi</button></td></tr>)}</tbody></table></div></section>
      {selectedBox && <div className="modal-overlay" onClick={() => setSelectedBox(null)}><div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}><h2 className="text-headline-sm">{selectedBox.nama}</h2><form className="sales-form" onSubmit={handleMutasi}><select className="input-field" value={mutasiForm.tipe} onChange={(event) => setMutasiForm({ ...mutasiForm, tipe: event.target.value })}><option value="tambah">Tambah</option><option value="kurang">Kurang</option><option value="pindah">Pindah</option></select>{mutasiForm.tipe === "pindah" && <select className="input-field" value={mutasiForm.dari_cashbox_id} onChange={(event) => setMutasiForm({ ...mutasiForm, dari_cashbox_id: event.target.value })}><option value="">Pilih asal</option>{cashboxes.filter((box) => box.id !== selectedBox.id).map((box) => <option key={box.id} value={box.id}>{box.nama}</option>)}</select>}<input className="input-field" inputMode="numeric" value={mutasiForm.jumlah} onChange={(event) => setMutasiForm({ ...mutasiForm, jumlah: event.target.value })} placeholder="Jumlah" /><input className="input-field" value={mutasiForm.keterangan} onChange={(event) => setMutasiForm({ ...mutasiForm, keterangan: event.target.value })} placeholder="Keterangan" /><button className="btn-primary" type="submit">Kirim Mutasi</button><div>{selectedMutasi.map((item) => <p key={item.id}>{item.tipe}: {rupiah(item.jumlah)}</p>)}</div></form></div></div>}
      {shiftLoadError && <InfoNote icon="lock">{shiftLoadError} Fungsi cashbox dan mutasi tetap tersedia.</InfoNote>}
      <section className="sales-panel" style={{ padding: "1.25rem" }}>
        <label className="input-label" htmlFor="cashbox-shift">Pilih shift</label>
        <SearchSelect id="cashbox-shift" value={selectedId} onChange={handleSelect} options={shiftOptions} placeholder="Pilih riwayat shift" disabled={loading} />
      </section>

      {loading ? <div className="loading-page"><div className="spinner" /><span>Memuat lembar kas…</span></div> : !selectedShift ? (
        <div className="empty-state"><span className="material-symbols-outlined">point_of_sale</span><h3>Belum ada shift</h3><p>Buka shift dari halaman Shift untuk mulai menghitung kas.</p></div>
      ) : (
        <>
          <section className="sales-panel" style={{ padding: "1.25rem" }}>
            <div className="sales-panel__toolbar"><div><p className="sales-page__eyebrow">INFORMASI SHIFT</p><h2 className="text-headline-sm">{selectedShift.nama}</h2></div><StatusBadge label={editable ? "SHIFT AKTIF" : "SHIFT DITUTUP"} tone={editable ? "success" : "neutral"} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              <div><span className="text-label-md">Tanggal</span><strong style={{ display: "block", marginTop: 4 }}>{formatShiftDate(selectedShift.opened_at)}</strong></div>
              <div><span className="text-label-md">Kasir</span><strong style={{ display: "block", marginTop: 4 }}>{selectedShift.kasir_nama || "—"}</strong></div>
              <div><span className="text-label-md">Register / Box</span><strong style={{ display: "block", marginTop: 4 }}>{boxName || selectedShift.cashbox_id || "—"}</strong></div>
              <div><span className="text-label-md">Periode</span><strong style={{ display: "block", marginTop: 4 }}>{formatShiftTime(selectedShift.opened_at)} — {selectedShift.closed_at ? formatShiftTime(selectedShift.closed_at) : "sekarang"}</strong></div>
            </div>
          </section>

          <form onSubmit={handleSubmit}>
          <section className="sales-panel" style={{ padding: 0, overflow: "hidden" }}>
            <div className="sales-panel__toolbar" style={{ padding: "1.25rem" }}><div><p className="sales-page__eyebrow">HITUNG FISIK</p><h2 className="text-headline-sm">Denominasi Kas</h2></div></div>
            <div className="sales-table-wrap">
              <table className="sales-table"><thead><tr><th>Pecahan</th><th>Awal</th><th>Subtotal Awal</th><th>Akhir</th><th>Subtotal Akhir</th></tr></thead><tbody>
                {rows.map((row) => <tr key={row.key}><td>{rupiah(row.denom)} {row.is_koin ? "(koin)" : ""}</td><td>{row.qtyAwal}</td><td>{rupiah(row.denom * row.qtyAwal)}</td><td>{editable ? <input className="input-field" type="number" min="0" step="1" style={{ maxWidth: 110, borderColor: row.error ? "var(--color-expense-red)" : undefined }} inputMode="numeric" value={row.rawAkhir} onChange={(event) => setClosingQty((current) => ({ ...current, [row.key]: event.target.value }))} aria-invalid={Boolean(row.error)} aria-label={`Jumlah akhir ${row.denom}`} /> : row.qtyAkhir}</td><td>{rupiah(row.denom * row.qtyAkhir)}</td></tr>)}
                 <tr><th>Total</th><th>{legacyFallback ? "—" : rows.reduce((sum, row) => sum + row.qtyAwal, 0)}</th><th>{displayRupiah(totals.awal)}</th><th>{legacyFallback ? "—" : rows.reduce((sum, row) => sum + row.qtyAkhir, 0)}</th><th>{displayRupiah(totals.akhir)}</th></tr>
              </tbody></table>
            </div>
            {quantityError && <p role="alert" style={{ color: "var(--color-expense-red)", padding: "0 1.25rem 1.25rem", margin: 0 }}>{quantityError}</p>}
          </section>

          <section className="sales-panel" style={{ padding: "1.25rem" }}>
            <p className="sales-page__eyebrow">REKONSILIASI</p><h2 className="text-headline-sm" style={{ marginBottom: 16 }}>Ringkasan Kas</h2>
             <div style={{ display: "grid", gap: 10 }}>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span>Fisik final</span><strong>{displayRupiah(totals.akhir)}</strong></div>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span>Kas awal</span><strong>{displayRupiah(totals.awal)}</strong></div>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span>Pendapatan aktual</span><strong>{rupiah(totals.actualIncome)}</strong></div>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span>Penjualan POS tunai</span><strong>{rupiah(totals.sales)}</strong></div>
               <div style={{ display: "flex", justifyContent: "space-between", color: totals.variance === 0 ? "var(--color-income-green)" : "var(--color-expense-red)" }}><span>Varians</span><strong>{displayRupiah(totals.variance)}</strong></div>
             </div>
             {legacyFallback && <InfoNote icon="lock">Shift legacy tanpa snapshot denominasi. Total fallback ditampilkan readonly.</InfoNote>}
             {editable && <button className="btn-primary" type="submit" disabled={saving || Boolean(quantityError)} style={{ width: "100%", marginTop: 20 }}>{saving ? "Menyimpan…" : "Simpan & Tutup Shift"}</button>}
           </section>
          </form>

        </>
      )}
      {!editable && selectedShift && <InfoNote icon="lock">Shift ditutup. Semua hitungan hanya dapat dilihat.</InfoNote>}
      {!activeShift && shifts.length > 0 && <InfoNote icon="info">Tidak ada shift aktif. Buka shift baru dari halaman Shift untuk mengedit hitungan kas.</InfoNote>}
    </PageShell>
  );
}
