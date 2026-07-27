import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, InfoNote } from "../components/PageKit";
import RupiahInput from "../components/RupiahInput";
import SearchSelect from "../components/SearchSelect";

/**
 * MultiHarga — kalkulator diskon bertingkat & cek harga jual (PageKit).
 */
export default function MultiHarga() {
  const { addToast } = useToast();
  const [diskonForm, setDiskonForm] = useState({ harga: "", lapisan: "" });
  const [hargaForm, setHargaForm] = useState({ produkId: "" });
  const [result, setResult] = useState(null);
  const [resultType, setResultType] = useState("");
  const [produkList, setProdukList] = useState([]);

  useEffect(() => {
    invoke("list_produk", { onlyActive: true }).then((data) => setProdukList(data || [])).catch(() => {});
  }, []);

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
    <PageShell
      eyebrow="MASTER DATA"
      title="Harga Multi Level"
      description="Hitung harga jual berdasarkan lapisan diskon dan lihat harga produk yang berlaku di kasir."
      stats={[
        { label: "Diskon Bertingkat", value: "Berurutan", icon: "layers" },
        { label: "Harga Jual", value: "Per Produk", icon: "price_change" },
        { label: "Mode Kalkulasi", value: "Otomatis", icon: "calculate" },
      ]}
    >
      <InfoNote>
        Lapisan diskon dipisah koma (contoh: 10,5,2). Harga jual produk diambil dari backend kasir.
      </InfoNote>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem" }}>
        <DataPanel isEmpty={false}>
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h2 className="text-headline-sm">Diskon Bertingkat</h2>
            <label className="input-label">Harga Awal
              <RupiahInput value={diskonForm.harga} onChange={(val) => setDiskonForm({ ...diskonForm, harga: val })} placeholder="100000" />
            </label>
            <label className="input-label">Lapisan Diskon (%)
              <input className="input-field" value={diskonForm.lapisan} onChange={(e) => setDiskonForm({ ...diskonForm, lapisan: e.target.value })} placeholder="10,5,2" />
            </label>
            <button type="button" className="btn-primary" onClick={hitungDiskon}>
              <span className="material-symbols-outlined">calculate</span>Hitung Diskon
            </button>
          </div>
        </DataPanel>

        <DataPanel isEmpty={false}>
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h2 className="text-headline-sm">Harga Jual Produk</h2>
            <label className="input-label">Produk
              <SearchSelect
                value={hargaForm.produkId}
                onChange={(value) => setHargaForm({ produkId: value })}
                placeholder="Pilih produk"
                options={produkList.map((p) => ({ value: String(p.id), label: `${p.nama}${p.sku ? ` — ${p.sku}` : ""}` }))}
                required
              />
            </label>
            <button type="button" className="btn-primary" onClick={getHarga}>
              <span className="material-symbols-outlined">search</span>Lihat Harga Jual
            </button>
          </div>
        </DataPanel>
      </div>

      {result !== null && (
        <DataPanel isEmpty={false}>
          <div style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <p className="sales-page__eyebrow">HASIL KALKULASI</p>
                <h2 className="text-headline-sm">{resultType === "diskon" ? "Ringkasan Diskon" : "Harga Produk"}</h2>
              </div>
              <span className="material-symbols-outlined" style={{ color: "var(--color-income-green)", fontSize: 28 }}>check_circle</span>
            </div>
            <pre className="advanced-result__pre">{JSON.stringify(result, null, 2)}</pre>
          </div>
        </DataPanel>
      )}
    </PageShell>
  );
}
