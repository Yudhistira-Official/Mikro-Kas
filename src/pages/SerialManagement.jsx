import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

/**
 * SerialManagement — tampilan daftar serial number per produk.
 *
 * Flow:
 * 1. Load semua produk aktif untuk datalist search.
 * 2. User pilih produk via input search (nama/SKU).
 * 3. Load list serial produk terpilih.
 * 4. Tampilkan serial dalam tabel dengan status badge.
 */
export default function SerialManagement() {
  const { addToast } = useToast();

  /** Daftar produk aktif untuk datalist */
  const [produkList, setProdukList] = useState([]);
  /** Serial number list produk terpilih */
  const [serials, setSerials] = useState([]);
  /** Teks search produk (nama tampilan) */
  const [searchProduk, setSearchProduk] = useState("");
  /** Produk ID yang sedang aktif */
  const [aktivProdukId, setAktivProdukId] = useState(null);
  /** Nama produk aktif untuk display */
  const [aktivProdukNama, setAktivProdukNama] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  /** Load produk list sekali saat mount */
  useEffect(() => {
    invoke("list_produk", { onlyActive: true })
      .then((data) => setProdukList(data || []))
      .catch((e) => addToast(String(e), "error"));
  }, []);

  /** Load serial saat produk aktif berubah */
  const loadSerials = async (produkId) => {
    if (!produkId) return;
    setLoading(true);
    try {
      const data = await invoke("list_serial", { produk_id: produkId });
      setSerials(data || []);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Saat user memilih dari datalist, cari produk yang cocok dan set aktif.
   * Cocokkan berdasarkan nilai input (nama + SKU).
   */
  const handleProdukChange = (e) => {
    const val = e.target.value;
    setSearchProduk(val);
    // Cari produk yang labelnya cocok persis
    const match = produkList.find(
      (p) => `${p.nama}${p.sku ? " — " + p.sku : ""}` === val
    );
    if (match) {
      setAktivProdukId(match.id);
      setAktivProdukNama(match.nama);
      loadSerials(match.id);
    } else {
      setAktivProdukId(null);
      setAktivProdukNama("");
      setSerials([]);
    }
  };

  /** Filter serial berdasarkan query search tabel */
  const filteredSerials = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return serials;
    return serials.filter((s) =>
      `${s.serial_number} ${s.status}`.toLowerCase().includes(term)
    );
  }, [serials, query]);

  /** Hitung ringkasan status serial */
  const totalReady = serials.filter((s) => s.status === "ready").length;
  const totalTerjual = serials.filter((s) => s.status === "terjual").length;

  /**
   * Tentukan kelas badge berdasarkan status serial.
   * ready → success, terjual → warning, lainnya → default
   */
  const badgeClass = (status) => {
    if (status === "ready") return "badge badge-success";
    if (status === "terjual") return "badge badge-warning";
    return "badge badge-empty";
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">INVENTARIS</p>
          <h1 className="text-headline-lg">Serial Management</h1>
          <p className="text-body-md sales-page__subtitle">
            Lacak serial number produk: status, gudang, dan histori transaksi.
          </p>
        </div>
      </header>

      {/* Stat cards — tampil hanya saat ada produk aktif */}
      {aktivProdukId && (
        <section className="sales-stats">
          <div className="sales-stat-card">
            <span className="material-symbols-outlined">inventory_2</span>
            <div>
              <span>Total Serial</span>
              <strong>{serials.length}</strong>
            </div>
          </div>
          <div className="sales-stat-card">
            <span className="material-symbols-outlined">check_circle</span>
            <div>
              <span>Ready</span>
              <strong>{totalReady}</strong>
            </div>
          </div>
          <div className="sales-stat-card">
            <span className="material-symbols-outlined">shopping_bag</span>
            <div>
              <span>Terjual</span>
              <strong>{totalTerjual}</strong>
            </div>
          </div>
        </section>
      )}

      {/* Panel pencarian & tabel */}
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          {/* Datalist search produk */}
          <div className="sales-search" style={{ maxWidth: 320 }}>
            <span className="material-symbols-outlined">barcode_scanner</span>
            <input
              list="produk-datalist"
              placeholder="Cari produk…"
              value={searchProduk}
              onChange={handleProdukChange}
            />
            <datalist id="produk-datalist">
              {produkList.map((p) => (
                <option
                  key={p.id}
                  value={`${p.nama}${p.sku ? " — " + p.sku : ""}`}
                />
              ))}
            </datalist>
          </div>

          {/* Search dalam tabel serial — aktif hanya saat ada produk dipilih */}
          {aktivProdukId && (
            <div className="sales-search">
              <span className="material-symbols-outlined">search</span>
              <input
                placeholder="Cari serial / status…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* State: belum pilih produk */}
        {!aktivProdukId && (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--color-text-secondary)",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 40, marginBottom: 8, display: "block" }}
            >
              numbers
            </span>
            <p>Pilih produk di atas untuk melihat daftar serial number.</p>
          </div>
        )}

        {/* State: loading */}
        {aktivProdukId && loading && (
          <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--color-text-secondary)" }}>
            Memuat serial…
          </div>
        )}

        {/* Tabel serial */}
        {aktivProdukId && !loading && (
          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Serial Number</th>
                  <th>Status</th>
                  <th>Gudang ID</th>
                  <th>Transaksi ID</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {filteredSerials.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        textAlign: "center",
                        padding: "32px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {query ? "Tidak ada serial yang cocok." : `Belum ada serial untuk ${aktivProdukNama}.`}
                    </td>
                  </tr>
                ) : (
                  filteredSerials.map((s, i) => (
                    <tr key={s.id}>
                      <td style={{ color: "var(--color-text-secondary)" }}>{i + 1}</td>
                      <td>
                        <code style={{ fontSize: 12 }}>{s.serial_number}</code>
                      </td>
                      <td>
                        <span className={badgeClass(s.status)}>{s.status}</span>
                      </td>
                      <td>{s.gudang_id}</td>
                      <td>{s.transaksi_id ?? "—"}</td>
                      <td style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
                        {s.created_at?.slice(0, 10)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
