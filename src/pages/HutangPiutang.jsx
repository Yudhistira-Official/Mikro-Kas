// ============================================================
// HutangPiutang.jsx — Kelola hutang (ke supplier) & piutang (dari customer) dengan reminder jatuh tempo.
//
// Fitur utama:
//   - Tab filter: Hutang vs Piutang.
//   - Kartu Ringkasan: Total Belum Lunas & Lewat Tempo.
//   - Audit Trail/Status jatuh tempo: Lewat Tempo (merah), Jatuh Tempo Hari Ini (oranye), Mendatang (cyan).
//   - Simpan catatan baru dengan opsional jatuh_tempo.
//   - Cicilan nominal pembayaran + Hapus catatan.
//
// Design ref: Stitch — "Hutang & Piutang Reminder" (violet-cyan-amber).
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
  const [statusFilter, setStatusFilter] = useState("all"); // all | belum_lunas | lunas

  const [form, setForm] = useState({
    tipe: "hutang",
    kontak_id: "",
    kontak_tipe: "supplier",
    jumlah: "",
    keterangan: "",
    jatuh_tempo: ""
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

  useEffect(() => {
    load();
  }, []);

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
        tanggal: null,
        jatuh_tempo: form.jatuh_tempo || null
      };
      await invoke("create_hutang_piutang", { input });
      addToast("Catatan ditambahkan", "success");
      setShowForm(false);
      setForm({
        tipe: tab,
        kontak_id: "",
        kontak_tipe: tab === "hutang" ? "supplier" : "customer",
        jumlah: "",
        keterangan: "",
        jatuh_tempo: ""
      });
      load();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const bayar = async (e) => {
    e.preventDefault();
    const nominal = Number(bayarJumlah);
    if (!nominal || nominal <= 0) return addToast("Nominal harus diisi", "error");
    try {
      await invoke("bayar_hutang_piutang", { input: { id: selectedItem.id, jumlah_bayar: nominal } });
      addToast("Pembayaran cicilan berhasil dicatat", "success");
      setShowBayar(false);
      setBayarJumlah("");
      load();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const hapus = async (id) => {
    if (!window.confirm("Hapus catatan ini?")) return;
    try {
      await invoke("delete_hutang_piutang", { id });
      addToast("Terhapus", "success");
      load();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const filtered = list
    .filter((x) => x.tipe === tab)
    .filter((x) => statusFilter === "all" || (statusFilter === "belum_lunas" ? x.status !== "lunas" : x.status === "lunas"));
  const kontakList = form.kontak_tipe === "customer" ? customers : suppliers;

  // Hitung agregat keuangan real-time
  const totalBelumLunas = filtered
    .filter((x) => x.status !== "lunas")
    .reduce((sum, x) => sum + (x.jumlah - x.jumlah_bayar), 0);

  const getDaysDiff = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr);
    due.setHours(0, 0, 0, 0);
    const diffTime = due - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const totalLewatTempoCount = filtered
    .filter((x) => x.status !== "lunas" && x.jatuh_tempo)
    .filter((x) => {
      const diff = getDaysDiff(x.jatuh_tempo);
      return diff !== null && diff < 0;
    }).length;

  const getDueBadge = (jatuhTempo, status) => {
    if (status === "lunas" || !jatuhTempo) return null;
    const diff = getDaysDiff(jatuhTempo);

    if (diff < 0) {
      return (
        <span
          className="badge"
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            color: "var(--color-expense-red)",
            fontWeight: 700,
            fontSize: "11px",
            padding: "4px 8px",
            borderRadius: "6px"
          }}
        >
          Lewat Tempo ({Math.abs(diff)} hari)
        </span>
      );
    } else if (diff === 0) {
      return (
        <span
          className="badge"
          style={{
            background: "rgba(245, 158, 11, 0.15)",
            color: "var(--color-warning-amber)",
            fontWeight: 700,
            fontSize: "11px",
            padding: "4px 8px",
            borderRadius: "6px"
          }}
        >
          Jatuh Tempo Hari Ini
        </span>
      );
    } else {
      return (
        <span
          className="badge"
          style={{
            background: "rgba(6, 182, 212, 0.15)",
            color: "var(--color-on-primary-container)",
            fontWeight: 700,
            fontSize: "11px",
            padding: "4px 8px",
            borderRadius: "6px"
          }}
        >
          {diff} Hari Lagi
        </span>
      );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="text-headline-md">Hutang & Piutang</h2>
        <button
          className="btn-primary"
          onClick={() => {
            setForm({
              tipe: tab,
              kontak_id: "",
              kontak_tipe: tab === "hutang" ? "supplier" : "customer",
              jumlah: "",
              keterangan: "",
              jatuh_tempo: ""
            });
            setShowForm(true);
          }}
        >
          + Catatan
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div className="card" style={{ padding: "0.75rem", borderRadius: "12px", background: "var(--color-surface-container-high)", border: "1px solid var(--color-surface-border)" }}>
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)", fontSize: "11px" }}>Total Belum Lunas</p>
          <p className="text-headline-sm" style={{ margin: "4px 0 0", color: tab === "hutang" ? "var(--color-expense-red)" : "var(--color-income-green)" }}>
            {rupiah(totalBelumLunas)}
          </p>
        </div>
        <div className="card" style={{ padding: "0.75rem", borderRadius: "12px", background: "var(--color-surface-container-high)", border: "1px solid var(--color-surface-border)" }}>
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)", fontSize: "11px" }}>Lewat Tempo</p>
          <p className="text-headline-sm" style={{ margin: "4px 0 0", color: totalLewatTempoCount > 0 ? "var(--color-expense-red)" : "var(--color-text-primary)" }}>
            {totalLewatTempoCount} Catatan
          </p>
        </div>
      </div>

      {/* Tab filter */}
      <div className="filter-row" style={{ display: "flex", gap: "0.5rem", background: "var(--color-surface-container-high)", padding: "4px", borderRadius: "12px" }}>
        <button
          className={`filter-chip${tab === "hutang" ? " active" : ""}`}
          onClick={() => setTab("hutang")}
          style={{ flex: 1, textAlign: "center", border: 0, padding: "8px", borderRadius: "8px", cursor: "pointer", background: tab === "hutang" ? "var(--color-primary-container)" : "transparent", color: tab === "hutang" ? "white" : "var(--color-text-secondary)", fontWeight: 600 }}
        >
          Hutang (Pemasok)
        </button>
        <button
          className={`filter-chip${tab === "piutang" ? " active" : ""}`}
          onClick={() => setTab("piutang")}
          style={{ flex: 1, textAlign: "center", border: 0, padding: "8px", borderRadius: "8px", cursor: "pointer", background: tab === "piutang" ? "var(--color-primary-container)" : "transparent", color: tab === "piutang" ? "white" : "var(--color-text-secondary)", fontWeight: 600 }}
        >
          Piutang (Pelanggan)
        </button>
      </div>

      {/* Sub-filter status: Semua / Belum Lunas / Lunas */}
      <div className="filter-row" style={{ display: "flex", gap: "0.5rem" }}>
        {[
          { value: "all", label: "Semua" },
          { value: "belum_lunas", label: "Belum Lunas" },
          { value: "lunas", label: "Lunas" },
        ].map((f) => (
          <button
            key={f.value}
            className={`filter-chip${statusFilter === f.value ? " active" : ""}`}
            onClick={() => setStatusFilter(f.value)}
            style={{ flex: 1, textAlign: "center", padding: "6px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--color-text-tertiary)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "48px" }}>payments</span>
          <p style={{ marginTop: "0.5rem" }}>Belum ada catatan {tab === "hutang" ? "hutang" : "piutang"}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", borderRadius: "12px", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
          {filtered.map((item) => {
            const kontakName = item.kontak_tipe === "customer"
              ? (customers.find((c) => c.id === item.kontak_id)?.nama || `Pelanggan #${item.kontak_id}`)
              : (suppliers.find((s) => s.id === item.kontak_id)?.nama || `Supplier #${item.kontak_id}`);

            const sisa = item.jumlah - item.jumlah_bayar;

            return (
              <div
                key={item.id}
                className="list-dense-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem",
                  borderBottom: "1px solid var(--color-surface-border)",
                  background: item.status === "lunas" ? "rgba(16,185,129,0.02)" : undefined
                }}
              >
                <div style={{ flex: 1, minWidth: 0, marginRight: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <p className="text-body-md" style={{ fontWeight: 700, margin: 0 }}>{kontakName}</p>
                    <span className={`chip ${item.status === 'lunas' ? 'chip-green' : 'chip-amber'}`} style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px" }}>
                      {item.status === 'lunas' ? 'Lunas' : 'Belum Lunas'}
                    </span>
                    {getDueBadge(item.jatuh_tempo, item.status)}
                  </div>
                  <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "4px", fontSize: "12px" }}>
                    Tgl: {item.tanggal.slice(0, 10)} {item.jatuh_tempo ? `· Jatuh Tempo: ${item.jatuh_tempo}` : ""} {item.keterangan ? `· ${item.keterangan}` : ""}
                  </p>
                  <p className="text-body-md" style={{ marginTop: "4px", fontSize: "13px" }}>
                    Total: {rupiah(item.jumlah)} · Terbayar: {rupiah(item.jumlah_bayar)}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "end", gap: "8px" }}>
                  <b style={{ color: item.status === 'lunas' ? "var(--color-income-green)" : "var(--color-expense-red)", fontSize: "14px" }}>
                    {item.status === 'lunas' ? "Lunas" : `Sisa: ${rupiah(sisa)}`}
                  </b>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {item.status !== "lunas" && (
                      <button
                        className="btn-icon"
                        onClick={() => { setSelectedItem(item); setBayarJumlah(""); setShowBayar(true); }}
                        title="Bayar Cicilan"
                        style={{ padding: "6px" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>payments</span>
                      </button>
                    )}
                    <button
                      className="btn-icon"
                      onClick={() => hapus(item.id)}
                      style={{ color: "var(--color-expense-red)", padding: "6px" }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span>
                    </button>
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
                <button type="button" className={`filter-chip${form.tipe === "hutang" ? " active" : ""}`} onClick={() => setForm(prev => ({ ...prev, tipe: "hutang", kontak_tipe: "supplier", kontak_id: "" }))} style={{ flex: 1, padding: "8px", borderRadius: "8px", fontWeight: 600 }}>Hutang</button>
                <button type="button" className={`filter-chip${form.tipe === "piutang" ? " active" : ""}`} onClick={() => setForm(prev => ({ ...prev, tipe: "piutang", kontak_tipe: "customer", kontak_id: "" }))} style={{ flex: 1, padding: "8px", borderRadius: "8px", fontWeight: 600 }}>Piutang</button>
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
                <label className="input-label">Tanggal Jatuh Tempo (Reminder)</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.jatuh_tempo}
                  onChange={e => setForm(prev => ({ ...prev, jatuh_tempo: e.target.value }))}
                />
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
                <div style={{ display: "flex", gap: "6px" }}>
                  <input className="input-field" style={{ flex: 1 }} inputMode="numeric" placeholder="Nominal Rp" value={bayarJumlah} onChange={e => setBayarJumlah(e.target.value.replace(/\D/g, ""))} />
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ whiteSpace: "nowrap", padding: "8px 12px", fontSize: "12px" }}
                    onClick={() => setBayarJumlah(String(selectedItem.jumlah - selectedItem.jumlah_bayar))}
                  >
                    Bayar Lunas
                  </button>
                </div>
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
