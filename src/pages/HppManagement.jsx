import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

/**
 * HppManagement — Tambah batch stok masuk + kalkulasi HPP (FIFO/LIFO).
 *
 * Side effects:
 * - `add_stok_batch`: insert ke stok_batch, tidak mutasi qty_terpakai
 * - `hitung_hpp_fifo`/`hitung_hpp_lifo`: read-only preview kalkulasi
 */
export default function HppManagement() {
  const { addToast } = useToast();

  /** Form tambah batch stok */
  const [batch, setBatch] = useState({
    produkId: "", gudangId: "", tglMasuk: new Date().toISOString().slice(0, 10),
    qtyMasuk: "", hargaBeli: ""
  });

  /** Form simulasi HPP */
  const [simForm, setSimForm] = useState({
    produkId: "", qtyJual: "", gudangId: "", metode: "fifo"
  });

  /** Hasil kalkulasi HPP */
  const [hppResult, setHppResult] = useState(null);

  /** Loading state per aksi */
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);

  /** Daftar produk aktif untuk datalist */
  const [produkList, setProdukList] = useState([]);

  useEffect(() => {
    invoke("list_produk", { onlyActive: true })
      .then((d) => setProdukList(d || []))
      .catch(() => {});
  }, []);

  /**
   * Tambah batch stok masuk.
   * Validasi: semua field wajib, qty & harga > 0.
   */
  const addBatch = async (e) => {
    e.preventDefault();
    const produkId = Number(batch.produkId);
    const qtyMasuk = Number(batch.qtyMasuk);
    const hargaBeli = Number(batch.hargaBeli);
    if (!produkId) return addToast("Produk ID wajib diisi", "error");
    if (!qtyMasuk || qtyMasuk <= 0) return addToast("Qty masuk harus > 0", "error");
    if (!hargaBeli || hargaBeli <= 0) return addToast("Harga beli harus > 0", "error");
    setLoadingBatch(true);
    try {
      await invoke("add_stok_batch", {
        input: {
          produk_id: produkId,
          gudang_id: batch.gudangId ? Number(batch.gudangId) : null,
          tgl_masuk: batch.tglMasuk,
          qty_masuk: qtyMasuk,
          harga_beli: hargaBeli,
          ref_tabel: null,
          ref_id: null
        }
      });
      addToast("Batch stok ditambahkan", "success");
      setBatch((prev) => ({ ...prev, produkId: "", qtyMasuk: "", hargaBeli: "" }));
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setLoadingBatch(false);
    }
  };

  /**
   * Simulasi kalkulasi HPP FIFO atau LIFO.
   * Read-only — tidak mengubah stok_batch.
   */
  const hitungHpp = async (e) => {
    e.preventDefault();
    const produkId = Number(simForm.produkId);
    const qtyJual = Number(simForm.qtyJual);
    if (!produkId) return addToast("Produk ID wajib diisi", "error");
    if (!qtyJual || qtyJual <= 0) return addToast("Qty jual harus > 0", "error");
    setLoadingSim(true);
    setHppResult(null);
    try {
      const cmd = simForm.metode === "lifo" ? "hitung_hpp_lifo" : "hitung_hpp_fifo";
      const result = await invoke(cmd, {
        produk_id: produkId,
        qty_jual: qtyJual,
        gudang_id: simForm.gudangId ? Number(simForm.gudangId) : null
      });
      setHppResult({ ...result, metode: simForm.metode.toUpperCase() });
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setLoadingSim(false);
    }
  };

  /** HPP per unit dari hasil kalkulasi */
  const hppPerUnit = hppResult
    ? hppResult.qty_terpenuhi > 0
      ? Math.round(hppResult.total_hpp / hppResult.qty_terpenuhi)
      : 0
    : null;

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">MANAJEMEN HPP</p>
          <h1 className="text-headline-lg">HPP Management</h1>
          <p className="text-body-md sales-page__subtitle">
            Catat batch stok masuk dan simulasikan HPP dengan metode FIFO atau LIFO.
          </p>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

        {/* ── Bagian kiri: Tambah Batch Stok ── */}
        <section className="sales-panel">
          <div className="sales-panel__toolbar">
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>
              add_box
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Tambah Batch Stok</span>
          </div>
          <form onSubmit={addBatch} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label>
              Produk ID *
              <input
                className="input-field"
                type="number"
                placeholder="ID produk"
                value={batch.produkId}
                onChange={(e) => setBatch((p) => ({ ...p, produkId: e.target.value }))}
              />
            </label>
            <label>
              Gudang ID
              <input
                className="input-field"
                type="number"
                placeholder="Opsional"
                value={batch.gudangId}
                onChange={(e) => setBatch((p) => ({ ...p, gudangId: e.target.value }))}
              />
            </label>
            <label>
              Tanggal Masuk *
              <input
                className="input-field"
                type="date"
                value={batch.tglMasuk}
                onChange={(e) => setBatch((p) => ({ ...p, tglMasuk: e.target.value }))}
              />
            </label>
            <label>
              Qty Masuk *
              <input
                className="input-field"
                type="number"
                placeholder="Jumlah unit"
                value={batch.qtyMasuk}
                onChange={(e) => setBatch((p) => ({ ...p, qtyMasuk: e.target.value }))}
              />
            </label>
            <label>
              Harga Beli * (Rp)
              <input
                className="input-field"
                type="number"
                placeholder="Harga per unit"
                value={batch.hargaBeli}
                onChange={(e) => setBatch((p) => ({ ...p, hargaBeli: e.target.value }))}
              />
            </label>
            <button className="btn-primary" type="submit" disabled={loadingBatch}>
              {loadingBatch ? "Menyimpan…" : "Simpan Batch"}
            </button>
          </form>
        </section>

        {/* ── Bagian kanan: Simulasi HPP ── */}
        <section className="sales-panel">
          <div className="sales-panel__toolbar">
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>
              calculate
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Simulasi HPP</span>
          </div>
          <form onSubmit={hitungHpp} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label>
              Produk ID *
              <input
                className="input-field"
                type="number"
                placeholder="ID produk"
                value={simForm.produkId}
                onChange={(e) => setSimForm((p) => ({ ...p, produkId: e.target.value }))}
              />
            </label>
            <label>
              Gudang ID
              <input
                className="input-field"
                type="number"
                placeholder="Opsional"
                value={simForm.gudangId}
                onChange={(e) => setSimForm((p) => ({ ...p, gudangId: e.target.value }))}
              />
            </label>
            <label>
              Qty Jual *
              <input
                className="input-field"
                type="number"
                placeholder="Jumlah unit dijual"
                value={simForm.qtyJual}
                onChange={(e) => setSimForm((p) => ({ ...p, qtyJual: e.target.value }))}
              />
            </label>
            <label>
              Metode
              <select
                className="input-field"
                value={simForm.metode}
                onChange={(e) => setSimForm((p) => ({ ...p, metode: e.target.value }))}
              >
                <option value="fifo">FIFO — First In First Out</option>
                <option value="lifo">LIFO — Last In First Out</option>
              </select>
            </label>
            <button className="btn-primary" type="submit" disabled={loadingSim}>
              {loadingSim ? "Menghitung…" : "Hitung HPP"}
            </button>
          </form>

          {/* Hasil kalkulasi ditampilkan sebagai kartu ringkasan */}
          {hppResult && (
            <div style={{ padding: "0 16px 16px" }}>
              <div
                style={{
                  background: "var(--color-surface-container-low)",
                  border: "1px solid var(--color-surface-border)",
                  borderRadius: 12,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    Hasil HPP ({hppResult.metode})
                  </span>
                  <span className="badge badge-success">{hppResult.metode}</span>
                </div>

                {/* Total HPP */}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Total HPP</span>
                  <strong style={{ fontSize: 15, color: "var(--color-primary)" }}>
                    {rupiah(hppResult.total_hpp)}
                  </strong>
                </div>

                {/* HPP per unit */}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>HPP per Unit</span>
                  <strong>{rupiah(hppPerUnit)}</strong>
                </div>

                {/* Qty terpenuhi */}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Qty Terpenuhi</span>
                  <span>
                    {hppResult.qty_terpenuhi}
                    {hppResult.qty_terpenuhi < Number(simForm.qtyJual) && (
                      <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                        Stok kurang
                      </span>
                    )}
                  </span>
                </div>

                {/* Jumlah batch terpakai */}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Batch Dipakai</span>
                  <span>{hppResult.batches_used?.length ?? 0} batch</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
