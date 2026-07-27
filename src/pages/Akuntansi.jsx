import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";
import DateField from "../components/DateField";
import RupiahInput from "../components/RupiahInput";
import SearchSelect from "../components/SearchSelect";

export default function Akuntansi() {
  const { addToast } = useToast();
  const [coa, setCoa] = useState([]);
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [showCoaForm, setShowCoaForm] = useState(false);
  const [showJurnalForm, setShowJurnalForm] = useState(false);
  const [coaForm, setCoaForm] = useState({ kodeAkun: "", namaAkun: "", tipe: "aktiva", indukId: "", saldoNormal: "" });
  const [jurnalForm, setJurnalForm] = useState({ tanggal: new Date().toISOString().slice(0, 10), nomorJurnal: "", keterangan: "", debitAkunId: "", kreditAkunId: "", nominal: "" });

  const loadCoa = async () => {
    try { setCoa(await invoke("list_coa")); } catch (e) { addToast(String(e), "error"); }
  };

  useEffect(() => { loadCoa(); }, []);

  // Escape menutup COA atau jurnal manual tanpa menyimpan atau mengganggu form.
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (showCoaForm) setShowCoaForm(false);
      else if (showJurnalForm) setShowJurnalForm(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showCoaForm, showJurnalForm]);

  const filteredCoa = useMemo(() => coa.filter((item) => `${item.kode_akun} ${item.nama_akun} ${item.tipe}`.toLowerCase().includes(search.toLowerCase())), [coa, search]);
  const totalByType = useMemo(() => coa.reduce((summary, item) => ({ ...summary, [item.tipe]: (summary[item.tipe] || 0) + 1 }), {}), [coa]);

  const handleCreateCoa = async (event) => {
    event.preventDefault();
    try {
      await invoke("create_coa", { input: { kodeAkun: coaForm.kodeAkun.trim(), namaAkun: coaForm.namaAkun.trim(), tipe: coaForm.tipe, indukId: coaForm.indukId ? Number(coaForm.indukId) : null, saldoNormal: coaForm.saldoNormal || null } });
      addToast("COA berhasil ditambahkan", "success");
      setShowCoaForm(false);
      setCoaForm({ kodeAkun: "", namaAkun: "", tipe: "aktiva", indukId: "", saldoNormal: "" });
      loadCoa();
    } catch (e) { addToast(String(e), "error"); }
  };

  const handleCreateJurnal = async (event) => {
    event.preventDefault();
    const nominal = Number(jurnalForm.nominal);
    if (!jurnalForm.debitAkunId || !jurnalForm.kreditAkunId || nominal <= 0) { addToast("Pilih akun debit, kredit, dan nominal yang valid", "error"); return; }
    try {
      await invoke("create_jurnal_manual", { tanggal: jurnalForm.tanggal, nomorJurnal: jurnalForm.nomorJurnal.trim(), keterangan: jurnalForm.keterangan.trim() || null, lines: [{ akunId: Number(jurnalForm.debitAkunId), debit: nominal, kredit: 0, keterangan: jurnalForm.keterangan.trim() || null }, { akunId: Number(jurnalForm.kreditAkunId), debit: 0, kredit: nominal, keterangan: jurnalForm.keterangan.trim() || null }], refTabel: null, refId: null });
      addToast("Jurnal manual berhasil disimpan", "success");
      setShowJurnalForm(false);
      setResult(null);
    } catch (e) { addToast(String(e), "error"); }
  };

  const handleReport = async (command) => {
    try { setResult({ command, data: await invoke(command) }); } catch (e) { addToast(String(e), "error"); }
  };

  return (
    <PageShell
      eyebrow="KEUANGAN"
      title="Akuntansi"
      description="Kelola akun, jurnal double-entry, dan pemeriksaan saldo bisnis."
      actions={
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn-secondary" onClick={() => setShowJurnalForm(true)}><span className="material-symbols-outlined">post_add</span>Jurnal Manual</button><button className="btn-primary sales-page__add" onClick={() => setShowCoaForm(true)}><span className="material-symbols-outlined">add</span>Tambah COA</button></div>
        </>
      }
      stats={[
        { label: "Total akun aktif", value: coa.length, icon: "account_tree" },
        { label: "Akun aktiva", value: totalByType.aktiva || 0, icon: "account_balance", tone: "var(--color-income-green)" },
        { label: "Akun biaya", value: totalByType.biaya || 0, icon: "receipt_long", tone: "var(--color-warning-amber)" },
      ]}
    >
      <section className="sales-panel">
        <div className="sales-panel__toolbar"><div className="sales-search"><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode, nama, atau tipe akun..." /></div><button className="btn-secondary" onClick={loadCoa}><span className="material-symbols-outlined">refresh</span>Refresh</button></div>
        {filteredCoa.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">account_tree</span><h3>Belum ada akun COA</h3><p>Tambahkan akun pertama untuk mulai mencatat jurnal dan membaca neraca saldo.</p><button className="btn-primary" onClick={() => setShowCoaForm(true)}>Tambah COA</button></div> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th>Saldo Normal</th><th>ID</th></tr></thead><tbody>{filteredCoa.map((item) => <tr key={item.id}><td><strong>{item.kode_akun}</strong></td><td>{item.nama_akun}</td><td>{item.tipe}</td><td>{item.saldo_normal}</td><td>{item.id}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="sales-panel" style={{ padding: "1.25rem" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}><div><p className="sales-page__eyebrow">LAPORAN & VALIDASI</p><h2 className="text-headline-sm">Tools akuntansi</h2><p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>Neraca saldo merangkum akun. Pemeriksaan jurnal mendeteksi transaksi yang tidak seimbang.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn-secondary" onClick={() => handleReport("get_neraca_saldo")}>Neraca Saldo</button><button className="btn-secondary" onClick={() => handleReport("cek_jurnal_tidak_seimbang")}>Cek Jurnal</button></div></div>{result && <pre style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "var(--color-surface-container-low)", overflow: "auto", maxHeight: 280 }}>{JSON.stringify(result.data, null, 2)}</pre>}</section>

      {showCoaForm && <div className="modal-overlay" onClick={() => setShowCoaForm(false)}><div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><p className="sales-page__eyebrow">MASTER AKUN</p><h2 className="text-headline-sm">Tambah COA</h2></div><button type="button" className="icon-button" aria-label="Tutup" onClick={() => setShowCoaForm(false)}><span className="material-symbols-outlined">close</span></button></div><form className="sales-form" onSubmit={handleCreateCoa}><label>Kode akun<input className="input-field" required value={coaForm.kodeAkun} onChange={(event) => setCoaForm({ ...coaForm, kodeAkun: event.target.value })} /></label><label>Nama akun<input className="input-field" required value={coaForm.namaAkun} onChange={(event) => setCoaForm({ ...coaForm, namaAkun: event.target.value })} /></label><label>Tipe<SearchSelect value={coaForm.tipe} onChange={(value) => setCoaForm({ ...coaForm, tipe: value })} options={["aktiva", "kewajiban", "modal", "pendapatan", "hpp", "biaya"].map((item) => ({ value: item, label: item }))} placeholder="Pilih tipe" /></label><label>Saldo normal<SearchSelect value={coaForm.saldoNormal} onChange={(value) => setCoaForm({ ...coaForm, saldoNormal: value })} options={[{ value: "", label: "Otomatis dari tipe" }, { value: "debit", label: "Debit" }, { value: "kredit", label: "Kredit" }]} placeholder="Otomatis dari tipe" /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowCoaForm(false)}>Batal</button><button className="btn-primary">Simpan COA</button></div></form></div></div>}
      {showJurnalForm && <div className="modal-overlay" onClick={() => setShowJurnalForm(false)}><div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><p className="sales-page__eyebrow">DOUBLE-ENTRY</p><h2 className="text-headline-sm">Jurnal Manual</h2></div><button type="button" className="icon-button" aria-label="Tutup" onClick={() => setShowJurnalForm(false)}><span className="material-symbols-outlined">close</span></button></div><form className="sales-form" onSubmit={handleCreateJurnal}><label>Tanggal<DateField required value={jurnalForm.tanggal} onChange={(v) => setJurnalForm({ ...jurnalForm, tanggal: v })} /></label><label>Nomor jurnal<input className="input-field" required value={jurnalForm.nomorJurnal} onChange={(event) => setJurnalForm({ ...jurnalForm, nomorJurnal: event.target.value })} placeholder="JU-2026-001" /></label><label>Akun debit<SearchSelect className="input-field" required value={jurnalForm.debitAkunId} onChange={(value) => setJurnalForm({ ...jurnalForm, debitAkunId: value })} placeholder="Pilih akun" options={coa.map((item) => ({ value: String(item.id), label: `${item.kode_akun} — ${item.nama_akun}` }))} /></label><label>Akun kredit<SearchSelect className="input-field" required value={jurnalForm.kreditAkunId} onChange={(value) => setJurnalForm({ ...jurnalForm, kreditAkunId: value })} placeholder="Pilih akun" options={coa.map((item) => ({ value: String(item.id), label: `${item.kode_akun} — ${item.nama_akun}` }))} /></label><label>Nominal<RupiahInput value={jurnalForm.nominal} onChange={(val) => setJurnalForm({ ...jurnalForm, nominal: val })} required /></label><label>Keterangan<input className="input-field" value={jurnalForm.keterangan} onChange={(event) => setJurnalForm({ ...jurnalForm, keterangan: event.target.value })} /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowJurnalForm(false)}>Batal</button><button className="btn-primary">Simpan Jurnal</button></div></form></div></div>}
    </PageShell>
  );
}
