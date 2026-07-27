/**
 * TukarTambah.jsx — Sistem tukar tambah multi-item.
 *
 * Aturan bisnis:
 * 1. Nilai tukar per item >= harga beli item di transaksi asal
 * 2. Total harga barang baru >= total pembelian pelanggan sebelumnya
 * 3. ID Transaksi dipilih dari riwayat penjualan
 * 4. Customer ID otomatis dari transaksi (read-only)
 * 5. Pilih banyak barang lama sekaligus
 * 6. Tambah banyak barang baru sekaligus
 * 7. Monitor selisih harus dibayar / dikembalikan
 * 8. Catatan wajib diisi
 *
 * UI: 2 panel — kiri: item yang dibeli & ditukar, kanan: item baru yang diambil
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import SearchSelect from "../components/SearchSelect";
import { PageShell, DataPanel, InfoNote, rupiah } from "../components/PageKit";
import { formatDateId } from "../utils/dateFormat";

/** Kondisi barang lama */
const KONDISI_OPTIONS = [
  { value: "baik", label: "Baik" },
  { value: "cukup", label: "Cukup" },
  { value: "rusak", label: "Rusak" },
];

/** Badge warna kondisi */
const kondisiColor = (k) => {
  const map = { baik: "#22c55e", cukup: "#f59e0b", rusak: "#ef4444" };
  return map[String(k).toLowerCase()] || "var(--color-text-secondary)";
};

/** Extract customer_id dari catatan transaksi */
function parseCustomerIdFromCatatan(catatan) {
  if (!catatan) return null;
  const m = String(catatan).match(/customer_id=(\d+)/);
  return m ? Number(m[1]) : null;
}

