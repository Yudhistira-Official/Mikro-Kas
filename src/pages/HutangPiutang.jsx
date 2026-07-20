// ============================================================
// HutangPiutang.jsx — Kelola hutang (ke supplier) & piutang (dari customer)
// ============================================================
import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

export default function HutangPiutang() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("hutang");
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBayar, setShowBayar] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [form, setForm] = useState({
    tipe: "hutang", kontak_id: "", kontak_tipe: "supplier", jumlah: "", keterangan: ""
  });
  const [bayarJumlah, setBayarJumlah] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [hpData, custData, suppData] = await Promise.all([
        invoke("list_hutang_piutang"),
        invoke("list_customer"),
        invoke("list_supplier")
      ]);
      setList(hpData);
      setCustomers(custData);
      setSuppliers(suppData);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const jumlah = Number(form.jumlah);
    if (!jumlah || jumlah <= 0) return addToast("Jumlah harus diisi", "error");
    if (!form.kontak_id) return addToast("Kontak harus dipilih", "error");
    
    try {
      const input = {
        tipe: form.tipe,
        kontak_id: Number(form.kontak_id),
        kontak_tipe: form.kontak_tipe,
        jumlah,
        keterangan: form.keterangan.trim() || null,
        tanggal: null
      };
      await invoke("create_hutang_piutang", { input });
      addToast("Hutang/Piutang ditambahkan", "success");
      setShowForm(false);
      setForm({ tipe: tab, kontak_id: "", kontak_tipe: tab === "hutang" ? "supplier" : "customer", jumlah: "", keterangan: "" });
      load();
    } catch (err) { addToast(String(err), "error"); }
  };

  const bayar = async (e) => {
    e.preventDefault();
    const nominal = Number(bayarJumlah);
    if (!nominal || nominal <= 0) return addToast("Nominal harus diisi", "error");
    try {
      await invoke("bayar_hutang_piutang", { input: { id: selectedItem.id, jumlah_bayar: nominal } });
      addToast("Pembayaran berhasil dicatat", "success");
      setShowBayar(false);
      setBayarJumlah("");
      load();
    } catch (err) { addToast(String(err), "error"); }
  };

  const hapus = async (id) => {
    if (!window.confirm("Hapus catatan ini?")) return;
    try {
      await invoke("delete_hutang_piutang", { id });
      addToast("Terhapus", "success");
      load();
    } catch (err) { addToast(String(err), "error"); }
  };

  const filtered = list.filter(x => x.tipe === tab);
  const kontakList = form.kontak_tipe === "customer" ? customers : suppliers;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="text-headline-md">Hutang & Piutang</h2>
        <button className="btn-primary" onClick={() => {
          setForm({ tipe: tab, kontak_id: "", kontak_tipe: tab === "hutang" ? "supplier" : "customer", jumlah: "", keterangan: "" });
          setShowForm(true);
        }}>
          + Catatan
        </button>
      </div>

      {/* Tab filter */}
      <div className="filter-row">
        <button className={`filter-chip${tab === "hutang" ? " active" : ""}`} onClick={() => setTab("hutang")}>Hutang (Pemasok)</button>
        <button className={`filter-chip${tab === "piutang" ? " active" : ""}`} onClick={() => setTab("piutang")}>Piutang (Pelanggan)</button>
      </div>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">payments</span>
          <p>Belum ada catatan {tab === "hutang" ? "hutang" : "piutang"}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
          {filtered.map((item) => {
            const kontakName = item.kontak_tipe === "customer" 
              ? (customers.find(c => c.id === item.kontak_id)?.nama || `Pelanggan #${item.kontak_id}`)
              : (suppliers.find(s => s.id === item.kontak_id)?.nama || `Supplier #${item.kontak_id}`);
            
            const sisa = item.jumlah - item.jumlah_bayar;

            return (
              <div key={item.id} className="list-dense-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderBottom: "1px solid var(--color-surface-border)", background: item.status === "lunas" ? "rgba(16,185,129,0.02)" : undefined }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <p className="text-headline-sm">{kontakName}</p>
                    <span className={`chip ${item.status === 'lunas' ? 'chip-green' : 'chip-amber'}`}>{item.status === 'lunas' ? 'Lunas' : 'Belum Lunas'}</span>
                  </div>
                  <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
                    Tanggal: {item.tanggal.slice(0, 10)} {item.keterangan ? `· ${item.keterangan}` : ""}
                  </p>
                  <p className="text-body-md" style={{ marginTop: "4px" }}>
                    Total: {rupiah(item.jumlah)} · Terbayar: {rupiah(item.jumlah_bayar)}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "end", gap: "6px" }}>
                  <b style={{ color: item.status === 'lunas' ? "var(--color-income-green)" : "var(--color-expense-red)", fontSize: "14px" }}>
                    {item.status === 'lunas' ? "Lunas" : `Sisa: ${rupiah(sisa)}`}
                  </b>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {item.status !== "lunas" && (
                      <button className="btn-icon" onClick={() => { setSelectedItem(item); setBayarJumlah(""); setShowBayar(true); }} title="Bayar Cicilan"><span className="material-symbols-outlined">payments</span></button>
                    )}
                    <button className="btn-icon" onClick={() => hapus(item.id)} style={{ color: "var(--color-expense-red)" }}><span className="material-symbols-outlined">delete</span></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Bottom Sheet / Dialog */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>Tambah Catatan</h3>
            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className={`filter-chip${form.tipe === "hutang" ? " active" : ""}`} onClick={() => setForm(prev => ({ ...prev, tipe: "hutang", kontak_tipe: "supplier", kontak_id: "" }))} style={{ flex: 1 }}>Hutang</button>
                <button type="button" className={`filter-chip${form.tipe === "piutang" ? " active" : ""}`} onClick={() => setForm(prev => ({ ...prev, tipe: "piutang", kontak_tipe: "customer", kontak_id: "" }))} style={{ flex: 1 }}>Piutang</button>
              </div>

              <div>
                <label className="input-label">Pilih {form.kontak_tipe === "customer" ? "Pelanggan" : "Supplier"} *</label>
                <select className="input-field" value={form.kontak_id} onChange={e => setForm(prev => ({ ...prev, kontak_id: e.target.value }))}>
                  <option value="">— Pilih Kontak —</option>
                  {kontakList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>

              <div>
                <label className="input-label">Jumlah nominal *</label>
                <input className="input-field" inputMode="numeric" placeholder="Nominal Rp" value={form.jumlah} onChange={e => setForm(prev => ({ ...prev, jumlah: e.target.value.replace(/\D/g, "") }))} />
              </div>

              <div>
                <label className="input-label">Keterangan</label>
                <input className="input-field" placeholder="Keterangan tambahan" value={form.keterangan} onChange={e => setForm(prev => ({ ...prev, keterangan: e.target.value }))} />
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Batal</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog Bayar Cicilan */}
      {showBayar && selectedItem && (
        <div className="modal-overlay" onClick={() => setShowBayar(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>Bayar Cicilan</h3>
            <p className="text-body-md" style={{ marginBottom: "0.75rem" }}>
              Pembayaran untuk sisa nominal: <b>{rupiah(selectedItem.jumlah - selectedItem.jumlah_bayar)}</b>
            </p>
            <form onSubmit={bayar} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="input-label">Nominal Bayar *</label>
                <input className="input-field" inputMode="numeric" placeholder="Nominal Rp" value={bayarJumlah} onChange={e => setBayarJumlah(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowBayar(false)} style={{ flex: 1 }}>Batal</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Bayar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
