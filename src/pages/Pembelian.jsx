// ============================================================
// Pembelian.jsx — Restock per produk via popup (PageKit)
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import DateField from "../components/DateField";
import SearchSelect from "../components/SearchSelect";
import RupiahInput from "../components/RupiahInput";
import {
  PageShell,
  DataPanel,
  FormModal,
  InfoNote,
  rupiah,
} from "../components/PageKit";
import { VirtualDataTable } from "../components/VirtualDataTable";

/**
 * Restock per produk: klik produk → popup qty, harga beli, supplier → simpan.
 */
export default function Pembelian() {
  const { addToast } = useToast();
  const [produk, setProduk] = useState([]);
  const [produkHasMore, setProdukHasMore] = useState(true);
  const [produkLoading, setProdukLoading] = useState(false);
  const [supplier, setSupplier] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem("pembelianView") || "card");

  // Popup restock per produk
  const [restockProduct, setRestockProduct] = useState(null);
  const [form, setForm] = useState({
    qty: "1",
    harga_beli: "",
    supplier_id: "",
    dp_nominal: "",
    jatuh_tempo: "",
  });

  const log = (msg) => {
    try { invoke("write_log", { msg: `RESTOCK: ${msg}` }).catch(() => {}); } catch {}
  };

  const produkRequestRef = useRef(0);
  const load = async (append = false) => {
    const requestId = ++produkRequestRef.current;
    if (!append) setLoading(true);
    else setProdukLoading(true);
    try {
      const [dataProduk, dataSupplier] = await Promise.all([
        invoke("list_produk", { onlyActive: true, limit: 50, offset: append ? produk.length : 0 }),
        append ? Promise.resolve(null) : invoke("list_supplier"),
      ]);
      if (requestId !== produkRequestRef.current) return;
      setProduk((current) => append ? [...current, ...dataProduk] : dataProduk);
      setProdukHasMore(dataProduk.length === 50);
      if (dataSupplier) setSupplier(dataSupplier);
    } catch (e) {
      { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); };
    } finally {
      setLoading(false);
      setProdukLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const shown = useMemo(
    () => produk.filter((p) => `${p.nama} ${p.sku || ""}`.toLowerCase().includes(search.toLowerCase())),
    [produk, search],
  );

  const openRestock = (p) => {
    setRestockProduct(p);
    setForm({
      qty: "1",
      harga_beli: String(p.harga_beli || 0),
      supplier_id: p.supplier_id ? String(p.supplier_id) : "",
      dp_nominal: "",
      jatuh_tempo: "",
    });
  };

  const closeRestock = () => {
    setRestockProduct(null);
    setForm({ qty: "1", harga_beli: "", supplier_id: "", dp_nominal: "", jatuh_tempo: "" });
  };

  const qtyNum = Math.max(0, Number(form.qty || 0));
  const hargaNum = Math.max(0, Number(form.harga_beli || 0));
  const subtotal = qtyNum * hargaNum;
  const dpValue = Math.min(subtotal, Number(form.dp_nominal || 0));
  const sisaHutang = Math.max(0, subtotal - dpValue);
  const hargaBerubah = restockProduct && hargaNum !== Number(restockProduct.harga_beli || 0);

  const submitRestock = async (e) => {
    e.preventDefault();
    if (!restockProduct) return;
    if (qtyNum <= 0) return addToast("Jumlah harus lebih dari 0", "error");
    if (hargaNum < 0) return addToast("Harga beli tidak valid", "error");

    setSubmitting(true);
    log(`restock produk=${restockProduct.id}; qty=${qtyNum}; harga=${hargaNum}`);
    try {
      const res = await invoke("buat_transaksi_pembelian", {
        items: [{
          produk_id: restockProduct.id,
          qty: qtyNum,
          harga_beli: hargaNum,
        }],
        catatan: null,
        supplierId: form.supplier_id ? Number(form.supplier_id) : null,
        dpNominal: form.dp_nominal === "" ? null : dpValue,
        jatuhTempo: form.supplier_id && sisaHutang > 0 && form.jatuh_tempo ? form.jatuh_tempo : null,
      });
      addToast(`Restock ${restockProduct.nama} berhasil · ${rupiah(res.total)}`, "success");
      closeRestock();
      await load();
    } catch (err) {
      addToast(`Gagal restock: ${err}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = () => {
    const next = view === "card" ? "list" : "card";
    setView(next);
    localStorage.setItem("pembelianView", next);
  };

  const columns = [
    {
      key: "nama",
      label: "Produk",
      render: (p) => (
        <div>
          <b>{p.nama}</b>
          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
            {p.sku || "—"} · Stok {p.stok} {p.satuan || ""}
          </div>
        </div>
      ),
    },
    {
      key: "harga",
      label: "Harga Beli",
      align: "right",
      render: (p) => rupiah(p.harga_beli),
    },
    {
      key: "aksi",
      label: "",
      align: "right",
      render: (p) => (
        <button type="button" className="btn-primary" style={{ fontSize: 13, padding: "6px 12px" }} onClick={() => openRestock(p)}>
          Restock
        </button>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="PEMBELIAN"
      title="Restock Barang"
      description="Klik produk → isi qty, harga, dan supplier di popup. Restock langsung per item."
      actions={
        <button type="button" className="btn-secondary" onClick={toggle}>
          <span className="material-symbols-outlined">{view === "card" ? "view_list" : "grid_view"}</span>
          {view === "card" ? "List" : "Kartu"}
        </button>
      }
      stats={[
        { label: "Produk Aktif", value: produk.length, icon: "inventory_2" },
        { label: "Supplier", value: supplier.length, icon: "store" },
      ]}
    >
      <InfoNote icon="local_shipping">
        Restock per produk. Ubah harga beli di popup bila harga supplier berubah — master produk ikut di-update.
      </InfoNote>

      <DataPanel
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Cari produk / SKU..."
        onRefresh={load}
        loading={loading}
        isEmpty={shown.length === 0}
        emptyIcon="inventory_2"
        emptyTitle="Produk tidak ditemukan"
        emptyHint="Ubah kata kunci atau tambah produk di menu Katalog."
      >
        {view === "list" ? (
          <VirtualDataTable
            columns={columns}
            rows={shown}
            rowKey={(p) => p.id}
            loading={loading || produkLoading}
            hasMore={produkHasMore}
            onEndReached={() => { if (!loading && !produkLoading && produkHasMore) load(true); }}
            emptyMessage="Produk tidak ditemukan"
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, padding: 16 }}>
            {shown.map((p) => (
              <button
                key={p.id}
                type="button"
                className="card"
                onClick={() => openRestock(p)}
                style={{
                  textAlign: "left",
                  padding: 14,
                  cursor: "pointer",
                  border: "1px solid var(--color-surface-border)",
                  borderRadius: 12,
                  minHeight: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.35 }}>{p.nama}</div>
                <div className="text-label-md" style={{ color: "var(--color-text-secondary)", overflowWrap: "anywhere" }}>{p.sku || "—"}</div>
                <div style={{ fontWeight: 700, color: "var(--color-primary)" }}>{rupiah(p.harga_beli)}</div>
                <div className="text-label-md">Stok {p.stok} {p.satuan || ""}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-primary)" }}>Restock →</div>
              </button>
            ))}
          </div>
        )}
      </DataPanel>

      {restockProduct && (
        <FormModal
          title="Restock Produk"
          description={`${restockProduct.nama}${restockProduct.sku ? ` · ${restockProduct.sku}` : ""} · stok ${restockProduct.stok}`}
          onClose={closeRestock}
          onSubmit={submitRestock}
          submitLabel="Simpan Restock"
          submitting={submitting}
        >
          <div>
            <label className="input-label">Jumlah *</label>
            <input
              className="input-field"
              inputMode="numeric"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value.replace(/\D/g, "") }))}
              autoFocus
            />
          </div>
          <div>
            <label className="input-label">Harga Beli *</label>
            <RupiahInput
              value={form.harga_beli}
              onChange={(val) => setForm((f) => ({ ...f, harga_beli: val }))}
              required
            />
            {hargaBerubah && (
              <p className="text-label-md" style={{ color: "var(--color-warning-amber)", marginTop: 4 }}>
                Harga berubah dari {rupiah(restockProduct.harga_beli)} → master produk akan di-update.
              </p>
            )}
          </div>
          <div>
            <label className="input-label">Supplier</label>
            <SearchSelect
              className="input-field"
              value={form.supplier_id}
              onChange={(value) => setForm((f) => ({ ...f, supplier_id: value }))}
              placeholder="— Umum (tanpa supplier) —"
              options={[{ value: "", label: "— Umum (tanpa supplier) —" }, ...supplier.map((s) => ({ value: String(s.id), label: s.nama }))]}
            />
          </div>
          <div>
            <label className="input-label">Uang Muka / DP (opsional)</label>
            <RupiahInput
              value={form.dp_nominal}
              onChange={(val) => setForm((f) => ({ ...f, dp_nominal: val }))}
            />
          </div>
          {form.supplier_id && sisaHutang > 0 && (
            <div>
              <label className="input-label">Jatuh Tempo Hutang</label>
              <DateField value={form.jatuh_tempo} onChange={(v) => setForm((p) => ({ ...p, jatuh_tempo: v }))} />
            </div>
          )}
          <div style={{ padding: 12, borderRadius: 10, background: "var(--color-surface-container)", display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <b>{rupiah(subtotal)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-income-green)" }}>
              <span>DP</span>
              <b>{rupiah(dpValue)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: sisaHutang > 0 ? "var(--color-warning-amber)" : "var(--color-income-green)" }}>
              <span>Sisa hutang</span>
              <b>{rupiah(sisaHutang)}</b>
            </div>
          </div>
        </FormModal>
      )}
    </PageShell>
  );
}
