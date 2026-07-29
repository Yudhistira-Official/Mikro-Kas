import { useState, useEffect, useMemo } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import SearchSelect from "../components/SearchSelect";
import RupiahInput from "../components/RupiahInput";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";
import { formatDateId, formatDateTimeId } from "../utils/dateFormat";

const emptyItem = () => ({ produk_id: "", nama_produk: "", kode_barang: "", qty: "1", harga_kesepakatan: "", harga_pembanding: "", kondisi: "" });
const emptyMasuk = { nomor: "", tanggal: new Date().toISOString().slice(0, 10), supplier_id: "", alamat_supplier: "", telepon_supplier: "", komisi_persen: "15", batas_waktu: "", items: [emptyItem()], catatan: "" };
const emptyKeluar = { nomor: "", tanggal: new Date().toISOString().slice(0, 10), penerima_nama: "", penerima_telepon: "", alamat_tujuan: "", penanggung_jawab: "", komisi_persen: "20", jadwal_evaluasi: "", items: [emptyItem()], catatan: "" };

export default function Konsinyasi() {
  const { addToast } = useToast();
  const [masuk, setMasuk] = useState([]);
  const [keluar, setKeluar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("masuk");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyMasuk);
  const [suppliers, setSuppliers] = useState([]);
  const [produkList, setProdukList] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [m, k, s, p] = await Promise.all([
        invoke("list_konsinyasi_masuk"),
        invoke("list_konsinyasi_keluar"),
        invoke("list_supplier").catch(() => []),
        invoke("list_produk", { onlyActive: true }).catch(() => []),
      ]);
      setMasuk(Array.isArray(m) ? m : []);
      setKeluar(Array.isArray(k) ? k : []);
      setSuppliers(Array.isArray(s) ? s : []);
      setProdukList(Array.isArray(p) ? p : []);
    } catch (e) { { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }; }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Escape closes the active modal without interrupting a submit operation.
  useEffect(() => {
    /** Handles Escape for the konsinyasi form or detail modal. */
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (showForm) setShowForm(false);
      else if (detailId) { setDetailId(null); setDetailItems([]); }
    };
    if (showForm || detailId) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showForm, detailId]);

  const rows = activeTab === "masuk" ? masuk : keluar;
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => `${item.nomor} ${item.tanggal} ${item.status} ${item.penerima_nama || ""} ${item.catatan || ""}`.toLowerCase().includes(term));
  }, [rows, query]);

  const totalItems = [...masuk, ...keluar].reduce((sum, item) => sum + Number(item.total_item || 0), 0);
  const getSupplierName = (id) => suppliers.find((s) => String(s.id) === String(id))?.nama || `#${id || "-"}`;
  const getSupplier = (id) => suppliers.find((s) => String(s.id) === String(id));

  const produkOpts = useMemo(() => produkList.map((p) => ({
    value: String(p.id),
    label: `${p.nama}${p.sku ? ` — ${p.sku}` : ""}`,
    nama: p.nama,
    sku: p.sku,
    harga_jual: p.harga_jual,
  })), [produkList]);

  const openForm = async (type) => {
    setActiveTab(type);
    let nomor = "";
    try { nomor = await invoke("generate_nomor", { tipe: `konsinyasi_${type}` }); } catch { }
    const base = type === "masuk" ? { ...emptyMasuk, nomor } : { ...emptyKeluar, nomor };
    setForm(base);
    setShowForm(true);
  };

  const pickProduk = (idx, val) => {
    const p = produkList.find((x) => String(x.id) === val);
    if (!p) return;
    const items = [...form.items];
    items[idx] = {
      ...items[idx],
      produk_id: val,
      nama_produk: p.nama,
      kode_barang: p.sku || "",
      harga_pembanding: String(p.harga_jual || 0),
    };
    setForm((prev) => ({ ...prev, items }));
  };

  const pickSupplier = (val) => {
    const s = getSupplier(val);
    setForm((prev) => ({
      ...prev, supplier_id: val,
      alamat_supplier: s?.alamat || "",
      telepon_supplier: s?.telepon || "",
    }));
  };

  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  const removeItem = (idx) => {
    if (form.items.length <= 1) return;
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };
  const setItem = (idx, field, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    setForm((prev) => ({ ...prev, items }));
  };

  const totalQty = useMemo(() => form.items.reduce((s, i) => s + Number(i.qty || 0), 0), [form.items]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nomor.trim() || !form.tanggal) return addToast("Nomor dan tanggal wajib diisi", "error");
    if (activeTab === "keluar" && !form.penerima_nama.trim()) return addToast("Nama penerima wajib diisi", "error");
    const payload = {
      nomor: form.nomor.trim(),
      tanggal: form.tanggal,
      items: form.items.map((i) => ({
        produk_id: Number(i.produk_id),
        kode_barang: i.kode_barang.trim() || null,
        qty: Number(i.qty) || 1,
        harga_kesepakatan: Number(i.harga_kesepakatan) || 0,
        harga_pembanding: Number(i.harga_pembanding) || 0,
        kondisi: i.kondisi.trim() || null,
      })),
      catatan: form.catatan.trim() || null,
    };
    try {
      if (activeTab === "masuk") {
        await invoke("create_konsinyasi_masuk", {
          input: { ...payload, supplier_id: form.supplier_id ? Number(form.supplier_id) : null, alamat_supplier: form.alamat_supplier.trim() || null, telepon_supplier: form.telepon_supplier.trim() || null, komisi_persen: Number(form.komisi_persen) || 15, batas_waktu: form.batas_waktu.trim() || null },
        });
      } else {
        await invoke("create_konsinyasi_keluar", {
          input: { ...payload, penerima_nama: form.penerima_nama.trim(), penerima_telepon: form.penerima_telepon.trim() || null, alamat_tujuan: form.alamat_tujuan.trim() || null, penanggung_jawab: form.penanggung_jawab.trim() || null, komisi_persen: Number(form.komisi_persen) || 20, jadwal_evaluasi: form.jadwal_evaluasi.trim() || null },
        });
      }
      setShowForm(false);
      addToast(`Konsinyasi ${activeTab} ditambahkan`, "success");
      load();
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  const openDetail = async (item) => {
    setDetailId(item);
    try {
      const command = activeTab === "masuk" ? "list_konsinyasi_masuk_item" : "list_konsinyasi_keluar_item";
      const key = activeTab === "masuk" ? "konsinyasi_masuk_id" : "konsinyasi_keluar_id";
      const data = await invoke(command, { [key]: item.id });
      setDetailItems(Array.isArray(data) ? data : []);
    } catch { setDetailItems([]); }
  };

  return (
    <PageShell
      eyebrow="INVENTORI"
      title="Konsinyasi"
      description="Catat barang konsinyasi masuk dari supplier dan keluar ke penerima."
      actions={
        <div className="sales-page__add">
          <button className="btn-secondary" onClick={() => openForm("masuk")}><span className="material-symbols-outlined">move_to_inbox</span>Barang Masuk</button>
          <button className="btn-primary" onClick={() => openForm("keluar")}><span className="material-symbols-outlined">outbox</span>Barang Keluar</button>
        </div>
      }
      stats={[
        { label: "Konsinyasi Masuk", value: masuk.length, icon: "move_to_inbox" },
        { label: "Konsinyasi Keluar", value: keluar.length, icon: "outbox" },
        { label: "Total Item", value: totalItems.toLocaleString("id-ID"), icon: "inventory_2" },
      ]}
    >
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search"><span className="material-symbols-outlined">search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nomor, penerima, status, atau catatan..." /></div>
          <button className="btn-secondary" onClick={load}><span className="material-symbols-outlined">refresh</span>Refresh</button>
        </div>
        <div style={{ display: "flex", gap: 4, padding: "10px 16px", borderBottom: "1px solid var(--color-surface-border)" }}>
          <button className={activeTab === "masuk" ? "btn-primary" : "btn-secondary"} onClick={() => setActiveTab("masuk")}>Konsinyasi Masuk ({masuk.length})</button>
          <button className={activeTab === "keluar" ? "btn-primary" : "btn-secondary"} onClick={() => setActiveTab("keluar")}>Konsinyasi Keluar ({keluar.length})</button>
        </div>

        {loading ? <div className="loading-page"><div className="spinner" /></div> :
         filtered.length === 0 ? <div className="empty-state"><span className="material-symbols-outlined">inventory_2</span><p>Belum ada data konsinyasi {activeTab}</p></div> : (
          <div className="sales-table-wrap"><table className="sales-table"><thead><tr>
            <th>Nomor</th><th>Tanggal</th><th>{activeTab === "masuk" ? "Supplier" : "Penerima"}</th><th>Total Item</th><th>Status</th><th>Komisi</th><th>Batas/Jadwal</th><th>Catatan</th><th>Dibuat</th>
          </tr></thead><tbody>
            {filtered.map((item) => (
              <tr key={item.id} onClick={() => openDetail(item)} style={{ cursor: "pointer" }}>
                <td><div className="sales-name"><span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>{activeTab === "masuk" ? "move_to_inbox" : "outbox"}</span></span><span><strong>{item.nomor}</strong><small>{activeTab === "keluar" ? item.penerima_telepon || "Tanpa telepon" : getSupplierName(item.supplier_id)}</small></span></div></td>
                <td>{formatDateId(item.tanggal)}</td>
                <td>{activeTab === "masuk" ? (item.supplier_id ? getSupplierName(item.supplier_id) : "-") : item.penerima_nama}</td>
                <td style={{ fontWeight: 700 }}>{Number(item.total_item || 0).toLocaleString("id-ID")}</td>
                <td><StatusBadge tone={item.status === "selesai" ? "success" : item.status === "retur" ? "warning" : "primary"} label={item.status} /></td>
                <td>{item.komisi_persen || "-"}%</td>
                <td style={{ fontSize: 12 }}>{activeTab === "masuk" ? formatDateId(item.batas_waktu) : formatDateId(item.jadwal_evaluasi) || "-"}</td>
                <td style={{ color: "var(--color-text-secondary)" }}>{item.catatan || "-"}</td>
                <td style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{formatDateId(item.created_at)}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "800px" }}>
            <div className="sales-modal__header">
              <div><h2 className="text-headline-md">Konsinyasi {activeTab === "masuk" ? "Masuk" : "Keluar"}</h2><p className="text-body-md">Lengkapi data barang dan ketentuan konsinyasi.</p></div>
              <button type="button" className="btn-icon" aria-label="Tutup" onClick={() => setShowForm(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSubmit} className="sales-form">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label className="input-label">No. Dokumen *<input className="input-field" value={form.nomor} onChange={(e) => setForm((p) => ({ ...p, nomor: e.target.value }))} /></label>
                <label className="input-label">Tanggal *<DateField value={form.tanggal} onChange={(v) => setForm((p) => ({ ...p, tanggal: v }))} /></label>
              </div>

              {activeTab === "masuk" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <label className="input-label">Nama Pemasok (Konsinyor)<SearchSelect className="input-field" value={form.supplier_id} onChange={pickSupplier} placeholder="— Pilih Pemasok —" options={suppliers.map((s) => ({ value: String(s.id), label: s.nama }))} /></label>
                  <label className="input-label">Alamat Pemasok<input className="input-field" value={form.alamat_supplier} onChange={(e) => setForm((p) => ({ ...p, alamat_supplier: e.target.value }))} /></label>
                  <label className="input-label">No. Telepon Pemasok<input className="input-field" value={form.telepon_supplier} onChange={(e) => setForm((p) => ({ ...p, telepon_supplier: e.target.value }))} /></label>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <label className="input-label">Nama Toko Tujuan *<input className="input-field" value={form.penerima_nama} onChange={(e) => setForm((p) => ({ ...p, penerima_nama: e.target.value }))} /></label>
                  <label className="input-label">Nama Penanggung Jawab<input className="input-field" value={form.penanggung_jawab} onChange={(e) => setForm((p) => ({ ...p, penanggung_jawab: e.target.value }))} /></label>
                  <label className="input-label">Alamat Toko Tujuan<input className="input-field" value={form.alamat_tujuan} onChange={(e) => setForm((p) => ({ ...p, alamat_tujuan: e.target.value }))} /></label>
                  <label className="input-label">No. Telepon<input className="input-field" inputMode="tel" value={form.penerima_telepon} onChange={(e) => setForm((p) => ({ ...p, penerima_telepon: e.target.value }))} /></label>
                </div>
              )}

              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h3 className="text-headline-sm">Daftar Barang</h3>
                  <button type="button" className="btn-secondary" onClick={addItem} style={{ fontSize: 12 }}>+ Tambah Barang</button>
                </div>
                <div className="sales-table-wrap" style={{ maxHeight: "280px", overflowY: "auto" }}>
                  <table className="sales-table"><thead><tr>
                    <th style={{ width: "90px" }}>Kode</th>
                    <th style={{ minWidth: "140px" }}>Nama Barang / Produk</th>
                    <th style={{ width: "70px" }}>Jml</th>
                    <th style={{ width: "120px" }}>Harga {activeTab === "masuk" ? "Satuan" : "Jual"} (Rp)</th>
                    <th style={{ width: "100px" }}>Ket. / Kondisi</th>
                    <th style={{ width: "36px" }}></th>
                  </tr></thead><tbody>
                    {form.items.map((item, idx) => (
                      <tr key={idx}>
                        <td><input className="input-field" style={{ width: "80px", fontSize: 12 }} value={item.kode_barang} onChange={(e) => setItem(idx, "kode_barang", e.target.value)} placeholder="SKU" /></td>
                        <td><SearchSelect className="input-field" style={{ minWidth: "120px" }} value={item.produk_id} onChange={(v) => pickProduk(idx, v)} placeholder="Cari produk..." options={produkOpts} /></td>
                        <td><input className="input-field" style={{ width: "60px" }} inputMode="numeric" value={item.qty} onChange={(e) => setItem(idx, "qty", e.target.value.replace(/\D/g, ""))} /></td>
                        <td><RupiahInput value={item.harga_kesepakatan} onChange={(v) => setItem(idx, "harga_kesepakatan", v)} /></td>
                        <td><input className="input-field" style={{ fontSize: 12 }} value={item.kondisi} onChange={(e) => setItem(idx, "kondisi", e.target.value)} placeholder="Baik/rusak" /></td>
                        <td>{form.items.length > 1 && <button type="button" className="btn-icon" onClick={() => removeItem(idx)} title="Hapus"><span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span></button>}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>Total barang: {totalQty}</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
                {activeTab === "masuk" ? (
                  <>
                    <label className="input-label">Komisi Toko (%)<input className="input-field" inputMode="numeric" value={form.komisi_persen} onChange={(e) => setForm((p) => ({ ...p, komisi_persen: e.target.value.replace(/\D/g, "") }))} placeholder="15" /></label>
                    <label className="input-label">Batas Waktu Penitipan<DateField value={form.batas_waktu} onChange={(v) => setForm((p) => ({ ...p, batas_waktu: v }))} /></label>
                  </>
                ) : (
                  <>
                    <label className="input-label">Komisi Toko Penerima (%)<input className="input-field" inputMode="numeric" value={form.komisi_persen} onChange={(e) => setForm((p) => ({ ...p, komisi_persen: e.target.value.replace(/\D/g, "") }))} placeholder="20" /></label>
                    <label className="input-label">Jadwal Evaluasi / Penagihan<DateField value={form.jadwal_evaluasi} onChange={(v) => setForm((p) => ({ ...p, jadwal_evaluasi: v }))} /></label>
                  </>
                )}
              </div>
              <label className="input-label">Catatan<input className="input-field" value={form.catatan} onChange={(e) => setForm((p) => ({ ...p, catatan: e.target.value }))} /></label>
              <div className="sales-form__actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button><button type="submit" className="btn-primary">Simpan</button></div>
            </form>
          </div>
        </div>
      )}

      {detailId && (
        <div className="modal-overlay" onClick={() => { setDetailId(null); setDetailItems([]); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="sales-modal__header">
              <div><h2 className="text-headline-md">{detailId.nomor}</h2><p className="text-body-md">Detail barang konsinyasi {activeTab === "masuk" ? "masuk" : "keluar"}</p></div>
              <button type="button" className="btn-icon" aria-label="Tutup" onClick={() => { setDetailId(null); setDetailItems([]); }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", padding: "0 1.25rem 1rem" }}>
              <div><span className="text-label-md">Tanggal</span><p>{formatDateId(detailId.tanggal)}</p></div>
              <div><span className="text-label-md">Status</span><p><StatusBadge status={detailId.status === "selesai" ? "success" : detailId.status === "retur" ? "warning" : "info"} label={detailId.status} /></p></div>
              <div><span className="text-label-md">{activeTab === "masuk" ? "Supplier" : "Penerima"}</span><p>{activeTab === "masuk" ? getSupplierName(detailId.supplier_id) : detailId.penerima_nama}</p></div>
              <div><span className="text-label-md">Komisi</span><p>{detailId.komisi_persen || "-"}%</p></div>
            </div>
            {detailItems.length > 0 && (
              <div className="sales-table-wrap" style={{ margin: "0 1.25rem 1rem" }}>
                <table className="sales-table"><thead><tr><th>Kode</th><th>Nama Barang</th><th>Jml</th><th>Harga</th><th>Kondisi</th></tr></thead><tbody>
                  {detailItems.map((di) => <tr key={di.id}><td>{di.kode_barang || "-"}</td><td>{di.nama_produk}</td><td>{di.qty}</td><td>{rupiah(di.harga_kesepakatan)}</td><td>{di.kondisi || "-"}</td></tr>)}
                </tbody></table>
              </div>
            )}
            <div style={{ padding: "0 1.25rem 1rem", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => { setDetailId(null); setDetailItems([]); }}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
