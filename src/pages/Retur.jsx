// ============================================================
// Retur.jsx — Retur penjualan + riwayat retur editable (PageKit).
//
// Commands:
//   list_transaksi, list_retur, get_transaksi_detail, get_retur_detail,
//   retur_penjualan, update_retur_penjualan
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { formatDateTimeId } from "../utils/dateFormat";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge,
  useSearchFilter, rupiah,
} from "../components/PageKit";

const today = () => new Date().toISOString().slice(0, 10);

const canEdit = (createdAt) => {
  const then = new Date(createdAt.replace(" ", "T"));
  return (Date.now() - then.getTime()) < 86400000;
};

/**
 * Halaman retur penjualan: buat dari penjualan hari ini atau edit riwayat.
 */
export default function Retur() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("baru");
  const [list, setList] = useState([]);
  const [riwayat, setRiwayat] = useState([]);
  const [detail, setDetail] = useState(null);
  const [editingReturId, setEditingReturId] = useState(null);
  const [returItems, setReturItems] = useState([]);
  const [alasan, setAlasan] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      invoke("list_transaksi", { tipe: "penjualan", dariTanggal: today(), sampaiTanggal: today(), limit: 50 }),
      invoke("list_retur"),
    ])
      .then(([sales, returns]) => {
        setList(sales);
        setRiwayat(returns);
      })
      .catch((e) => { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); })
      .finally(() => setLoading(false));
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const salesFilter = useSearchFilter(list, (t) => `${t.id} ${t.metode_bayar || ""} ${t.tanggal || ""}`);
  const riwayatFilter = useSearchFilter(riwayat, (r) => `${r.id} ${r.transaksi_id} ${r.alasan || ""}`);

  /** Buka modal retur baru dari detail transaksi penjualan. */
  const openDetail = async (id) => {
    try {
      const data = await invoke("get_transaksi_detail", { id });
      setEditingReturId(null);
      setDetail(data);
      setReturItems(data.items.map((i) => ({
        produk_id: i.produk_id, qty: 0, max: i.qty, nama: i.produk_nama, harga: i.harga_satuan,
      })));
      setAlasan("");
    } catch (e) { { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }; }
  };

  /** Buka modal edit retur: gabung qty tersisa transaksi + qty retur saat ini. */
  const openEditRetur = async (id) => {
    try {
      const retur = await invoke("get_retur_detail", { id });
      const transaksi = await invoke("get_transaksi_detail", { id: retur.header.transaksi_id });
      const qtyTersisa = new Map(transaksi.items.map((i) => [i.produk_id, i.qty]));
      setEditingReturId(id);
      setDetail({ header: { id: retur.header.transaksi_id } });
      setReturItems(retur.items.map((i) => ({
        produk_id: i.produk_id,
        qty: i.qty,
        max: (qtyTersisa.get(i.produk_id) || 0) + i.qty,
        nama: i.produk_nama,
        harga: i.harga_satuan,
      })));
      setAlasan(retur.header.alasan || "");
    } catch (e) { { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }; }
  };

  const closeModal = () => {
    if (submitting) return;
    setDetail(null);
    setEditingReturId(null);
    setReturItems([]);
    setAlasan("");
  };

  /** Ubah qty item retur dalam rentang 0..max. */
  const setQty = (produk_id, delta) => {
    setReturItems((prev) => prev.map((i) =>
      i.produk_id === produk_id ? { ...i, qty: Math.max(0, Math.min(i.max, i.qty + delta)) } : i
    ));
  };

  /** Submit create/update retur lewat command Rust atomic. */
  const submit = async (e) => {
    e.preventDefault();
    const items = returItems.filter((i) => i.qty > 0).map((i) => ({ produk_id: i.produk_id, qty: i.qty }));
    if (!items.length) return addToast("Pilih minimal satu item retur", "error");
    setSubmitting(true);
    try {
      const payload = { items, alasan: alasan.trim() || null };
      const res = editingReturId
        ? await invoke("update_retur_penjualan", { returId: editingReturId, ...payload })
        : await invoke("retur_penjualan", { transaksiId: detail.header.id, ...payload });
      addToast(`${editingReturId ? "Retur diperbarui" : "Retur berhasil"}: ${rupiah(res.total)}`, "success");
      closeModal();
      load();
    } catch (err) { addToast(String(err), "error"); }
    finally { setSubmitting(false); }
  };

  const totalRetur = returItems.reduce((sum, i) => sum + i.qty * i.harga, 0);
  const totalRefund = riwayat.reduce((s, r) => s + Number(r.total_refund || 0), 0);

  const salesColumns = [
    { key: "id", label: "No", render: (t) => <b>#{t.id}</b> },
    { key: "tanggal", label: "Waktu", render: (t) => formatDateTimeId(t.tanggal) },
    { key: "metode", label: "Bayar", render: (t) => t.metode_bayar || "-" },
    { key: "total", label: "Total", align: "right", render: (t) => <b style={{ color: "var(--color-income-green)" }}>{rupiah(t.total)}</b> },
    {
      key: "aksi", label: "", align: "right",
      render: (t) => (
        <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => openDetail(t.id)}>
          Retur
        </button>
      ),
    },
  ];

  const riwayatColumns = [
    { key: "id", label: "Retur", render: (r) => <b>#{r.id}</b> },
    { key: "trx", label: "Penjualan", render: (r) => `#${r.transaksi_id}` },
    { key: "waktu", label: "Waktu", render: (r) => formatDateTimeId(r.created_at) },
    { key: "alasan", label: "Alasan", render: (r) => r.alasan || "-" },
    { key: "refund", label: "Refund", align: "right", render: (r) => <b style={{ color: "var(--color-expense-red)" }}>{rupiah(r.total_refund)}</b> },
    {
      key: "aksi", label: "", align: "right",
      render: (r) => canEdit(r.created_at) ? (
        <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => openEditRetur(r.id)}>
          Edit
        </button>
      ) : <StatusBadge label="Terkunci > 1 hari" tone="neutral" />,
    },
  ];

  return (
    <PageShell
      eyebrow="STOK & RETUR"
      title="Retur Penjualan"
      description="Pilih penjualan hari ini untuk retur, atau edit riwayat retur. Stok dan kas ikut menyesuaikan otomatis."
      actions={
        <button type="button" className="btn-secondary" onClick={load}>
          <span className="material-symbols-outlined">refresh</span> Muat ulang
        </button>
      }
      stats={[
        { label: "Penjualan hari ini", value: list.length, icon: "receipt_long" },
        { label: "Riwayat retur", value: riwayat.length, icon: "assignment_return", tone: "#B91C1C" },
        { label: "Total refund", value: rupiah(totalRefund), icon: "payments", tone: "#B91C1C" },
      ]}
    >
      <InfoNote>
        Retur mengembalikan stok dan mencatat pengeluaran kas. Edit hanya dari halaman ini — tidak bisa dihapus dari Manajemen Keuangan.
      </InfoNote>

      <div className="filter-row" style={{ marginBottom: 12 }}>
        <button type="button" className={`filter-chip${tab === "baru" ? " active" : ""}`} onClick={() => setTab("baru")}>Retur Baru</button>
        <button type="button" className={`filter-chip${tab === "riwayat" ? " active" : ""}`} onClick={() => setTab("riwayat")}>Riwayat Retur</button>
      </div>

      {tab === "baru" ? (
        <DataPanel
          searchValue={salesFilter.query}
          onSearch={salesFilter.setQuery}
          searchPlaceholder="Cari nomor / metode bayar..."
          onRefresh={load}
          loading={loading}
          isEmpty={!loading && salesFilter.filtered.length === 0}
          emptyIcon="assignment_return"
          emptyTitle="Belum ada penjualan hari ini"
          emptyHint="Selesaikan transaksi penjualan dulu, lalu buat retur di sini."
        >
          <DataTable columns={salesColumns} rows={salesFilter.filtered} rowKey={(t) => t.id} />
        </DataPanel>
      ) : (
        <DataPanel
          searchValue={riwayatFilter.query}
          onSearch={riwayatFilter.setQuery}
          searchPlaceholder="Cari retur / alasan..."
          onRefresh={load}
          loading={loading}
          isEmpty={!loading && riwayatFilter.filtered.length === 0}
          emptyIcon="history"
          emptyTitle="Belum ada riwayat retur"
          emptyHint="Retur yang sudah diproses akan muncul di sini."
        >
          <DataTable columns={riwayatColumns} rows={riwayatFilter.filtered} rowKey={(r) => r.id} />
        </DataPanel>
      )}

      {detail && (
        <FormModal
          title={editingReturId ? `Edit Retur #${editingReturId}` : `Retur Penjualan #${detail.header.id}`}
          description="Atur qty per item (maks = qty penjualan tersisa). Total refund dihitung otomatis."
          onClose={closeModal}
          onSubmit={submit}
          submitLabel={editingReturId ? "Simpan Perubahan" : "Proses Retur"}
          submitting={submitting}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {returItems.map((i) => (
              <div key={i.produk_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-surface-border)" }}>
                <div>
                  <p className="text-body-md" style={{ fontWeight: 600 }}>{i.nama}</p>
                  <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Maks {i.max} · {rupiah(i.harga)}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="btn-icon" onClick={() => setQty(i.produk_id, -1)}>−</button>
                  <b>{i.qty}</b>
                  <button type="button" className="btn-icon" onClick={() => setQty(i.produk_id, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
          <label className="input-label">Alasan Retur</label>
          <input className="input-field" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: barang rusak" />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 4 }}>
            <span>Total Refund</span>
            <span>{rupiah(totalRetur)}</span>
          </div>
          {totalRetur <= 0 && <StatusBadge label="Pilih qty item dulu" tone="warning" />}
        </FormModal>
      )}
    </PageShell>
  );
}
