import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";
import DateField from "../components/DateField";
import RupiahInput from "../components/RupiahInput";
import SearchSelect from "../components/SearchSelect";

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
  const [gudangList, setGudangList] = useState([]);

  useEffect(() => {
    Promise.all([
      invoke("list_produk", { onlyActive: true }),
      invoke("list_gudang"),
    ])
      .then(([produk, gudang]) => {
        setProdukList(produk || []);
        setGudangList(gudang || []);
      })
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
    if (!qtyMasuk || qtyMasuk <= 0) return addToast("Jumlah masuk harus > 0", "error");
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
    if (!qtyJual || qtyJual <= 0) return addToast("Jumlah jual harus > 0", "error");
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
    <PageShell
      eyebrow="MANAJEMEN HPP"
      title="HPP Management"
      description="Catat batch stok masuk dan simulasikan HPP dengan metode FIFO atau LIFO."
    >
      <InfoNote icon="account_balance">
        Kartu persediaan mencatat barang masuk, barang keluar, dan saldo per layer harga. LIFO tersedia untuk simulasi internal; FIFO lebih umum dipakai untuk pelaporan.
      </InfoNote>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "stretch" }}>

        {/* ── Bagian kiri: Tambah Batch Stok ── */}
        <section className="sales-panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="sales-panel__toolbar">
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>
              add_box
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Tambah Batch Stok</span>
          </div>
          <form onSubmit={addBatch} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", flex: 1, minHeight: 410 }}>
            <label>
              Produk ID *
              <SearchSelect
                value={batch.produkId}
                onChange={(value) => setBatch((p) => ({ ...p, produkId: value }))}
                placeholder="Pilih produk"
                options={produkList.map((p) => ({ value: String(p.id), label: `${p.nama}${p.sku ? ` — ${p.sku}` : ""}` }))}
                required
              />
            </label>
            <label>
              Gudang
              <SearchSelect
                value={batch.gudangId}
                onChange={(value) => setBatch((p) => ({ ...p, gudangId: value }))}
                placeholder="Semua gudang"
                options={gudangList.map((g) => ({ value: String(g.id), label: g.nama }))}
              />
            </label>
            <label>
              Tanggal Masuk *
              <DateField
                value={batch.tglMasuk}
                onChange={(v) => setBatch((p) => ({ ...p, tglMasuk: v }))}
                required
              />
            </label>
            <label>
              Jumlah Masuk *
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
              <RupiahInput value={batch.hargaBeli} onChange={(val) => setBatch((p) => ({ ...p, hargaBeli: val }))} placeholder="Harga per unit" />
            </label>
            <button className="btn-primary" type="submit" disabled={loadingBatch} style={{ marginTop: "auto" }}>
              {loadingBatch ? "Menyimpan…" : "Simpan Batch"}
            </button>
          </form>
        </section>

        {/* ── Bagian kanan: Simulasi HPP ── */}
        <section className="sales-panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="sales-panel__toolbar">
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>
              calculate
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Simulasi HPP</span>
          </div>
          <form onSubmit={hitungHpp} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", flex: 1, minHeight: 410 }}>
            <label>
              Produk ID *
              <SearchSelect
                value={simForm.produkId}
                onChange={(value) => setSimForm((p) => ({ ...p, produkId: value }))}
                placeholder="Pilih produk"
                options={produkList.map((p) => ({ value: String(p.id), label: `${p.nama}${p.sku ? ` — ${p.sku}` : ""}` }))}
                required
              />
            </label>
            <label>
              Gudang
              <SearchSelect
                value={simForm.gudangId}
                onChange={(value) => setSimForm((p) => ({ ...p, gudangId: value }))}
                placeholder="Semua gudang"
                options={gudangList.map((g) => ({ value: String(g.id), label: g.nama }))}
              />
            </label>
            <label>
              Jumlah Jual *
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
              <SearchSelect
                value={simForm.metode}
                onChange={(value) => setSimForm((p) => ({ ...p, metode: value }))}
                options={[{ value: "fifo", label: "FIFO — First In First Out" }, { value: "lifo", label: "LIFO — Last In First Out" }]}
                placeholder="Pilih metode"
              />
            </label>
            <button className="btn-primary" type="submit" disabled={loadingSim} style={{ marginTop: "auto" }}>
              {loadingSim ? "Menghitung…" : "Hitung HPP"}
            </button>
          </form>

          {/* Hasil kalkulasi ditampilkan sebagai Kartu Persediaan */}
          {hppResult && (
            <div style={{ padding: "0 16px 16px" }}>
              {(() => {
                const sim = { ...hppResult, qtyJual: Number(simForm.qtyJual) };
                return (
                  <div className="sales-table-wrap" style={{ fontSize: 13 }}>
                    <table className="sales-table">
                      <thead>
                        <tr>
                          <th rowSpan={2}>Tanggal</th>
                          <th rowSpan={2}>Keterangan</th>
                          <th colSpan={3} style={{ textAlign: "center", borderRight: "1px solid var(--color-border)" }}>Masuk (Pembelian)</th>
                          <th colSpan={3} style={{ textAlign: "center", borderRight: "1px solid var(--color-border)" }}>Keluar (Penjualan)</th>
                          <th colSpan={3} style={{ textAlign: "center" }}>Sisa (Saldo Akhir)</th>
                        </tr>
                        <tr>
                          <th style={{ textAlign: "right" }}>Qty</th>
                          <th style={{ textAlign: "right" }}>Harga</th>
                          <th style={{ textAlign: "right", borderRight: "1px solid var(--color-border)" }}>Total</th>
                          <th style={{ textAlign: "right" }}>Qty</th>
                          <th style={{ textAlign: "right" }}>Harga</th>
                          <th style={{ textAlign: "right", borderRight: "1px solid var(--color-border)" }}>Total</th>
                          <th style={{ textAlign: "right" }}>Qty</th>
                          <th style={{ textAlign: "right" }}>Rata-rata</th>
                          <th style={{ textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(hppResult.layers || []).map((layer, idx) => (
                          <tr key={layer.batch_id}>
                            <td style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>—</td>
                            <td>{idx === 0 ? "Penjualan Kasir" : ""}</td>
                            <td style={{ textAlign: "right" }}>—</td>
                            <td style={{ textAlign: "right" }}>—</td>
                            <td style={{ textAlign: "right", borderRight: "1px solid var(--color-border)" }}>—</td>
                            <td style={{ textAlign: "right" }}>{layer.qty_ambil}</td>
                            <td style={{ textAlign: "right" }}>{rupiah(layer.harga_beli)}</td>
                            <td style={{ textAlign: "right", borderRight: "1px solid var(--color-border)" }}>{rupiah(layer.total)}</td>
                            <td style={{ textAlign: "right" }}>—</td>
                            <td style={{ textAlign: "right" }}>—</td>
                            <td style={{ textAlign: "right" }}>—</td>
                          </tr>
                        ))}
                        {/* Baris ringkasan HPP */}
                        <tr style={{ fontWeight: 700, background: "var(--color-surface-container-low)" }}>
                          <td colSpan={5} style={{ textAlign: "right", borderRight: "1px solid var(--color-border)" }}>
                            Total HPP ({hppResult.metode})
                          </td>
                          <td style={{ textAlign: "right" }}>{hppResult.qty_terpenuhi}</td>
                          <td style={{ textAlign: "right" }}></td>
                          <td style={{ textAlign: "right", borderRight: "1px solid var(--color-border)" }}>{rupiah(hppResult.total_hpp)}</td>
                          <td colSpan={3}></td>
                        </tr>
                        {/* Saldo layers */}
                        {(hppResult.saldo_layers || []).map((sl) => (
                          <tr key={`saldo-${sl.batch_id}`}>
                            <td colSpan={2}>Sisa stok</td>
                            <td style={{ textAlign: "right" }}>{sl.qty_ambil}</td>
                            <td style={{ textAlign: "right" }}>{rupiah(sl.harga_beli)}</td>
                            <td style={{ textAlign: "right" }}>{rupiah(sl.total)}</td>
                            <td colSpan={3}></td>
                            <td style={{ textAlign: "right" }}>{sl.qty_ambil}</td>
                            <td style={{ textAlign: "right" }}>{rupiah(sl.harga_beli)}</td>
                            <td style={{ textAlign: "right" }}>{rupiah(sl.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 4px" }}>
                      <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                        Metode: {hppResult.metode}
                      </span>
                      <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                        HPP per unit: {hppPerUnit ? rupiah(hppPerUnit) : "—"}
                      </span>
                      {hppResult.qty_terpenuhi < Number(simForm.qtyJual) && (
                        <span className="badge badge-warning">Stok kurang — tersedia {hppResult.qty_terpenuhi}</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
