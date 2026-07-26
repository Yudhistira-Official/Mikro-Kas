import { useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

export default function MultiHarga() {
  const { addToast } = useToast();
  const [diskonForm, setDiskonForm] = useState({ harga: "", lapisan: "" });
  const [hargaForm, setHargaForm] = useState({ produkId: "" });
  const [result, setResult] = useState(null);
  const [resultType, setResultType] = useState("");

  const hitungDiskon = async () => {
    try {
      const lapisan = diskonForm.lapisan.split(",").map((x) => Number(x.trim())).filter((x) => !isNaN(x));
      if (!diskonForm.harga || !lapisan.length) return addToast("Isi harga dan minimal satu lapisan diskon", "error");
      const data = await invoke("hitung_diskon_bertingkat", { harga: Number(diskonForm.harga), lapisan });
      setResult(data);
      setResultType("diskon");
    } catch (e) { addToast(String(e), "error"); }
  };

  const getHarga = async () => {
    try {
      if (!hargaForm.produkId) return addToast("Isi Produk ID terlebih dahulu", "error");
      const data = await invoke("get_harga_jual", { produkId: Number(hargaForm.produkId) });
      setResult(data);
      setResultType("harga");
    } catch (e) { addToast(String(e), "error"); }
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">MASTER DATA</p>
          <h1 className="text-headline-lg">Harga Multi Level</h1>
          <p className="text-body-md sales-page__subtitle">Hitung harga jual berdasarkan lapisan diskon dan lihat harga produk yang berlaku di kasir.</p>
        </div>
      </header>

      <section className="sales-stats">
        <div className="sales-stat-card"><span className="material-symbols-outlined">layers</span><div><span>Diskon Bertingkat</span><strong>Berurutan</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">price_change</span><div><span>Harga Jual</span><strong>Per Produk</strong></div></div>
        <div className="sales-stat-card"><span className="material-symbols-outlined">calculate</span><div><span>Mode Kalkulasi</span><strong>Otomatis</strong></div></div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem" }}>
        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>layers</span><h2 className="text-headline-sm">Diskon Bertingkat</h2></div>
          <p className="text-body-sm" style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Masukkan diskon berurutan. Contoh: 10, 5, 2 berarti 10% lalu 5% lalu 2%.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label className="input-label">Harga Dasar<input className="input-field" type="number" value={diskonForm.harga} onChange={(e) => setDiskonForm({ ...diskonForm, harga: e.target.value })} placeholder="100000" /></label>
            <label className="input-label">Lapisan Diskon (%)<input className="input-field" value={diskonForm.lapisan} onChange={(e) => setDiskonForm({ ...diskonForm, lapisan: e.target.value })} placeholder="10, 5, 2" /></label>
            <button className="btn-primary" onClick={hitungDiskon}><span className="material-symbols-outlined">calculate</span>Hitung Diskon</button>
          </div>
        </section>

        <section className="sales-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span className="material-symbols-outlined" style={{ color: "var(--color-secondary-cyan)" }}>price_change</span><h2 className="text-headline-sm">Harga Jual Produk</h2></div>
          <p className="text-body-sm" style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Lihat harga jual aktif suatu produk berdasarkan ID produk.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label className="input-label">Produk ID<input className="input-field" type="number" value={hargaForm.produkId} onChange={(e) => setHargaForm({ produkId: e.target.value })} placeholder="1" /></label>
            <button className="btn-primary" onClick={getHarga}><span className="material-symbols-outlined">search</span>Lihat Harga Jual</button>
          </div>
        </section>
      </div>

      {result !== null && <section className="sales-panel" style={{ padding: "1.25rem" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><div><p className="sales-page__eyebrow">HASIL KALKULASI</p><h2 className="text-headline-sm">{resultType === "diskon" ? "Ringkasan Diskon" : "Harga Produk"}</h2></div><span className="material-symbols-outlined" style={{ color: "var(--color-income-green)", fontSize: 28 }}>check_circle</span></div><pre className="advanced-result__pre">{JSON.stringify(result, null, 2)}</pre></section>}
    </div>
  );
}
