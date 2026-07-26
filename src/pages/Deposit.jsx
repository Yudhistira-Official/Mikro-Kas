import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (value) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

export default function Deposit() {
  const { addToast } = useToast();
  const [customers, setCustomers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showUseModal, setShowUseModal] = useState(false);
  const [topUpForm, setTopUpForm] = useState({ customerId: "", nominal: "", keterangan: "" });
  const [useForm, setUseForm] = useState({ customerId: "", nominal: "", keterangan: "" });

  const loadCustomers = async () => {
    try { setCustomers(await invoke("list_customer")); } catch (e) { addToast(String(e), "error"); }
  };

  const loadLogs = async (customerId) => {
    try { setLogs(await invoke("list_deposit_log", { customerId })); } catch (e) { addToast(String(e), "error"); }
  };

  const loadAllDeposits = async () => {
    try {
      const allCustomers = await invoke("list_customer");
      const depositsData = await Promise.all(allCustomers.map(async (cust) => {
        try {
          const dep = await invoke("get_or_create_deposit", { customerId: cust.id });
          return { ...dep, nama: cust.nama, telepon: cust.telepon };
        } catch { return null; }
      }));
      setDeposits(depositsData.filter(Boolean));
    } catch (e) { addToast(String(e), "error"); }
  };

  useEffect(() => { loadCustomers(); loadAllDeposits(); }, []);

  const filteredCustomers = useMemo(() => customers.filter((c) => `${c.nama} ${c.telepon}`.toLowerCase().includes(search.toLowerCase())), [customers, search]);
  const totalSaldo = useMemo(() => deposits.reduce((sum, d) => sum + d.saldo, 0), [deposits]);
  const activeDeposits = useMemo(() => deposits.filter((d) => d.saldo > 0).length, [deposits]);

  const handleTopUp = async (event) => {
    event.preventDefault();
    try {
      await invoke("top_up_deposit", { customerId: Number(topUpForm.customerId), nominal: Number(topUpForm.nominal), keterangan: topUpForm.keterangan.trim() || null });
      addToast("Top-up deposit berhasil", "success");
      setShowTopUpModal(false);
      setTopUpForm({ customerId: "", nominal: "", keterangan: "" });
      loadAllDeposits();
      if (selectedCustomer) loadLogs(selectedCustomer.id);
    } catch (e) { addToast(String(e), "error"); }
  };

  const handleUse = async (event) => {
    event.preventDefault();
    try {
      await invoke("gunakan_deposit", { customerId: Number(useForm.customerId), nominal: Number(useForm.nominal), keterangan: useForm.keterangan.trim() || null });
      addToast("Deposit berhasil digunakan", "success");
      setShowUseModal(false);
      setUseForm({ customerId: "", nominal: "", keterangan: "" });
      loadAllDeposits();
      if (selectedCustomer) loadLogs(selectedCustomer.id);
    } catch (e) { addToast(String(e), "error"); }
  };

  const openTopUp = (cust) => { setTopUpForm({ ...topUpForm, customerId: cust.id }); setShowTopUpModal(true); };
  const openUse = (cust) => { setUseForm({ ...useForm, customerId: cust.id }); setShowUseModal(true); };
  const viewLogs = (cust) => { setSelectedCustomer(cust); loadLogs(cust.id); };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div><p className="sales-page__eyebrow">KEUANGAN</p><h1 className="text-headline-lg">Deposit Pelanggan</h1><p className="text-body-md sales-page__subtitle">Kelola saldo prabayar pelanggan: top-up, pemakaian, dan histori transaksi.</p></div>
        <button className="btn-primary sales-page__add" onClick={() => setShowTopUpModal(true)}><span className="material-symbols-outlined">add</span>Top-Up</button>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-income-green)" }}>account_balance_wallet</span><div><span>Total saldo deposit</span><strong>{rupiah(totalSaldo)}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>person</span><div><span>Pelanggan aktif</span><strong>{activeDeposits}</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined" style={{ color: "var(--color-warning-amber)" }}>people</span><div><span>Total pelanggan</span><strong>{customers.length}</strong></div></div>
      </section>

      <section className="sales-panel">
        <div className="sales-panel__toolbar"><div className="sales-search"><span className="material-symbols-outlined">search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau telepon pelanggan..." /></div><button className="btn-secondary" onClick={() => { loadCustomers(); loadAllDeposits(); }}><span className="material-symbols-outlined">refresh</span>Refresh</button></div>
        {filteredCustomers.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">account_balance_wallet</span><h3>Belum ada pelanggan</h3><p>Tambahkan pelanggan terlebih dahulu di menu Master Data untuk mulai mengelola deposit.</p></div> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Nama</th><th>Telepon</th><th>Saldo</th><th>Aksi</th></tr></thead><tbody>{filteredCustomers.map((cust) => { const dep = deposits.find((d) => d.customer_id === cust.id); return <tr key={cust.id}><td><strong>{cust.nama}</strong></td><td>{cust.telepon || "-"}</td><td>{dep ? rupiah(dep.saldo) : rupiah(0)}</td><td><div style={{ display: "flex", gap: 6 }}><button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => openTopUp(cust)}>Top-Up</button><button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => openUse(cust)}>Gunakan</button><button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => viewLogs(cust)}>Log</button></div></td></tr>; })}</tbody></table></div>}
      </section>

      {selectedCustomer && <section className="sales-panel" style={{ padding: "1.25rem" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><div><p className="sales-page__eyebrow">RIWAYAT TRANSAKSI</p><h2 className="text-headline-sm">{selectedCustomer.nama}</h2></div><button className="icon-button" onClick={() => setSelectedCustomer(null)}><span className="material-symbols-outlined">close</span></button></div>{logs.length === 0 ? <p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>Belum ada transaksi deposit</p> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Tanggal</th><th>Tipe</th><th>Nominal</th><th>Saldo Sebelum</th><th>Saldo Sesudah</th><th>Keterangan</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{log.created_at}</td><td><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: log.tipe === "topup" ? "var(--color-income-green)" : "var(--color-warning-amber)", color: "white" }}>{log.tipe}</span></td><td>{rupiah(log.nominal)}</td><td>{rupiah(log.saldo_sebelum)}</td><td>{rupiah(log.saldo_sesudah)}</td><td>{log.keterangan || "-"}</td></tr>)}</tbody></table></div>}</section>}

      {showTopUpModal && <div className="modal-overlay" onClick={() => setShowTopUpModal(false)}><div className="modal-content sales-form-modal" onClick={(e) => e.stopPropagation()}><div className="sales-modal__header"><div><p className="sales-page__eyebrow">TOP-UP</p><h2 className="text-headline-sm">Tambah Saldo Deposit</h2></div><button className="icon-button" onClick={() => setShowTopUpModal(false)}><span className="material-symbols-outlined">close</span></button></div><form className="sales-form" onSubmit={handleTopUp}><label>Pelanggan<select className="input-field" required value={topUpForm.customerId} onChange={(e) => setTopUpForm({ ...topUpForm, customerId: e.target.value })}><option value="">Pilih pelanggan</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.nama} — {c.telepon || "tanpa telepon"}</option>)}</select></label><label>Nominal<input className="input-field" type="number" min="1" required value={topUpForm.nominal} onChange={(e) => setTopUpForm({ ...topUpForm, nominal: e.target.value })} /></label><label>Keterangan<input className="input-field" value={topUpForm.keterangan} onChange={(e) => setTopUpForm({ ...topUpForm, keterangan: e.target.value })} /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowTopUpModal(false)}>Batal</button><button className="btn-primary">Top-Up</button></div></form></div></div>}

      {showUseModal && <div className="modal-overlay" onClick={() => setShowUseModal(false)}><div className="modal-content sales-form-modal" onClick={(e) => e.stopPropagation()}><div className="sales-modal__header"><div><p className="sales-page__eyebrow">GUNAKAN</p><h2 className="text-headline-sm">Gunakan Deposit</h2></div><button className="icon-button" onClick={() => setShowUseModal(false)}><span className="material-symbols-outlined">close</span></button></div><form className="sales-form" onSubmit={handleUse}><label>Pelanggan<select className="input-field" required value={useForm.customerId} onChange={(e) => setUseForm({ ...useForm, customerId: e.target.value })}><option value="">Pilih pelanggan</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.nama} — {c.telepon || "tanpa telepon"}</option>)}</select></label><label>Nominal<input className="input-field" type="number" min="1" required value={useForm.nominal} onChange={(e) => setUseForm({ ...useForm, nominal: e.target.value })} /></label><label>Keterangan<input className="input-field" value={useForm.keterangan} onChange={(e) => setUseForm({ ...useForm, keterangan: e.target.value })} /></label><div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowUseModal(false)}>Batal</button><button className="btn-primary">Gunakan</button></div></form></div></div>}
    </div>
  );
}
