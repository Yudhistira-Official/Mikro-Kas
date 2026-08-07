import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, StatusBadge } from "../components/PageKit";
import { formatDateId } from "../utils/dateFormat";
import SearchSelect from "../components/SearchSelect";
import BarcodeScanner from "../components/BarcodeScanner";

export default function SerialManagement() {
  const { addToast } = useToast();
  const [produkList, setProdukList] = useState([]);
  const [produkId, setProdukId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [items, setItems] = useState([]);
  const [refNumber, setRefNumber] = useState("");
  const [kasir, setKasir] = useState("");
  const [transactionType, setTransactionType] = useState("Penjualan / Barang Keluar");
  const [scanOpen, setScanOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyProdukId, setHistoryProdukId] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /**
   * produkOptions — shape {value, label} stabil untuk SearchSelect.
   * Memoized agar SearchSelect tidak re-compute filter saat re-render
   * yang tidak mengubah produkList (e.g. serialNumber/items state change).
   */
  const produkOptions = useMemo(
    () => produkList.map((p) => ({ value: String(p.id), label: `${p.nama}${p.sku ? ` (${p.sku})` : ""}` })),
    [produkList]
  );

  /**
   * selectedProduct — produk yang sedang dipilih untuk registrasi serial.
   * Memoized karena .find() pada array besar berjalan setiap render;
   * hanya re-compute saat produkId atau produkList berubah.
   *
   * @returns {object|undefined} Produk record atau undefined
   */
  const selectedProduct = useMemo(
    () => produkList.find((p) => String(p.id) === String(produkId)),
    [produkList, produkId]
  );

  /**
   * historyProduct — produk yang dipilih untuk melihat riwayat serial.
   * Sama seperti selectedProduct — memoized untuk menghindari .find()
   * berulang di setiap render saat state lain (checking, saving, dll) berubah.
   *
   * @returns {object|undefined} Produk record atau undefined
   */
  const historyProduct = useMemo(
    () => produkList.find((p) => String(p.id) === String(historyProdukId)),
    [produkList, historyProdukId]
  );

  // Load semua produk aktif saat mount — satu kali saja.
  // addToast di deps agar eslint tidak komplain, tapi addToast stabil (dari useToast).
  useEffect(() => {
    invoke("list_produk", { onlyActive: true })
      .then((data) => setProdukList(data || []))
      .catch((e) => { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); });
  }, [addToast]);

  const checkSerial = async () => {
    const value = serialNumber.trim();
    if (!selectedProduct) return addToast("Pilih produk terlebih dahulu", "error");
    if (!value) return addToast("Input nomor seri wajib diisi", "error");
    if (items.some((item) => item.serialNumber.toLowerCase() === value.toLowerCase())) {
      return addToast("Nomor seri sudah ada di daftar", "error");
    }

    setChecking(true);
    try {
      const result = await invoke("check_serial_number", { serialNumber: value });
      if (!result.exists) return addToast("Nomor seri tidak ditemukan di database", "error");
      if (result.produk_id !== selectedProduct.id) return addToast("Nomor seri bukan milik produk yang dipilih", "error");
      if (result.status !== "ready") return addToast(`Nomor seri tidak tersedia: ${result.status}`, "error");
      setItems((current) => [...current, {
        serialId: result.id,
        produkId: selectedProduct.id,
        kode: selectedProduct.sku || "—",
        nama: selectedProduct.nama,
        serialNumber: result.serial_number || value,
        status: "Tersedia",
      }]);
      setSerialNumber("");
      addToast("Nomor seri terverifikasi", "success");
    } catch (e) {
      addToast(`Gagal cek serial: ${e}`, "error");
    } finally {
      setChecking(false);
    }
  };

  const handleScan = (value) => {
    setScanOpen(false);
    setSerialNumber(value || "");
  };

  const removeItem = (serialId) => setItems((current) => current.filter((item) => item.serialId !== serialId));

  const finalize = async () => {
    if (!refNumber.trim()) return addToast("No. referensi/nota wajib diisi", "error");
    if (items.length === 0) return addToast("Tambahkan minimal satu nomor seri", "error");
    setSaving(true);
    try {
      await invoke("finalize_serial_transaction", {
        input: {
          refNumber: refNumber.trim(),
          items: items.map((item) => ({ serialId: item.serialId, produkId: item.produkId })),
        },
      });
      addToast("Nomor seri berhasil dikunci sebagai terjual", "success");
      setItems([]);
      setSerialNumber("");
      if (historyProdukId) void loadHistory(historyProdukId);
    } catch (e) {
      addToast(`Gagal menyelesaikan transaksi: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async (id) => {
    setHistoryProdukId(id);
    if (!id) return setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await invoke("list_serial", { produkId: Number(id) }));
    } catch (e) {
      addToast(`Gagal memuat riwayat serial: ${e}`, "error");
    } finally {
      setHistoryLoading(false);
    }
  };

  const readyCount = history.filter((s) => s.status === "ready").length;
  const soldCount = history.filter((s) => s.status === "terjual").length;
  // produkOptions defined via useMemo above — do NOT redefine here (would defeat memoization)
  const currentTime = new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });

  return (
    <PageShell
      eyebrow="INVENTARIS"
      title="Serial Management"
      description="Validasi nomor seri/IMEI pada barang keluar. Stok berkurang saat checkout; penyelesaian di sini hanya mengunci serial menjadi terjual."
      stats={historyProdukId ? [
        { label: "Total Serial", value: history.length, icon: "inventory_2" },
        { label: "Tersedia", value: readyCount, icon: "check_circle" },
        { label: "Terjual", value: soldCount, icon: "shopping_bag" },
      ] : []}
    >
      <section className="sales-panel" style={{ marginBottom: 16 }}>
        <div className="sales-panel__toolbar" style={{ alignItems: "flex-end" }}>
          <label className="input-label" style={{ flex: "1 1 220px" }}>
            No. Referensi / Nota
            <input className="input-field" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="TRX-20260727-001" />
          </label>
          <label className="input-label" style={{ flex: "1 1 180px" }}>
            Tanggal / Waktu
            <input className="input-field" value={currentTime} readOnly />
          </label>
          <label className="input-label" style={{ flex: "1 1 180px" }}>
            ID / Nama Kasir
            <input className="input-field" value={kasir} onChange={(e) => setKasir(e.target.value)} placeholder="Nama kasir" />
          </label>
          <label className="input-label" style={{ flex: "1 1 200px" }}>
            Tipe Transaksi
            <select className="input-field" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
              <option>Penjualan / Barang Keluar</option>
              <option>Retur / Barang Masuk</option>
            </select>
          </label>
        </div>

        <div className="store-profile-help" style={{ margin: "12px 0" }}>
          <span className="material-symbols-outlined">verified_user</span>
          <span>Cek database memastikan serial tersedia, cocok dengan produk, dan belum pernah terjual.</span>
        </div>

        <div className="sales-panel__toolbar" style={{ alignItems: "flex-end" }}>
          <label className="input-label" style={{ flex: "1 1 240px" }}>
            Produk
            <SearchSelect value={produkId} onChange={setProdukId} options={produkOptions} placeholder="Pilih produk..." />
          </label>
          <label className="input-label" style={{ flex: "1 1 260px" }}>
            Scan / Input Nomor Seri (SN / IMEI)
            <input className="input-field" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void checkSerial(); } }} placeholder="Scan barcode atau ketik SN/IMEI" />
          </label>
          <button type="button" className="btn-secondary" onClick={() => setScanOpen(true)}>
            <span className="material-symbols-outlined">barcode_scanner</span> Scan Barcode SN
          </button>
          <button type="button" className="btn-primary" onClick={checkSerial} disabled={checking}>
            {checking ? "Mengecek..." : "Cek Database"}
          </button>
        </div>

        <div className="sales-table-wrap" style={{ marginTop: 16 }}>
          <table className="sales-table">
            <thead><tr><th>No</th><th>Kode Barang</th><th>Nama Produk</th><th>Qty</th><th>Nomor Seri / IMEI</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--color-text-secondary)" }}>Belum ada serial yang dipilih.</td></tr>
              ) : items.map((item, index) => (
                <tr key={item.serialId}>
                  <td>{index + 1}</td><td>{item.kode}</td><td><b>{item.nama}</b></td><td>1</td>
                  <td><code>{item.serialNumber}</code></td>
                  <td><StatusBadge label={item.status} tone="success" /></td>
                  <td><button type="button" className="btn-secondary" onClick={() => removeItem(item.serialId)}>Hapus Item</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn-primary" onClick={finalize} disabled={saving || items.length === 0}>
            {saving ? "Menyelesaikan..." : "Simpan / Selesaikan"}
          </button>
        </div>
      </section>

      <DataPanel
        toolbarExtra={<label className="input-label" style={{ minWidth: 260 }}>Lihat Riwayat Produk <SearchSelect value={historyProdukId} onChange={loadHistory} options={produkOptions} placeholder="Pilih produk..." /></label>}
        loading={historyLoading}
        isEmpty={!historyLoading && historyProdukId && history.length === 0}
        emptyIcon="history"
        emptyTitle="Belum ada serial"
        emptyHint={historyProduct ? `Belum ada serial untuk ${historyProduct.nama}.` : "Pilih produk untuk melihat riwayat."}
      >
        {historyProdukId && !historyLoading && history.length > 0 && (
          <div className="sales-table-wrap">
            <table className="sales-table"><thead><tr><th>#</th><th>Nomor Seri / IMEI</th><th>Status</th><th>Transaksi</th><th>Dibuat</th></tr></thead>
              <tbody>{history.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td><code>{item.serial_number}</code></td><td><StatusBadge label={item.status} tone={item.status === "ready" ? "success" : "warning"} /></td><td>{item.transaksi_id || "—"}</td><td>{formatDateId(item.created_at)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </DataPanel>

      {scanOpen && <BarcodeScanner onDetected={handleScan} onClose={() => setScanOpen(false)} />}
    </PageShell>
  );
}
