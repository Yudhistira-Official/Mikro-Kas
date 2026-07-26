import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (value) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

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
    <div className="sales-page">
      <header className="sales-page__header">
        <div><p className="sales-page__eyebrow">KEUANGAN</p><h1 className="text-headline-lg">Akuntansi</h1><p className="text-body-md sales-page__subtitle">Kelola akun, jurnal double-entry, dan pemeriksaan saldo bisnis.</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn-secondary" onClick={() => setShowJurnalForm(true)}><span className="material-symbols-outlined">post_add</span>Jurnal Manual</button><button className="btn-primary sales-page__add" onClick={() => setShowCoaForm(true)}><span className="material-symbols-outlined">add</span>Tambah COA</button></div>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined">account_tree</span><div><span>Total akun aktif</span><strong>{coa.length}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-income-green)" }}>account_balance</span><div><span>Akun aktiva</span><strong>{totalByType.aktiva || 0}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)" }}>receipt_long</span><div><span>Akun biaya</span><strong>{totalByType.biaya || 0}</strong></div></div>
      </section>

      <section className="sales-panel">
        <div className="sales-panel__toolbar"><div className="sales-search"><span className="material-symbols-outlined">search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode, nama, atau tipe akun..." /></div><button className="btn-secondary" onClick={loadCoa}><span className="material-symbols-outlined">refresh</span>Refresh</button></div>
        {filteredCoa.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">account_tree</span><h3>Belum ada akun COA</h3><p>Tambahkan akun pertama untuk mulai mencatat jurnal dan membaca neraca saldo.</p><button className="btn-primary" onClick={() => setShowCoaForm(true)}>Tambah COA</button></div> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th>Saldo Normal</th><th>ID</th></tr></thead><tbody>{filteredCoa.map((item) => <tr key={item.id}><td><strong>{item.kode_akun}</strong></td><td>{item.nama_akun}</td><td>{item.tipe}</td><td>{item.saldo_normal}</td><td>{item.id}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="sales-panel" style={{ padding: "1.25rem" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}><div><p className="sales-page__eyebrow">LAPORAN & VALIDASI</p><h2 className="text-headline-sm">Tools akuntansi</h2><p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>Neraca saldo merangkum akun. Pemeriksaan jurnal mendeteksi transaksi yang tidak seimbang.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn-secondary" onClick={() => handleReport("get_neraca_saldo")}>Neraca Saldo</button><button className="btn-secondary" onClick={() => handleReport("cek_jurnal_tidak_seimbang")}>Cek Jurnal</button></div></div>{result && <pre style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "var(--color-surface-container-low)", overflow: "auto", maxHeight: 280 }}>{JSON.stringify(result.data, null, 2)}</pre>}</section>

      {showCoaForm && <div className="modal-overlay" onClick={() => setShowCoaForm(false)}><div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><p className="sales-page__eyebrow">MASTER AKUN</p><h2 className="text-headline-sm">Tambah COA</h2></div><button className="icon-button" onClick={() => setShowCoaForm(false)}><span className="material-symbols-outlined">close</span></button></div><form className="sales-form" onSubmit={handleCreateCoa}><label>Kode akun<input className="input-field" required value={coaForm.kodeAkun} onChange={(event) => setCoaForm({ ...coaForm, kodeAkun: event.target.value })} /></label><label>Nama akun<input className="input-field" required value={coaForm.namaAkun} onChange={(event) => setCoaForm({ ...coaForm, namaAkun: event.target.value })} /></label><label>Tipe<select className="input-field" value={coaForm.tipe} onChange={(event) => setCoaForm({ ...coaForm, tipe: event.target.value })}>{["aktiva", "kewajiban", "modal", "pendapatan", "hpp", "biaya"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Saldo normal<select className="input-field" value={coaForm.saldoNormal} onChange={(event) => setCoaForm({ ...coaForm, saldoNormal: event.target.value })}><option value="">Otomatis dari tipe</option><option value="debit">Debit</option><option value="kredit">Kredit</option></select></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowCoaForm(false)}>Batal</button><button className="btn-primary">Simpan COA</button></div></form></div></div>}
      {showJurnalForm && <div className="modal-overlay" onClick={() => setShowJurnalForm(false)}><div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}><div className="sales-modal__header"><div><p className="sales-page__eyebrow">DOUBLE-ENTRY</p><h2 className="text-headline-sm">Jurnal Manual</h2></div><button className="icon-button" onClick={() => setShowJurnalForm(false)}><span className="material-symbols-outlined">close</span></button></div><form className="sales-form" onSubmit={handleCreateJurnal}><label>Tanggal<input className="input-field" type="date" required value={jurnalForm.tanggal} onChange={(event) => setJurnalForm({ ...jurnalForm, tanggal: event.target.value })} /></label><label>Nomor jurnal<input className="input-field" required value={jurnalForm.nomorJurnal} onChange={(event) => setJurnalForm({ ...jurnalForm, nomorJurnal: event.target.value })} placeholder="JU-2026-001" /></label><label>Akun debit<select className="input-field" required value={jurnalForm.debitAkunId} onChange={(event) => setJurnalForm({ ...jurnalForm, debitAkunId: event.target.value })}><option value="">Pilih akun</option>{coa.map((item) => <option key={item.id} value={item.id}>{item.kode_akun} — {item.nama_akun}</option>)}</select></label><label>Akun kredit<select className="input-field" required value={jurnalForm.kreditAkunId} onChange={(event) => setJurnalForm({ ...jurnalForm, kreditAkunId: event.target.value })}><option value="">Pilih akun</option>{coa.map((item) => <option key={item.id} value={item.id}>{item.kode_akun} — {item.nama_akun}</option>)}</select></label><label>Nominal<input className="input-field" type="number" min="1" required value={jurnalForm.nominal} onChange={(event) => setJurnalForm({ ...jurnalForm, nominal: event.target.value })} /></label><label>Keterangan<input className="input-field" value={jurnalForm.keterangan} onChange={(event) => setJurnalForm({ ...jurnalForm, keterangan: event.target.value })} /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowJurnalForm(false)}>Batal</button><button className="btn-primary">Simpan Jurnal</button></div></form></div></div>}
    </div>
  );
}
