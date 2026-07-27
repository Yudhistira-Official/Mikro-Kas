// ============================================================
// Promo.jsx — Pengaturan Promo MikroKas
//
// Fitur:
//   1. Promo Minimum Belanja → diskon nominal/persen.
//   2. Beli X Gratis Y (Min. Belanja → Gratis Produk).
//   3. Tebus Murah (Min. Belanja → Beli Produk Harga Spesial).
//
// Semua rule disimpan di localStorage agar offline-first,
// cepat, tanpa migrasi database.
// Design ref: KasGo — Loyalty & Promo.
// ============================================================
import { useMemo, useState, useEffect } from "react";
import { useToast } from "../hooks/useToast";
import { invoke } from "../utils/ipc";
import SearchSelect from "../components/SearchSelect";
import RupiahInput from "../components/RupiahInput";
import { PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter, rupiah } from "../components/PageKit";

const STORAGE_KEY_MIN = "mikrokas_promo_minimum_belanja";
const STORAGE_KEY_BXGY = "mikrokas_promo_bxgy";
const STORAGE_KEY_TM = "mikrokas_promo_tebus_murah";
// ---- Promo Minimum Belanja ----
const defaultMinRule = {
  aktif: false,
  minBelanja: "100000",
  tipe: "nominal",
  nilai: "10000",
};

export const readPromoMinimumRule = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_MIN) || "null");
    return { ...defaultMinRule, ...(parsed || {}) };
  } catch {
    return defaultMinRule;
  }
};

// ---- Beli X Gratis Y (Min. Belanja → Gratis Produk) ----
const defaultBxgyRule = {
  aktif: false,
  minBelanja: "200000",
  produkId: null,
  produkNama: "",
  qtyGratis: 1,
};

export const readPromoBxgyRule = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_BXGY) || "null");
    return { ...defaultBxgyRule, ...(parsed || {}) };
  } catch {
    return defaultBxgyRule;
  }
};

// ---- Tebus Murah (Min. Belanja → Beli Produk Harga Spesial) ----
// Design ref: KasGo — Tebus Murah promo.
const defaultTebusMurahRule = {
  aktif: false,
  minBelanja: "300000",
  produkId: null,
  produkNama: "",
  hargaTebus: "5000",
};

export const readPromoTebusMurahRule = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_TM) || "null");
    return { ...defaultTebusMurahRule, ...(parsed || {}) };
  } catch {
    return defaultTebusMurahRule;
  }
};

