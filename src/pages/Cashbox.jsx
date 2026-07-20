// ============================================================
// Cashbox.jsx — Kelola Saldo Kas Lokal
// ============================================================
import { useState, useEffect } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

export default function Cashbox() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [mutasi, setMutasi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMutasi, setShowMutasi] = useState(false);
  const [showTambah, setShowTambah] = useState(false);
  
  const [mutasiForm, setMutasiForm] = useState({
    cashbox_id: "", tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: ""
  });
  const [boxNama, setBoxNama] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [cbData, mutData] = await Promise.all([
        invoke("list_cashbox"),
        invoke("list_cashbox_mutasi")
      ]);
      setList(cbData);
      setMutasi(mutData);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createBox = async (e) => {
    e.preventDefault();
    if (!boxNama.trim()) return addToast("Nama kas wajib diisi", "error");
    try {
      await invoke("create_cashbox", { nama: boxNama.trim() });
      addToast("Cashbox kas baru dibuat", "success");
      setBoxNama("");
      setShowTambah(false);
      load();
    } catch (err) { addToast(String(err), "error"); }
  };

  const handleMutasi = async (e) => {
    e.preventDefault();
    const jumlah = Number(mutasiForm.jumlah);
    if (!jumlah || jumlah <= 0) return addToast("Jumlah harus lebih dari 0", "error");
    if (!mutasiForm.cashbox_id) return addToast("Pilih kas utama", "error");
    if (mutasiForm.tipe === "pindah" && !mutasiForm.dari_cashbox_id) {
      return addToast("Kas asal wajib dipilih", "error");
    }

    try {
      const input = {
        cashbox_id: Number(mutasiForm.cashbox_id),
        tipe: mutasiForm.tipe,
        jumlah,
        dari_cashbox_id: mutasiForm.tipe === "pindah" ? Number(mutasiForm.dari_cashbox_id) : null,
        keterangan: mutasiForm.keterangan.trim() || null
      };
      await invoke("mutasi_cashbox", { input });
      addToast("Mutasi kas berhasil", "success");
      setShowMutasi(false);
      setMutasiForm({ cashbox_id: "", tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: "" });
      load();
    } catch (err) { addToast(String(err), "error"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="text-headline-md">Cashbox & Saldo Kas</h2>
        <div style={{ display: "flex", gap: "6px" }}>
          <button className="btn-secondary" onClick={() => setShowTambah(true)} style={{ padding: "8px 12px", fontSize: "13px" }}>+ Kas</button>
          <button className="btn-primary" onClick={() => {
            setMutasiForm({ cashbox_id: list[0]?.id || "", tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: "" });
            setShowMutasi(true);
          }} style={{ padding: "8px 12px", fontSize: "13px" }}>Mutasi</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : (
        <>
          {/* Kas List */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {list.map((box) => (
              <div key={box.id} className="card" style={{ display: "flex", flexDirection: "column", padding: "1rem" }}>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{box.nama}</p>
                <p className="text-headline-md" style={{ color: "var(--color-primary)", marginTop: "6px" }}>{rupiah(box.saldo)}</p>
              </div>
            ))}
          </div>

          {/* Histori Mutasi */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem" }}>
            <p className="text-headline-sm">Riwayat Mutasi Uang</p>
            {mutasi.length === 0 ? (
              <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Belum ada mutasi</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "300px", overflowY: "auto" }}>
                {mutasi.map((m) => {
                  const targetBox = list.find(x => x.id === m.cashbox_id)?.nama || `Kas #${m.cashbox_id}`;
                  const sourceBox = m.dari_cashbox_id ? (list.find(x => x.id === m.dari_cashbox_id)?.nama || `Kas #${m.dari_cashbox_id}`) : null;
                  
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-surface-border)", paddingBottom: "6px" }}>
                      <div>
                        <p className="text-body-md" style={{ fontWeight: 600 }}>
                          {m.tipe.toUpperCase()} · {targetBox} {sourceBox ? `(dari ${sourceBox})` : ""}
                        </p>
                        <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                          {m.tanggal.slice(11, 16)} {m.keterangan ? `· ${m.keterangan}` : ""}
                        </p>
                      </div>
                      <b style={{ color: m.tipe === 'tambah' ? 'var(--color-income-green)' : m.tipe === 'kurang' ? 'var(--color-expense-red)' : 'var(--color-primary)' }}>
                        {m.tipe === 'kurang' ? '-' : '+'}{rupiah(m.jumlah)}
                      </b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Tambah Box */}
      {showTambah && (
        <div className="modal-overlay" onClick={() => setShowTambah(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>Buat Kas Baru</h3>
            <form onSubmit={createBox} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="input-label">Nama Kas *</label>
                <input className="input-field" value={boxNama} onChange={e => setBoxNama(e.target.value)} placeholder="Contoh: Brankas Toko, Kas Kecil" />
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowTambah(false)} style={{ flex: 1 }}>Batal</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Buat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Mutasi */}
      {showMutasi && (
        <div className="modal-overlay" onClick={() => setShowMutasi(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-md" style={{ marginBottom: "1rem" }}>Mutasi Saldo Kas</h3>
            <form onSubmit={handleMutasi} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {["tambah", "kurang", "pindah"].map(t => (
                  <button key={t} type="button" className={`filter-chip${mutasiForm.tipe === t ? " active" : ""}`} onClick={() => setMutasiForm(prev => ({ ...prev, tipe: t }))} style={{ flex: 1, textTransform: "capitalize" }}>{t}</button>
                ))}
              </div>

              {mutasiForm.tipe === "pindah" && (
                <div>
                  <label className="input-label">Pindahkan Dari Kas *</label>
                  <select className="input-field" value={mutasiForm.dari_cashbox_id} onChange={e => setMutasiForm(prev => ({ ...prev, dari_cashbox_id: e.target.value }))}>
                    <option value="">— Pilih Kas Asal —</option>
                    {list.map(b => <option key={b.id} value={b.id}>{b.nama} ({rupiah(b.saldo)})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="input-label">Target Kas *</label>
                <select className="input-field" value={mutasiForm.cashbox_id} onChange={e => setMutasiForm(prev => ({ ...prev, cashbox_id: e.target.value }))}>
                  <option value="">— Pilih Kas Target —</option>
                  {list.filter(b => b.id !== Number(mutasiForm.dari_cashbox_id)).map(b => <option key={b.id} value={b.id}>{b.nama}</option>)}
                </select>
              </div>

              <div>
                <label className="input-label">Jumlah Nominal *</label>
                <input className="input-field" inputMode="numeric" placeholder="Nominal Rp" value={mutasiForm.jumlah} onChange={e => setMutasiForm(prev => ({ ...prev, jumlah: e.target.value.replace(/\D/g, "") }))} />
              </div>

              <div>
                <label className="input-label">Keterangan</label>
                <input className="input-field" placeholder="Keterangan opsional" value={mutasiForm.keterangan} onChange={e => setMutasiForm(prev => ({ ...prev, keterangan: e.target.value }))} />
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowMutasi(false)} style={{ flex: 1 }}>Batal</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Kirim</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
