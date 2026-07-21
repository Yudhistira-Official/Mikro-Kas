// ============================================================
// StockOpname.jsx — Stock opname / audit stok massal untuk seluruh produk.
//
// Flow:
//   1. Load semua produk aktif.
//   2. User klik tombol "Fisik" → muncul popup modal untuk input stok fisik.
//   3. Setelah input, simpan perubahan yang ada selisihnya.
// ============================================================
import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

export default function StockOpname() {
  const { addToast } = useToast();
  const [produkList, setProdukList] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [modalItem, setModalItem] = useState(null);   // popup untuk edit stok fisik
  const [modalValue, setModalValue] = useState("");
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke("list_produk", { onlyActive: true });
      setProdukList(data);
    } catch (e) { addToast(`Gagal memuat produk: ${e}`, "error"); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = produkList.filter((p) =>
    !query.trim() || p.nama.toLowerCase().includes(query.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(query.toLowerCase())
  );

  // Hitung ringkasan dari SEMUA produk, bukan hanya filtered
  const allSelisihList = produkList
    .filter((p) => counts[p.id] !== undefined && counts[p.id] !== "")
    .map((p) => {
      const fisik = parseInt(counts[p.id], 10);
      return { id: p.id, nama: p.nama, sistem: p.stok, fisik, selisih: Number.isFinite(fisik) ? fisik - p.stok : 0 };
    });
  const selisihMasuk = allSelisihList.filter((x) => x.selisih > 0).reduce((s, x) => s + x.selisih, 0);
  const selisihKeluar = allSelisihList.filter((x) => x.selisih < 0).reduce((s, x) => s + Math.abs(x.selisih), 0);
  const berubah = allSelisihList.filter((x) => x.selisih !== 0).length;

  // Open modal
  const openModal = (p) => {
    const current = counts[p.id] !== undefined ? counts[p.id] : "";
    setModalItem(p);
    setModalValue(current);
    setTimeout(() => {
      if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
    }, 100);
  };

  const saveModal = () => {
    if (modalValue === "") {
      const newCounts = { ...counts };
      delete newCounts[modalItem.id];
      setCounts(newCounts);
    } else {
      setCounts((prev) => ({ ...prev, [modalItem.id]: modalValue }));
    }
    setModalItem(null);
  };

  const log = useCallback((msg) => {
    try { invoke("write_log", { msg: `OPNAME: ${msg}` }).catch(() => {}); } catch {}
  }, []);

  const simpanOpname = async () => {
    const items = allSelisihList.filter((x) => x.selisih !== 0);
    if (items.length === 0) return addToast("Tidak ada perubahan stok untuk disimpan", "info");
    setSaving(true);
    try {
      let sukses = 0, gagal = 0;
      for (const item of items) {
        try {
          const fisik = Number.isFinite(item.fisik) ? item.fisik : 0;
          if (fisik < 0) throw new Error("Stok baru tidak boleh negatif");
          await invoke("adjust_stock", { input: { produkId: item.id, stokBaru: fisik, alasan: "Stock opname" } });
          sukses++;
          log(`sukses: ${item.nama} → ${fisik}`);
        } catch (e) {
          gagal++;
          log(`gagal ${item.nama}: ${String(e?.message || e).slice(0, 100)}`);
        }
      }
      setResult({ sukses, gagal, total: items.length });
      addToast(`Stock opname selesai: ${sukses} disimpan, ${gagal} gagal`, sukses > 0 ? "success" : "error");
      const updated = await invoke("list_produk", { onlyActive: true });
      setProdukList(updated);
      setCounts({});
    } catch (e) {
      addToast(`Gagal menjalankan opname: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const clearResult = () => setResult(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <span className="text-headline-md">Stock Opname</span>

      {/* Summary cards — Total Produk dan Berubah berdampingan */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <div className="card" style={{ flex: 1, textAlign: "center", padding: "1rem", background: "var(--color-primary-container)", borderRadius: "12px" }}>
          <p className="text-label-md" style={{ color: "var(--color-on-primary)", opacity: 0.85 }}>Total Produk</p>
          <p className="text-headline-md" style={{ color: "var(--color-on-primary)", marginTop: "4px" }}>{filtered.length}</p>
          <p className="text-label-md" style={{ color: "var(--color-on-primary)", opacity: 0.6, fontSize: "11px" }}>yang diperiksa</p>
        </div>
        <div className="card" style={{ flex: 1, textAlign: "center", padding: "1rem", background: "var(--color-warning-amber)", borderRadius: "12px", color: "white" }}>
          <p className="text-label-md" style={{ opacity: 0.85 }}>Berubah</p>
          <p className="text-headline-md" style={{ marginTop: "4px" }}>{berubah}</p>
          <p className="text-label-md" style={{ opacity: 0.6, fontSize: "11px" }}>produk disesuaikan</p>
        </div>
      </div>

      {/* Ringkasan selisih */}
      {(selisihMasuk > 0 || selisihKeluar > 0) && (
        <div className="card" style={{ display: "flex", padding: "0.75rem", gap: "0.5rem", background: "var(--color-surface-container-low)" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <p className="text-label-md" style={{ fontSize: "10px", color: "var(--color-success-green)" }}>Stok Masuk</p>
            <p className="text-body-md" style={{ fontWeight: 700, color: "var(--color-success-green)" }}>+{selisihMasuk}</p>
          </div>
          <div style={{ width: "1px", background: "var(--color-surface-border)" }} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <p className="text-label-md" style={{ fontSize: "10px", color: "var(--color-expense-red)" }}>Stok Keluar</p>
            <p className="text-body-md" style={{ fontWeight: 700, color: "var(--color-expense-red)" }}>-{selisihKeluar}</p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <input className="input-field" placeholder="Cari produk atau SKU..." value={query} onChange={(e) => setQuery(e.target.value)} />

      {/* Result summary after save */}
      {result && (
        <div className="card" style={{ padding: "1rem", background: "var(--color-surface-container-low)", border: "1px solid var(--color-success-green)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p className="text-headline-sm" style={{ color: "var(--color-success-green)" }}>
              Opname selesai: {result.sukses} disimpan, {result.gagal} gagal
            </p>
            <button type="button" className="btn-icon" onClick={clearResult}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>close</span>
            </button>
          </div>
        </div>
      )}

      {/* Product list */}
      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">inventory</span>
          <p className="text-body-md">{query ? "Tidak ada produk cocok pencarian" : "Belum ada produk"}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {filtered.map((p) => {
            const currentVal = counts[p.id] !== undefined ? counts[p.id] : "";
            const fisik = parseInt(currentVal, 10);
            const selisih = currentVal !== "" ? (Number.isFinite(fisik) ? fisik - p.stok : 0) : 0;
            const hasChange = currentVal !== "" && selisih !== 0;
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-surface-border)",
                background: hasChange ? (selisih > 0 ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)") : "transparent",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-headline-sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nama}</p>
                  <p className="text-label-md" style={{ color: "var(--color-text-secondary)", fontSize: "11px" }}>
                    Stok sistem: {p.stok} {p.satuan}
                    {p.sku ? ` · SKU: ${p.sku}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  {hasChange && (
                    <span style={{
                      fontSize: "11px", fontWeight: 700, padding: "2px 6px", borderRadius: "999px",
                      color: selisih > 0 ? "var(--color-success-green)" : "var(--color-expense-red)",
                      background: selisih > 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    }}>
                      {selisih > 0 ? "+" : ""}{selisih}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => openModal(p)}
                    style={{
                      padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--color-surface-border)",
                      background: hasChange ? "var(--color-primary-container)" : "var(--color-surface)",
                      color: hasChange ? "white" : "var(--color-text-secondary)",
                      fontSize: "13px", fontWeight: 600, cursor: "pointer", textAlign: "center", minWidth: "80px",
                    }}
                  >
                    {currentVal !== "" ? currentVal : "Fisik"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Simpan button */}
      <button className="btn-primary" onClick={simpanOpname} disabled={saving || berubah === 0} style={{ width: "100%", padding: "14px" }}>
        {saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : `Simpan Opname (${berubah} perubahan)`}
      </button>

      {/* Popup modal untuk input stok fisik */}
      {modalItem && (
        <div className="modal-overlay" onClick={() => setModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "340px" }}>
            <h3 className="text-headline-md" style={{ marginBottom: "0.25rem" }}>Edit Stok Fisik</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              {modalItem.nama}
              <br />
              <span style={{ fontSize: "12px" }}>Stok sistem: {modalItem.stok} {modalItem.satuan} · SKU: {modalItem.sku || "-"}</span>
            </p>
            <label className="input-label">Stok Fisik</label>
            <input ref={inputRef} className="input-field" type="number" inputMode="numeric"
              value={modalValue} onChange={(e) => setModalValue(e.target.value.replace(/\D/g, ""))}
              style={{ width: "100%", marginBottom: "1rem" }}
              onKeyDown={(e) => { if (e.key === "Enter") saveModal(); }}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalItem(null)}>Batal</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={saveModal}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}