export default function Promo() {
  const { addToast } = useToast();
  const [minRule, setMinRule] = useState(readPromoMinimumRule);
  const [bxgyRule, setBxgyRule] = useState(readPromoBxgyRule);
  const [tmRule, setTmRule] = useState(readPromoTebusMurahRule);
  const [produkList, setProdukList] = useState([]);

  // Load produk untuk dropdown BxGY
  useEffect(() => {
    invoke("list_produk", { onlyActive: true })
      .then(setProdukList)
      .catch(() => {});
  }, []);

  // --- Minimum Belanja ---
  const min = Number(minRule.minBelanja || 0);
  const nilai = Number(minRule.nilai || 0);
  const previewDiskon = useMemo(
    () => (minRule.tipe === "persen" ? Math.round((min * nilai) / 100) : nilai),
    [min, nilai, minRule.tipe],
  );

  const saveMin = () => {
    const clean = {
      aktif: Boolean(minRule.aktif),
      minBelanja: String(Math.max(0, Number(minRule.minBelanja || 0))),
      tipe: minRule.tipe === "persen" ? "persen" : "nominal",
      nilai: String(Math.max(0, Number(minRule.nilai || 0))),
    };
    localStorage.setItem(STORAGE_KEY_MIN, JSON.stringify(clean));
    setMinRule(clean);
    addToast("Promo minimum belanja disimpan", "success");
  };

  const resetMin = () => {
    localStorage.removeItem(STORAGE_KEY_MIN);
    setMinRule(defaultMinRule);
    addToast("Promo minimum belanja dinonaktifkan", "success");
  };

  // --- Beli X Gratis Y ---
  const selectedProduk = produkList.find((p) => p.id === bxgyRule.produkId);
  const bxgyMin = Number(bxgyRule.minBelanja || 0);

  const saveBxgy = () => {
    const clean = {
      aktif: Boolean(bxgyRule.aktif),
      minBelanja: String(Math.max(0, Number(bxgyRule.minBelanja || 0))),
      produkId: bxgyRule.produkId ? Number(bxgyRule.produkId) : null,
      produkNama: selectedProduk?.nama || "",
      qtyGratis: Math.max(1, Number(bxgyRule.qtyGratis || 1)),
    };
    localStorage.setItem(STORAGE_KEY_BXGY, JSON.stringify(clean));
    setBxgyRule(clean);
    addToast("Promo Beli X Gratis Y disimpan", "success");
  };

  const resetBxgy = () => {
    localStorage.removeItem(STORAGE_KEY_BXGY);
    setBxgyRule(defaultBxgyRule);
    addToast("Promo BxGY dinonaktifkan", "success");
  };

  // --- Tebus Murah ---
  const selectedTmProduk = produkList.find((p) => p.id === tmRule.produkId);
  const tmMin = Number(tmRule.minBelanja || 0);
  const tmHarga = Number(tmRule.hargaTebus || 0);

  const saveTm = () => {
    const clean = {
      aktif: Boolean(tmRule.aktif),
      minBelanja: String(Math.max(0, Number(tmRule.minBelanja || 0))),
      produkId: tmRule.produkId ? Number(tmRule.produkId) : null,
      produkNama: selectedTmProduk?.nama || "",
      hargaTebus: String(Math.max(0, Number(tmRule.hargaTebus || 0))),
    };
    localStorage.setItem(STORAGE_KEY_TM, JSON.stringify(clean));
    setTmRule(clean);
    addToast("Promo Tebus Murah disimpan", "success");
  };

  const resetTm = () => {
    localStorage.removeItem(STORAGE_KEY_TM);
    setTmRule(defaultTebusMurahRule);
    addToast("Promo Tebus Murah dinonaktifkan", "success");
  };

  return (
    <PageShell
      eyebrow="MASTER DATA"
      title="Periode Promosi"
      description="Atur promo yang otomatis berlaku di kasir saat pelanggan memenuhi syarat."
      stats={[
        { label: "Min. Belanja", value: minRule.aktif ? "Aktif" : "Off", icon: "local_offer", tone: minRule.aktif ? "var(--color-income-green)" : "var(--color-text-secondary)" },
        { label: "Beli X Gratis Y", value: bxgyRule.aktif ? "Aktif" : "Off", icon: "card_giftcard", tone: bxgyRule.aktif ? "var(--color-income-green)" : "var(--color-text-secondary)" },
        { label: "Tebus Murah", value: tmRule.aktif ? "Aktif" : "Off", icon: "redeem", tone: tmRule.aktif ? "var(--color-income-green)" : "var(--color-text-secondary)" },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ========== PROMO MINIMUM BELANJA ========== */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "20px" }}>local_offer</span>
          <p className="text-headline-sm" style={{ fontSize: "16px", fontWeight: 600 }}>Promo Minimum Belanja</p>
        </div>

        <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem", background: "linear-gradient(135deg, rgba(30,58,138,0.10), rgba(15,118,110,0.10))" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="text-headline-sm">Aktifkan Promo</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Potongan otomatis saat subtotal memenuhi minimum.</p>
            </div>
            <button
              type="button"
              className={minRule.aktif ? "btn-primary" : "btn-secondary"}
              onClick={() => setMinRule((p) => ({ ...p, aktif: !p.aktif }))}
              style={{ minWidth: "80px" }}
            >
              {minRule.aktif ? "Aktif" : "Off"}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Minimal Belanja</label>
          <RupiahInput value={minRule.minBelanja} onChange={(val) => setMinRule((p) => ({ ...p, minBelanja: val }))} placeholder="100000" />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Tipe Potongan</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <button type="button" className={minRule.tipe === "nominal" ? "btn-primary" : "btn-secondary"} onClick={() => setMinRule((p) => ({ ...p, tipe: "nominal" }))}>Nominal Rp</button>
            <button type="button" className={minRule.tipe === "persen" ? "btn-primary" : "btn-secondary"} onClick={() => setMinRule((p) => ({ ...p, tipe: "persen" }))}>Persen %</button>
          </div>
          <label className="input-label">Potongan Promo</label>
          <input className="input-field" inputMode="numeric" value={minRule.nilai} onChange={(e) => setMinRule((p) => ({ ...p, nilai: e.target.value.replace(/\D/g, "") }))} placeholder={minRule.tipe === "persen" ? "10" : "10000"} />
        </div>

        <div className="card" style={{ padding: "0.75rem", background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)", marginBottom: "0.75rem" }}>
          <span className="badge" style={{ background: "rgba(245,158,11,0.22)", color: "#92400E", marginBottom: "0.25rem", fontSize: "11px" }}>Preview</span>
          <p className="text-body-sm">Belanja min {rupiah(min)} → diskon {minRule.tipe === "persen" ? `${nilai}% (${rupiah(previewDiskon)})` : rupiah(previewDiskon)}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <button className="btn-secondary" type="button" onClick={resetMin}>Reset</button>
          <button className="btn-primary" type="button" onClick={saveMin}>Simpan</button>
        </div>
      </div>

      {/* ========== BELI X GRATIS Y (Min. Belanja → Gratis Produk) ========== */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
          <span className="material-symbols-outlined" style={{ color: "#F59E0B", fontSize: "20px" }}>redeem</span>
          <p className="text-headline-sm" style={{ fontSize: "16px", fontWeight: 600 }}>Beli X Gratis Y</p>
        </div>
        <p className="text-body-sm" style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
          Pelanggan yang belanja mencapai minimum akan mendapat produk gratis.
        </p>

        <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem", background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="text-headline-sm">Aktifkan BxGY</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Produk gratis otomatis ditambah di kasir.</p>
            </div>
            <button
              type="button"
              className={bxgyRule.aktif ? "btn-primary" : "btn-secondary"}
              onClick={() => setBxgyRule((p) => ({ ...p, aktif: !p.aktif }))}
              style={{ minWidth: "80px" }}
            >
              {bxgyRule.aktif ? "Aktif" : "Off"}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Minimal Belanja</label>
          <RupiahInput value={bxgyRule.minBelanja} onChange={(v) => setBxgyRule((p) => ({ ...p, minBelanja: v }))} placeholder="200000" />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Produk Gratis</label>
          <SearchSelect
            className="input-field"
            value={bxgyRule.produkId || ""}
            onChange={(value) => {
              const id = value ? Number(value) : null;
              const nama = produkList.find((p) => p.id === id)?.nama || "";
              setBxgyRule((p) => ({ ...p, produkId: id, produkNama: nama }));
            }}
            placeholder="Pilih produk..."
            options={produkList.map((p) => ({ value: String(p.id), label: `${p.nama} — ${rupiah(p.harga_jual)}` }))}
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Jumlah Gratis</label>
          <input className="input-field" inputMode="numeric" value={bxgyRule.qtyGratis} onChange={(e) => setBxgyRule((p) => ({ ...p, qtyGratis: e.target.value.replace(/\D/g, "") || "1" }))} placeholder="1" />
        </div>

        <div className="card" style={{ padding: "0.75rem", background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)", marginBottom: "0.75rem" }}>
          <span className="badge" style={{ background: "rgba(245,158,11,0.22)", color: "#92400E", marginBottom: "0.25rem", fontSize: "11px" }}>Preview</span>
          <p className="text-body-sm">
            Belanja min {rupiah(bxgyMin)} → {bxgyRule.qtyGratis || 1}x {bxgyRule.produkNama || "produk"} GRATIS
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <button className="btn-secondary" type="button" onClick={resetBxgy}>Reset</button>
          <button className="btn-primary" type="button" onClick={saveBxgy}>Simpan BxGY</button>
        </div>
      </div>

      {/* ========== TEBUS MURAH ========== */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-secondary-cyan)", fontSize: "20px" }}>sell</span>
          <p className="text-headline-sm" style={{ fontSize: "16px", fontWeight: 600 }}>Tebus Murah</p>
        </div>
        <p className="text-body-sm" style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
          Pelanggan yang belanja mencapai minimum bisa beli produk tertentu dengan harga spesial.
        </p>

        <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem", background: "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.05))" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="text-headline-sm">Aktifkan Tebus Murah</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Harga khusus untuk produk tertentu jika syarat terpenuhi.</p>
            </div>
            <button
              type="button"
              className={tmRule.aktif ? "btn-primary" : "btn-secondary"}
              onClick={() => setTmRule((p) => ({ ...p, aktif: !p.aktif }))}
              style={{ minWidth: "80px" }}
            >
              {tmRule.aktif ? "Aktif" : "Off"}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Minimal Belanja</label>
          <RupiahInput value={tmRule.minBelanja} onChange={(v) => setTmRule((p) => ({ ...p, minBelanja: v }))} placeholder="300000" />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Produk Tebus Murah</label>
          <SearchSelect
            className="input-field"
            value={tmRule.produkId || ""}
            onChange={(value) => {
              const id = value ? Number(value) : null;
              const nama = produkList.find((p) => p.id === id)?.nama || "";
              setTmRule((p) => ({ ...p, produkId: id, produkNama: nama }));
            }}
            placeholder="Pilih produk..."
            options={produkList.map((p) => ({ value: String(p.id), label: `${p.nama} — ${rupiah(p.harga_jual)}` }))}
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="input-label">Harga Tebus</label>
          <RupiahInput value={tmRule.hargaTebus} onChange={(v) => setTmRule((p) => ({ ...p, hargaTebus: v }))} placeholder="5000" />
          {selectedTmProduk && (
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
              Normal: {rupiah(Number(selectedTmProduk.harga_jual || 0))} → Tebus: {rupiah(tmHarga)} (hemat {rupiah(Number(selectedTmProduk.harga_jual || 0) - tmHarga)})
            </p>
          )}
        </div>

        <div className="card" style={{ padding: "0.75rem", background: "rgba(6,182,212,0.08)", borderColor: "rgba(6,182,212,0.3)", marginBottom: "0.75rem" }}>
          <span className="badge" style={{ background: "rgba(6,182,212,0.22)", color: "#0E7490", marginBottom: "0.25rem", fontSize: "11px" }}>Preview</span>
          <p className="text-body-sm">
            Belanja min {rupiah(tmMin)} → {tmRule.produkNama || "produk"} bisa dibeli {rupiah(tmHarga)}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <button className="btn-secondary" type="button" onClick={resetTm}>Reset</button>
          <button className="btn-primary" type="button" onClick={saveTm}>Simpan Tebus Murah</button>
        </div>
      </div>
      </div>
    </PageShell>
  );
}
