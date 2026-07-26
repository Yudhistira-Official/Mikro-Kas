import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (value) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

export default function TukarTambah() {
  const { addToast } = useToast();
  const [data, setData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    transaksi_id: "",
    customer_id: "",
    deskripsi_barang_lama: "",
    kondisi: "",
    nilai_tukar: "",
    produk_baru_id: "",
    harga_produk_baru: "",
    catatan: "",
  });

  /**
   * Loads all tukar tambah records from backend.
   * Side effect: updates `data` state.
   */
  const load = async () => {
    setLoading(true);
    try {
      const rows = await invoke("list_tukar_tambah");
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /** Filtered rows based on search query against deskripsi dan kondisi. */
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data;
    return data.filter((item) =>
      `${item.deskripsi_barang_lama} ${item.kondisi || ""} ${item.transaksi_id}`.toLowerCase().includes(term)
    );
  }, [data, query]);

  /** Aggregated stats derived from loaded data. */
  const totalNilai = data.reduce((sum, item) => sum + Number(item.nilai_tukar || 0), 0);
  const totalSelisih = data.reduce((sum, item) => sum + Number(item.selisih_bayar || 0), 0);

  /**
   * Submits new tukar tambah record via create_tukar_tambah command.
   * @param {Event} event - Form submit event
   */
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.transaksi_id || !form.deskripsi_barang_lama.trim()) {
      return addToast("ID Transaksi dan deskripsi barang lama wajib diisi", "error");
    }
    try {
      await invoke("create_tukar_tambah", {
        input: {
          transaksi_id: Number(form.transaksi_id),
          customer_id: form.customer_id ? Number(form.customer_id) : null,
          deskripsi_barang_lama: form.deskripsi_barang_lama.trim(),
          kondisi: form.kondisi.trim() || null,
          nilai_tukar: Number(form.nilai_tukar) || 0,
          produk_baru_id: form.produk_baru_id ? Number(form.produk_baru_id) : null,
          harga_produk_baru: Number(form.harga_produk_baru) || 0,
          catatan: form.catatan.trim() || null,
        },
      });
      setShowForm(false);
      setForm({ transaksi_id: "", customer_id: "", deskripsi_barang_lama: "", kondisi: "", nilai_tukar: "", produk_baru_id: "", harga_produk_baru: "", catatan: "" });
      addToast("Tukar tambah dicatat", "success");
      load();
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  /** Badge color based on kondisi value. */
  const kondisiBadge = (kondisi) => {
    const map = { baik: "#22c55e", cukup: "#f59e0b", rusak: "#ef4444" };
    return map[String(kondisi).toLowerCase()] || "var(--color-text-secondary)";
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">TRANSAKSI</p>
          <h1 className="text-headline-lg">Tukar Tambah</h1>
          <p className="text-body-md sales-page__subtitle">Catat transaksi trade-in barang lama dengan potongan pembelian barang baru.</p>
        </div>
        <button className="btn-primary sales-page__add" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined">swap_horiz</span>Tambah Tukar Tambah
        </button>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">swap_horiz</span>
          <div><span>Total Transaksi</span><strong>{data.length}</strong></div>
        </div>
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">currency_exchange</span>
          <div><span>Total Nilai Tukar</span><strong>{rupiah(totalNilai)}</strong></div>
        </div>
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">receipt_long</span>
          <div><span>Total Selisih Bayar</span><strong>{rupiah(totalSelisih)}</strong></div>
        </div>
      </section>

      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search">
            <span className="material-symbols-outlined">search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari deskripsi barang atau ID transaksi..." />
          </div>
          <button className="btn-secondary" onClick={load}>
            <span className="material-symbols-outlined">refresh</span>Refresh
          </button>
        </div>
        {loading ? (
          <div className="loading-page"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><span className="material-symbols-outlined">swap_horiz</span><p>Belum ada data tukar tambah</p></div>
        ) : (
          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Barang Lama</th>
                  <th>Kondisi</th>
                  <th>ID Transaksi</th>
                  <th>Nilai Tukar</th>
                  <th>Harga Baru</th>
                  <th>Selisih Bayar</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="sales-name" style={{ cursor: "default" }}>
                        <span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>devices_other</span></span>
                        <span>
                          <strong>{item.deskripsi_barang_lama}</strong>
                          {item.catatan && <small>{item.catatan}</small>}
                        </span>
                      </div>
                    </td>
                    <td>
                      {item.kondisi ? (
                        <span style={{ color: kondisiBadge(item.kondisi), fontWeight: 600, fontSize: 12, textTransform: "capitalize" }}>
                          {item.kondisi}
                        </span>
                      ) : "-"}
                    </td>
                    <td>#{item.transaksi_id}</td>
                    <td style={{ fontWeight: 600 }}>{rupiah(item.nilai_tukar)}</td>
                    <td>{rupiah(item.harga_produk_baru)}</td>
                    <td style={{ fontWeight: 700, color: "var(--color-primary)" }}>{rupiah(item.selisih_bayar)}</td>
                    <td style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{item.created_at?.slice(0, 10) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sales-modal__header">
              <div>
                <h2 className="text-headline-md">Tambah Tukar Tambah</h2>
                <p className="text-body-md">Catat barang lama yang ditukarkan sebagai potongan pembelian.</p>
              </div>
              <button className="btn-icon" onClick={() => setShowForm(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="sales-form">
              <label className="input-label">
                ID Transaksi *
                <input className="input-field" inputMode="numeric" placeholder="Masukkan ID transaksi" value={form.transaksi_id} onChange={(e) => setForm((p) => ({ ...p, transaksi_id: e.target.value.replace(/\D/g, "") }))} />
              </label>
              <label className="input-label">
                ID Customer
                <input className="input-field" inputMode="numeric" placeholder="Opsional" value={form.customer_id} onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value.replace(/\D/g, "") }))} />
              </label>
              <label className="input-label">
                Deskripsi Barang Lama *
                <input className="input-field" placeholder="Contoh: HP Samsung Galaxy A52" value={form.deskripsi_barang_lama} onChange={(e) => setForm((p) => ({ ...p, deskripsi_barang_lama: e.target.value }))} />
              </label>
              <label className="input-label">
                Kondisi
                <select className="input-field" value={form.kondisi} onChange={(e) => setForm((p) => ({ ...p, kondisi: e.target.value }))}>
                  <option value="">-- Pilih Kondisi --</option>
                  <option value="baik">Baik</option>
                  <option value="cukup">Cukup</option>
                  <option value="rusak">Rusak</option>
                </select>
              </label>
              <label className="input-label">
                Nilai Tukar (Rp)
                <input className="input-field" inputMode="numeric" placeholder="0" value={form.nilai_tukar} onChange={(e) => setForm((p) => ({ ...p, nilai_tukar: e.target.value.replace(/\D/g, "") }))} />
              </label>
              <label className="input-label">
                ID Produk Baru
                <input className="input-field" inputMode="numeric" placeholder="Opsional" value={form.produk_baru_id} onChange={(e) => setForm((p) => ({ ...p, produk_baru_id: e.target.value.replace(/\D/g, "") }))} />
              </label>
              <label className="input-label">
                Harga Produk Baru (Rp)
                <input className="input-field" inputMode="numeric" placeholder="0" value={form.harga_produk_baru} onChange={(e) => setForm((p) => ({ ...p, harga_produk_baru: e.target.value.replace(/\D/g, "") }))} />
              </label>
              <label className="input-label">
                Catatan
                <input className="input-field" placeholder="Opsional" value={form.catatan} onChange={(e) => setForm((p) => ({ ...p, catatan: e.target.value }))} />
              </label>
              <div className="sales-form__actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
                <button type="submit" className="btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