export default function TukarTambah() {
  const { addToast } = useToast();
  const [data, setData] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Data referensi
  const [riwayat, setRiwayat] = useState([]);
  const [produkList, setProdukList] = useState([]);
  const [selectedTransaksi, setSelectedTransaksi] = useState(null);
  const [customerNama, setCustomerNama] = useState("");

  // Item lama & baru
  const [oldItems, setOldItems] = useState([]);
  const [newItems, setNewItems] = useState([]);

  // Form header
  const [form, setForm] = useState({
    transaksi_id: "",
    catatan: "",
  });
  
  // State sementara produk yang dipilih tapi belum ditambahkan
  const [tempNewProdukId, setTempNewProdukId] = useState("");

  /** Load semua tukar tambah dari backend */
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

  // Escape closes the trade-in form while preserving any in-flight submit.
  useEffect(() => {
    /** Handles Escape for the trade-in modal. */
    const handleEscape = (event) => { if (event.key === "Escape" && showForm) setShowForm(false); };
    if (showForm) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showForm]);

  /** Load data saat buka form */
  const openForm = async () => {
    setForm({ transaksi_id: "", catatan: "" });
    setSelectedTransaksi(null);
    setCustomerNama("");
    setOldItems([]);
    setNewItems([]);
    setShowForm(true);
    try {
      const [trxList, produk] = await Promise.all([
        invoke("list_transaksi", { tipe: "penjualan", limit: 50 }).catch(() => []),
        invoke("list_produk").catch(() => []),
      ]);
      setRiwayat(Array.isArray(trxList) ? trxList : []);
      setProdukList(Array.isArray(produk) ? produk : []);
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  /** Pilih transaksi → ambil detail + customer */
  const pickTransaksi = async (id) => {
    if (!id) {
      setSelectedTransaksi(null);
      setCustomerNama("");
      setOldItems([]);
      setForm((p) => ({ ...p, transaksi_id: "", catatan: "" }));
      return;
    }
    try {
      const detail = await invoke("get_transaksi_detail", { id: Number(id) });
      setSelectedTransaksi(detail);
      setForm((p) => ({ ...p, transaksi_id: String(id) }));

      // Set item-item lama dari transaksi
      const items = detail.items.map((it) => ({
        produk_id: it.produk_id,
        nama_produk: it.produk_nama,
        qty: it.qty,
        harga_satuan: it.harga_satuan,
        subtotal: it.subtotal,
        nilai_tukar_satuan: it.harga_satuan, // default sesuai harga beli
        kondisi: "baik",
        isSelected: false,
      }));
      setOldItems(items);
      setNewItems([]); // reset item baru

      // Extract customer_id dari catatan
      const cid = parseCustomerIdFromCatatan(detail.header.catatan);
      if (cid) {
        try {
          const cust = await invoke("get_customer", { id: cid });
          setCustomerNama(cust?.nama || `Customer #${cid}`);
        } catch {
          setCustomerNama(`Customer #${cid}`);
        }
      } else {
        setCustomerNama("");
      }
    } catch (e) {
      addToast(`Gagal load detail: ${e}`, "error");
      setSelectedTransaksi(null);
    }
  };

  /** Toggle pilih item lama */
  const toggleOldItem = (idx) => {
    setOldItems((prev) => prev.map((item, i) => i === idx ? { ...item, isSelected: !item.isSelected } : item));
  };

  /** Update nilai tukar item lama */
  const updateOldItemNilai = (idx, val) => {
    setOldItems((prev) => prev.map((item, i) => i === idx ? { ...item, nilai_tukar_satuan: Number(val) || 0 } : item));
  };

  /** Update kondisi item lama */
  const updateOldItemKondisi = (idx, val) => {
    setOldItems((prev) => prev.map((item, i) => i === idx ? { ...item, kondisi: val } : item));
  };

  /** Tambah produk baru dari database */
  const addNewItem = (produkId) => {
    if (!produkId) return;
    const p = produkList.find((x) => String(x.id) === String(produkId));
    if (!p) return;

    const existIdx = newItems.findIndex((n) => String(n.produk_id) === String(produkId));
    if (existIdx >= 0) {
      // Tambah qty
      setNewItems((prev) => prev.map((n, i) => i === existIdx ? { ...n, qty: n.qty + 1, subtotal: (n.qty + 1) * n.harga_satuan } : n));
    } else {
      setNewItems((prev) => [...prev, {
        produk_id: Number(p.id),
        nama_produk: p.nama,
        qty: 1,
        harga_satuan: p.harga_jual,
        subtotal: p.harga_jual,
        nilai_tukar_satuan: 0,
        kondisi: null,
      }]);
    }
    addToast(`Menambahkan ${p.nama}`, "success");
  };

  /** Hapus item baru */
  const removeNewItem = (idx) => {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  };

  /** Update qty item baru */
  const updateNewItemQty = (idx, val) => {
    const qty = Math.max(1, Number(val) || 1);
    setNewItems((prev) => prev.map((n, i) => i === idx ? { ...n, qty, subtotal: qty * n.harga_satuan } : n));
  };

  /** Total tukar dari item lama yang dipilih */
  const totalTukar = useMemo(() => {
    return oldItems.filter((i) => i.isSelected).reduce((sum, i) => sum + i.nilai_tukar_satuan * i.qty, 0);
  }, [oldItems]);

  /** Total barang baru */
  const totalBaru = useMemo(() => {
    return newItems.reduce((sum, n) => sum + n.subtotal, 0);
  }, [newItems]);

  /** Selisih */
  const selisih = totalBaru - totalTukar;

  /** Validasi submit */
  const validate = () => {
    if (!form.transaksi_id) return "Pilih transaksi terlebih dahulu";
    const selectedOld = oldItems.filter((i) => i.isSelected);
    if (selectedOld.length === 0) return "Pilih minimal 1 barang dari transaksi lama";
    if (newItems.length === 0) return "Tambahkan minimal 1 barang baru";
    if (!form.catatan.trim()) return "Catatan wajib diisi";
    if (!selectedTransaksi) return "Data transaksi belum dimuat";

    // Rule 1: Cek setiap item lama >= harga beli awal
    for (const item of selectedOld) {
      if (item.nilai_tukar_satuan < item.harga_satuan) {
        return `Nilai tukar '${item.nama_produk}' (${rupiah(item.nilai_tukar_satuan)}) tidak boleh kurang dari harga beli (${rupiah(item.harga_satuan)})`;
      }
    }

    // Rule 2: Total barang baru >= total pembelian sebelumnya
    const totalLama = Number(selectedTransaksi.header.total);
    if (totalBaru < totalLama) {
      return `Total barang baru (${rupiah(totalBaru)}) tidak boleh kurang dari total pembelian sebelumnya (${rupiah(totalLama)})`;
    }

    return null;
  };

  /** Submit tukar tambah multi-item */
  const handleSubmit = async (event) => {
    event.preventDefault();
    const err = validate();
    if (err) return addToast(err, "error");

    try {
      const cid = parseCustomerIdFromCatatan(selectedTransaksi?.header?.catatan);
      
      // Susun items array
      const itemsPayload = [];
      
      // Tambah item lama
      oldItems.filter((i) => i.isSelected).forEach((i) => {
        itemsPayload.push({
          tipe: "lama",
          produk_id: i.produk_id,
          nama_produk: i.nama_produk,
          qty: i.qty,
          harga_satuan: i.harga_satuan,
          subtotal: i.harga_satuan * i.qty,
          nilai_tukar_satuan: i.nilai_tukar_satuan,
          kondisi: i.kondisi || null,
        });
      });

      // Tambah item baru
      newItems.forEach((n) => {
        itemsPayload.push({
          tipe: "baru",
          produk_id: n.produk_id,
          nama_produk: n.nama_produk,
          qty: n.qty,
          harga_satuan: n.harga_satuan,
          subtotal: n.subtotal,
          nilai_tukar_satuan: 0,
          kondisi: null,
        });
      });

      await invoke("create_tukar_tambah", {
        input: {
          transaksi_id: Number(form.transaksi_id),
          customer_id: cid || null,
          total_tukar: totalTukar,
          total_baru: totalBaru,
          catatan: form.catatan.trim() || null,
          items: itemsPayload,
        },
      });
      setShowForm(false);
      addToast("Tukar tambah multi-item dicatat", "success");
      load();
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  /** Statistik ringkasan */
  const totalNilai = data.reduce((sum, i) => sum + Number(i.nilai_tukar || 0), 0);
  const totalSelisih = data.reduce((sum, i) => sum + Number(i.selisih_bayar || 0), 0);

  /** Filter pencarian */
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data;
    return data.filter((i) => `${i.deskripsi_barang_lama} ${i.catatan || ""}`.toLowerCase().includes(term));
  }, [data, query]);

  /** Pilihan produk baru */
  const produkOptions = useMemo(
    () => produkList.map((p) => ({ value: String(p.id), label: `${p.nama} — ${rupiah(p.harga_jual)} (stok: ${p.stok})` })),
    [produkList]
  );

  return (
    <PageShell
      eyebrow="TRANSAKSI"
      title="Tukar Tambah"
      description="Sistem trade-in barang lama dengan banyak item. Pilih item lama di kiri, tambahkan item baru di kanan."
      actions={
        <button className="btn-primary sales-page__add" onClick={openForm}>
          <span className="material-symbols-outlined">swap_horiz</span>Tambah Tukar Tambah
        </button>
      }
      stats={[
        { label: "Total Transaksi", value: data.length, icon: "swap_horiz" },
        { label: "Total Nilai Tukar", value: rupiah(totalNilai), icon: "currency_exchange" },
        { label: "Total Selisih", value: rupiah(totalSelisih), icon: "receipt_long" },
      ]}
    >
      {/* ============================================================ */}
      {/* RIWAYAT */}
      {/* ============================================================ */}
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search">
            <span className="material-symbols-outlined">search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari deskripsi barang atau catatan..." />
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
                  <th>Ringkasan Barang</th>
                  <th>ID Transaksi</th>
                  <th>Total Tukar</th>
                  <th>Total Baru</th>
                  <th>Selisih</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="sales-name" style={{ cursor: "default" }}>
                        <span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>devices_other</span></span>
                        <span><strong>{item.deskripsi_barang_lama}</strong></span>
                      </div>
                    </td>
                    <td>#{item.transaksi_id}</td>
                    <td style={{ fontWeight: 600 }}>{rupiah(item.nilai_tukar)}</td>
                    <td>{rupiah(item.harga_produk_baru)}</td>
                    <td style={{ fontWeight: 700, color: "var(--color-primary)" }}>{rupiah(item.selisih_bayar)}</td>
                    <td style={{ color: "var(--color-text-secondary)", fontSize: 12, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.catatan || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* MODAL FORM — 2 PANEL MULTI-ITEM */}
      {/* ============================================================ */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal-content" style={{ maxWidth: 1100, width: "98vw" }}>
            <div className="sales-modal__header" style={{ borderBottom: "1px solid var(--color-surface-border)", paddingBottom: 12, marginBottom: 12 }}>
              <div>
                <h2 className="text-headline-md">Trade-In Multi-Item</h2>
                <p className="text-body-md">Pilih transaksi awal, tandai barang yang ditukar, lalu tambahkan barang baru penggantinya.</p>
              </div>
              <button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setShowForm(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="sales-form" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {selectedTransaksi && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
                  
                  {/* ============================================================ */}
                  {/* PANEL KIRI — Item LAMA dari Transaksi (Bisa Dicentang) */}
                  {/* ============================================================ */}
                  <div style={{ border: "1px solid var(--color-surface-border)", borderRadius: 12, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <p className="text-headline-sm" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>shopping_cart</span>
                      Pilih Barang Lama untuk Ditukar
                    </p>
                    <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
                      Centang barang yang ingin ditukar, atur kondisi dan nilai tukarnya.
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "45vh", overflowY: "auto", paddingRight: 6 }}>
                      {oldItems.map((item, idx) => {
                        const isChecked = item.isSelected;
                        return (
                          <div key={idx} onClick={() => toggleOldItem(idx)} style={{
                            padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                            border: isChecked ? "2px solid var(--color-primary)" : "1px solid var(--color-surface-border)",
                            background: isChecked ? "var(--color-primary-fixed)" : "var(--color-surface-bright)",
                            transition: "all 0.15s"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  width: 22, height: 22, borderRadius: 6,
                                  border: isChecked ? "2px solid var(--color-primary)" : "2px solid var(--color-surface-border)",
                                  background: isChecked ? "var(--color-primary)" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "white", fontWeight: 700
                                }}>
                                  {isChecked && "✓"}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.nama_produk}</div>
                                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                                    Jumlah: {item.qty} · Harga Beli: {rupiah(item.harga_satuan)}
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{rupiah(item.subtotal)}</div>
                            </div>

                            {isChecked && (
                              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} onClick={(e) => e.stopPropagation()}>
                                <div>
                                  <label className="input-label" style={{ marginBottom: 4 }}>Nilai Tukar/Satuan (Fix)</label>
                                  <div
                                    style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, background: "var(--color-surface-container)", borderRadius: 6, border: "1px solid var(--color-surface-border)" }}
                                  >
                                    {rupiah(item.nilai_tukar_satuan)}
                                  </div>
                                </div>
                                <div>
                                  <label className="input-label" style={{ marginBottom: 4 }}>Kondisi</label>
                                  <SearchSelect
                                    value={item.kondisi}
                                    onChange={(v) => updateOldItemKondisi(idx, v)}
                                    placeholder="Kondisi"
                                    options={KONDISI_OPTIONS}
                                    className="input-field"
                                    style={{ padding: 0 }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--color-surface-container)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                      <span>Total Nilai Tukar ({oldItems.filter(i => i.isSelected).length} item)</span>
                      <span>{rupiah(totalTukar)}</span>
                    </div>
                  </div>

                  {/* ============================================================ */}
                  {/* PANEL KANAN — Item BARU (Tambah Banyak) */}
                  {/* ============================================================ */}
                  <div style={{ border: "1px solid var(--color-surface-border)", borderRadius: 12, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <p className="text-headline-sm" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ color: "var(--color-income-green)" }}>add_shopping_cart</span>
                      Pilih Barang Baru Pengganti
                    </p>
                    
                    {/* Pilih produk baru */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <label className="input-label">Pilih Produk Baru</label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <SearchSelect
                            className="input-field"
                            value={tempNewProdukId}
                            onChange={setTempNewProdukId}
                            placeholder="Ketik nama produk baru..."
                            options={produkOptions}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ height: "40px", width: "40px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px" }}
                          onClick={() => {
                            if (!tempNewProdukId) return addToast("Pilih produk baru terlebih dahulu", "error");
                            addNewItem(tempNewProdukId);
                            setTempNewProdukId("");
                          }}
                          title="Tambah Produk Baru"
                        >
                          <span className="material-symbols-outlined">add</span>
                        </button>
                      </div>
                    </div>

                    {/* List item baru */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "40vh", overflowY: "auto", paddingRight: 6 }}>
                      {newItems.length === 0 && (
                        <div style={{ padding: "20px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 12, border: "1px dashed var(--color-surface-border)", borderRadius: 8 }}>
                          Belum ada barang baru ditambahkan
                        </div>
                      )}
                      {newItems.map((item, idx) => (
                        <div key={idx} style={{
                          padding: "10px 12px", borderRadius: 10,
                          border: "1px solid var(--color-surface-border)",
                          background: "var(--color-surface-bright)",
                          display: "flex", flexDirection: "column", gap: 8
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--color-income-green)" }}>inventory_2</span>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.nama_produk}</div>
                                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{rupiah(item.harga_satuan)}/satuan</div>
                              </div>
                            </div>
                            <button type="button" onClick={() => removeNewItem(idx)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-expense-red)" }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                            </button>
                          </div>
                          
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }} onClick={(e) => e.stopPropagation()}>
                            <div>
                              <label className="input-label" style={{ marginBottom: 4, fontSize: 10 }}>Jumlah</label>
                              <input className="input-field" type="number" min="1" value={item.qty} onChange={(e) => updateNewItemQty(idx, e.target.value)} style={{ fontSize: 12, padding: "6px 8px" }} />
                            </div>
                            <div>
                              <label className="input-label" style={{ marginBottom: 4, fontSize: 10 }}>Harga Satuan</label>
                              <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600 }}>{rupiah(item.harga_satuan)}</div>
                            </div>
                            <div>
                              <label className="input-label" style={{ marginBottom: 4, fontSize: 10 }}>Subtotal</label>
                              <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "var(--color-primary)" }}>{rupiah(item.subtotal)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--color-surface-container)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                      <span>Total Harga Barang Baru ({newItems.length} item)</span>
                      <span>{rupiah(totalBaru)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Monitor Selisih Harga */}
              {selectedTransaksi && (
                <div style={{ padding: "1rem", borderRadius: 12, background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))", border: "1px solid var(--color-primary-fixed-dim)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>Total Tukar</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{rupiah(totalTukar)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>Total Barang Baru</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{rupiah(totalBaru)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>{selisih >= 0 ? "Selisih Bayar" : "Sisa"}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: selisih >= 0 ? "var(--color-primary)" : "var(--color-warning-amber)" }}>
                      {rupiah(Math.abs(selisih))}
                    </div>
                  </div>
                </div>
              )}

              {/* Pilih Transaksi & Catatan Kasir — dipindah ke sini setelah monitor */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
                <label className="input-label">
                  Pilih Transaksi Penjualan *
                  <SearchSelect
                    className="input-field"
                    value={form.transaksi_id}
                    onChange={(v) => pickTransaksi(v)}
                    placeholder="Pilih dari riwayat penjualan..."
                    options={riwayat.map((t) => ({
                      value: String(t.id),
                      label: `#${t.id} — ${formatDateId(t.tanggal)} — ${rupiah(t.total)}`,
                    }))}
                  />
                </label>
                <label className="input-label">
                  Catatan Kasir *
                  <input className="input-field" placeholder="Alasan tukar tambah..." value={form.catatan} onChange={(e) => setForm((p) => ({ ...p, catatan: e.target.value }))} />
                </label>
              </div>

              {customerNama && (
                <div style={{ padding: "8px 14px", borderRadius: 8, background: "var(--color-primary-fixed)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12 }}>Customer: <strong>{customerNama}</strong></span>
                  <span className="badge" style={{ background: "var(--color-primary)", color: "white", fontSize: 9, padding: "2px 8px" }}>AUTO-FILLED</span>
                </div>
              )}

              <div className="sales-form__actions" style={{ borderTop: "1px solid var(--color-surface-border)", paddingTop: "1rem", marginTop: 0 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
                <button type="submit" className="btn-primary">Simpan Trade-In</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
