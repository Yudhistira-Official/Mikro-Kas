// ============================================================
// Riwayat.jsx — Riwayat penjualan + editor ≤2 hari (PageKit)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import { formatDateTimeId } from "../utils/dateFormat";
import { getPrinterPath } from "../utils/printerSettings";
import {
  PageShell,
  DataPanel,
  DataTable,
  InfoNote,
  StatusBadge,
  useSearchFilter,
  rupiah,
} from "../components/PageKit";

const today = () => new Date().toISOString().slice(0, 10);
const isEditable = (date) =>
  Date.now() - new Date(`${String(date).replace(" ", "T")}Z`).getTime() <= 48 * 60 * 60 * 1000;

/**
 * Riwayat penjualan: filter tanggal, buka detail, edit stok atomik via Rust.
 */
export default function Riwayat() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [dari, setDari] = useState(today);
  const [sampai, setSampai] = useState(today);
  const [list, setList] = useState([]);
  const [produk, setProduk] = useState([]);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [toko, setToko] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sales, products, tokoData] = await Promise.all([
        invoke("list_transaksi", {
          tipe: "penjualan",
          dariTanggal: dari,
          sampaiTanggal: sampai,
          limit: 100,
        }),
        invoke("list_produk", { onlyActive: true }),
        invoke("get_toko").catch(() => null),
      ]);
      setList(sales);
      setProduk(products);
      setToko(tokoData);
    } catch (e) {
      addToast(`Gagal memuat riwayat: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, dari, sampai]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes the editor only when stock changes are not being saved.
  useEffect(() => {
    /** Handles Escape for the transaction editor without interrupting save/delete. */
    const handleEscape = (event) => { if (event.key === "Escape" && detail && !saving) setDetail(null); };
    if (detail) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [detail, saving]);

  const { query: listQuery, setQuery: setListQuery, filtered } = useSearchFilter(
    list,
    (t) => `${t.no_nota || ""} ${t.id} ${t.metode_bayar || ""} ${t.catatan || ""}`
  );

  const openEditor = async (id) => {
    try {
      const data = await invoke("get_transaksi_detail", { id });
      setDetail(data);
      setQuery("");
    } catch (e) {
      addToast(`Gagal membuka transaksi: ${e}`, "error");
    }
  };

  const changeQty = (produkId, delta) =>
    setDetail((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.produk_id === produkId ? { ...item, qty: Math.max(1, item.qty + delta) } : item
      ),
    }));

  const removeItem = (produkId) =>
    setDetail((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.produk_id !== produkId),
    }));

  const addProduct = (p) => {
    setDetail((prev) => {
      const current = prev.items.find((item) => item.produk_id === p.id);
      const items = current
        ? prev.items.map((item) =>
            item.produk_id === p.id ? { ...item, qty: item.qty + 1 } : item
          )
        : [
            ...prev.items,
            {
              id: `new-${p.id}`,
              produk_id: p.id,
              produk_nama: p.nama,
              qty: 1,
              harga_satuan: p.harga_jual,
              subtotal: p.harga_jual,
            },
          ];
      return { ...prev, items };
    });
    setQuery("");
  };

  const saveEdit = async () => {
    if (!detail?.items.length) {
      addToast("Tambahkan produk atau hapus seluruh transaksi", "error");
      return;
    }
    setSaving(true);
    try {
      await invoke("edit_transaksi_penjualan", {
        id: detail.header.id,
        input: {
          items: detail.items.map((item) => ({ produkId: item.produk_id, qty: item.qty })),
          metodeBayar: detail.header.metode_bayar,
          catatan: detail.header.catatan,
        },
      });
      addToast("Penjualan dan stok berhasil diperbarui", "success");
      setDetail(null);
      await load();
    } catch (e) {
      addToast(`Gagal menyimpan: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteSale = async () => {
    if (!detail || !window.confirm("Hapus seluruh transaksi ini? Stok akan dikembalikan.")) return;
    setSaving(true);
    try {
      await invoke("delete_transaksi_penjualan", { id: detail.header.id });
      addToast("Transaksi dihapus dan stok dikembalikan", "success");
      setDetail(null);
      await load();
    } catch (e) {
      addToast(`Gagal menghapus: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const reorderSale = () => {
    if (!detail?.items?.length) return;
    const reorderItems = detail.items.map((item) => ({
      produk_id: item.produk_id,
      qty: item.qty,
    }));
    navigate("/transaksi", { state: { reorderItems } });
  };

  const estimatedTotal =
    detail?.items.reduce((sum, item) => sum + item.qty * item.harga_satuan, 0) || 0;

  const printReceipt = async () => {
    const path = getPrinterPath() || null;
    try {
      const msg = await invoke("print_struk", { transaksiId: detail.header.id, printerPath: path });
      addToast(msg || "Struk dicetak", "success");
    } catch (err) {
      addToast(`Gagal cetak: ${err}`, "error");
    }
  };

  const matchingProduk = produk
    .filter(
      (p) =>
        query.trim() &&
        p.nama.toLowerCase().includes(query.toLowerCase()) &&
        !detail?.items.some((item) => item.produk_id === p.id)
    )
    .slice(0, 5);

  const getModalTrans = (items) =>
    items.reduce((sum, item) => {
      const prod = produk.find((p) => p.id === item.produk_id);
      const hBeli = prod ? prod.harga_beli : item.harga_satuan * 0.7;
      return sum + hBeli * item.qty;
    }, 0);

  const currentModal = detail ? getModalTrans(detail.items) : 0;
  const totalNilai = filtered.reduce((s, t) => s + Number(t.total || 0), 0);

  const columns = [
    {
      key: "nota",
      label: "Nota",
      render: (t) => <strong>#{t.no_nota || t.id}</strong>,
    },
    {
      key: "tanggal",
      label: "Tanggal",
      render: (t) => formatDateTimeId(t.tanggal),
    },
    {
      key: "metode",
      label: "Metode",
      render: (t) => <StatusBadge label={t.metode_bayar || "—"} tone="success" />,
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      render: (t) => (
        <strong style={{ color: "var(--color-income-green)" }}>+{rupiah(t.total)}</strong>
      ),
    },
    {
      key: "edit",
      label: "Status",
      render: (t) =>
        isEditable(t.created_at) ? (
          <StatusBadge label="Bisa diedit" tone="primary" />
        ) : (
          <StatusBadge label="Terkunci" tone="neutral" />
        ),
    },
    {
      key: "aksi",
      label: "Aksi",
      render: (t) => (
        <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => openEditor(t.id)}>
          Detail
        </button>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="PENJUALAN"
      title="Riwayat Penjualan"
      description="Lihat dan edit penjualan maksimal 2 hari. Perubahan stok dihitung ulang atomik di backend."
      stats={[
        { label: "Transaksi", value: filtered.length, icon: "receipt_long" },
        { label: "Total Omzet", value: rupiah(totalNilai), icon: "payments", tone: "var(--color-income-green)" },
        { label: "Periode", value: `${dari} → ${sampai}`, icon: "calendar_month" },
      ]}
    >
      <InfoNote icon="edit_note">
        Transaksi &gt; 2 hari hanya bisa dilihat. Edit / hapus menghitung ulang stok otomatis.
      </InfoNote>

      <section className="sales-panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="input-label">Dari</label>
            <DateField value={dari} onChange={setDari} />
          </div>
          <div>
            <label className="input-label">Sampai</label>
            <DateField value={sampai} onChange={setSampai} />
          </div>
        </div>
      </section>

      <DataPanel
        searchValue={listQuery}
        onSearch={setListQuery}
        searchPlaceholder="Cari nota, metode, atau ID..."
        onRefresh={load}
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon="receipt_long"
        emptyTitle="Tidak ada penjualan di rentang ini"
        emptyHint="Ubah tanggal atau buat penjualan di Kasir."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(t) => t.id} />
      </DataPanel>

      {detail && (
        <div className="modal-overlay" onClick={() => !saving && setDetail(null)}>
          <div
            className="modal-content sales-form-modal"
            style={{ maxHeight: "90vh", overflowY: "auto", paddingBottom: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sales-modal__header">
              <div>
                <h2 className="text-headline-md">
                  Penjualan #{detail.header.no_nota || detail.header.id}
                </h2>
                <p className="text-body-md">{formatDateTimeId(detail.header.tanggal)}</p>
              </div>
              <button type="button" className="btn-icon" disabled={saving} onClick={() => setDetail(null)} aria-label="Tutup">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <div className="sales-stat-card" style={{ padding: "0.6rem" }}>
                <div>
                  <span>Modal (estimasi)</span>
                  <strong>{rupiah(currentModal)}</strong>
                </div>
              </div>
              <div className="sales-stat-card" style={{ padding: "0.6rem" }}>
                <div>
                  <span>Estimasi Jual</span>
                  <strong>{rupiah(estimatedTotal)}</strong>
                </div>
              </div>
            </div>

            {!isEditable(detail.header.created_at) ? (
              <>
                <p className="text-body-md" style={{ color: "var(--color-expense-red)", marginBottom: "0.75rem" }}>
                  Transaksi lebih dari 2 hari hanya dapat dilihat.
                </p>
                {detail.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "0.6rem 0",
                      borderBottom: "1px solid var(--color-surface-border)",
                    }}
                  >
                    <span>
                      {item.produk_nama} × {item.qty}
                    </span>
                    <span>{rupiah(item.qty * item.harga_satuan)}</span>
                  </div>
                ))}
                <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: "1rem" }} onClick={printReceipt}>
                  Print Struk
                </button>
                <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: "0.5rem" }} onClick={reorderSale}>
                  Pesan Lagi ke Kasir
                </button>
              </>
            ) : (
              <>
                <p className="text-label-md" style={{ color: "var(--color-warning-amber)", margin: "0 0 0.75rem" }}>
                  Perubahan akan menghitung ulang stok secara otomatis.
                </p>
                {detail.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                      padding: "0.6rem 0",
                      borderBottom: "1px solid var(--color-surface-border)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p className="text-body-md">{item.produk_nama}</p>
                      <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                        {rupiah(item.harga_satuan)} / unit
                      </p>
                    </div>
                    <button type="button" className="btn-icon" onClick={() => changeQty(item.produk_id, -1)} aria-label="Kurangi">
                      <span className="material-symbols-outlined">remove</span>
                    </button>
                    <b>{item.qty}</b>
                    <button type="button" className="btn-icon" onClick={() => changeQty(item.produk_id, 1)} aria-label="Tambah">
                      <span className="material-symbols-outlined">add</span>
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => removeItem(item.produk_id)}
                      aria-label="Hapus"
                      style={{ color: "var(--color-expense-red)" }}
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                ))}
                <div style={{ position: "relative", marginTop: "0.75rem" }}>
                  <label className="input-label">Tambah Produk</label>
                  <input
                    className="input-field"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari produk..."
                  />
                  {matchingProduk.length > 0 && (
                    <div className="card" style={{ position: "absolute", zIndex: 2, left: 0, right: 0, padding: 0, overflow: "hidden" }}>
                      {matchingProduk.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProduct(p)}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "0.7rem",
                            border: 0,
                            borderBottom: "1px solid var(--color-surface-border)",
                            background: "var(--color-surface)",
                          }}
                        >
                          <span>{p.nama}</span>
                          <span>{rupiah(p.harga_jual)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, margin: "1rem 0" }}>
                  <span>Estimasi Total</span>
                  <span>{rupiah(estimatedTotal)}</span>
                </div>
                <button type="button" className="btn-secondary" disabled={saving} onClick={printReceipt} style={{ width: "100%", marginBottom: "0.5rem" }}>
                  Print Struk
                </button>
                <button type="button" className="btn-secondary" disabled={saving} onClick={reorderSale} style={{ width: "100%", marginBottom: "0.5rem" }}>
                  Pesan Lagi ke Kasir
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={deleteSale}
                  style={{
                    width: "100%",
                    color: "var(--color-expense-red)",
                    borderColor: "var(--color-expense-red)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Hapus Seluruh Transaksi
                </button>
                <button type="button" className="btn-primary" disabled={saving} onClick={saveEdit} style={{ width: "100%" }}>
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
