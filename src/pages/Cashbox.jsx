import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

/**
 * Cashbox — kelola saldo kas lokal + mutasi per cashbox.
 *
 * Flow:
 * - Load semua cashbox + semua mutasi saat mount
 * - Stats: jumlah cashbox, total saldo gabungan
 * - Tabel daftar cashbox; klik baris buka modal mutasi
 * - Form buat cashbox baru
 * - Modal mutasi: tampilkan histori per cashbox + form input mutasi
 */
export default function Cashbox() {
  const { addToast } = useToast();

  /** Daftar semua cashbox */
  const [list, setList] = useState([]);
  /** Semua mutasi (difilter per cashbox saat modal terbuka) */
  const [mutasiAll, setMutasiAll] = useState([]);
  const [loading, setLoading] = useState(true);

  /** Cashbox yang sedang dibuka modal mutasinya */
  const [selectedBox, setSelectedBox] = useState(null);

  /** Kontrol visibilitas form buat cashbox */
  const [showCreate, setShowCreate] = useState(false);
  /** Nama cashbox baru */
  const [boxNama, setBoxNama] = useState("");

  /** Form mutasi (tambah/kurang/pindah) */
  const [mutasiForm, setMutasiForm] = useState({
    tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: ""
  });

  /** Search di tabel cashbox */
  const [query, setQuery] = useState("");

  /** Load semua data cashbox + mutasi */
  const load = async () => {
    setLoading(true);
    try {
      const [cbData, mutData] = await Promise.all([
        invoke("list_cashbox"),
        invoke("list_cashbox_mutasi", { cashbox_id: null })
      ]);
      setList(cbData || []);
      setMutasiAll(mutData || []);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /** Total saldo semua cashbox */
  const totalSaldo = useMemo(
    () => list.reduce((sum, cb) => sum + Number(cb.saldo || 0), 0),
    [list]
  );

  /** Filter tabel cashbox berdasarkan query search */
  const filteredList = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((cb) => cb.nama.toLowerCase().includes(term));
  }, [list, query]);

  /**
   * Mutasi cashbox terpilih untuk ditampilkan di modal.
   * Filter dari mutasiAll berdasarkan cashbox_id aktif.
   */
  const mutasiSelected = useMemo(() => {
    if (!selectedBox) return [];
    return mutasiAll.filter((m) => m.cashbox_id === selectedBox.id);
  }, [mutasiAll, selectedBox]);

  /** Buat cashbox baru */
  const createBox = async (e) => {
    e.preventDefault();
    if (!boxNama.trim()) return addToast("Nama kas wajib diisi", "error");
    try {
      await invoke("create_cashbox", { nama: boxNama.trim() });
      addToast("Cashbox baru dibuat", "success");
      setBoxNama("");
      setShowCreate(false);
      load();
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  /**
   * Submit mutasi kas (tambah/kurang/pindah).
   * Validasi: jumlah > 0, kas asal wajib saat tipe "pindah".
   */
  const handleMutasi = async (e) => {
    e.preventDefault();
    const jumlah = Number(mutasiForm.jumlah);
    if (!jumlah || jumlah <= 0) return addToast("Jumlah harus > 0", "error");
    if (!selectedBox) return addToast("Pilih cashbox terlebih dahulu", "error");
    if (mutasiForm.tipe === "pindah" && !mutasiForm.dari_cashbox_id) {
      return addToast("Kas asal wajib dipilih", "error");
    }
    try {
      await invoke("mutasi_cashbox", {
        input: {
          cashbox_id: selectedBox.id,
          tipe: mutasiForm.tipe,
          jumlah,
          dari_cashbox_id: mutasiForm.tipe === "pindah"
            ? Number(mutasiForm.dari_cashbox_id)
            : null,
          keterangan: mutasiForm.keterangan.trim() || null
        }
      });
      addToast("Mutasi kas berhasil", "success");
      setMutasiForm({ tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: "" });
      const [cbData, mutData] = await Promise.all([
        invoke("list_cashbox"),
        invoke("list_cashbox_mutasi", { cashbox_id: null })
      ]);
      setList(cbData || []);
      setMutasiAll(mutData || []);
      // Sync saldo di selectedBox
      const updated = (cbData || []).find((cb) => cb.id === selectedBox.id);
      if (updated) setSelectedBox(updated);
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  /** Warna badge berdasarkan tipe mutasi */
  const mutasiBadge = (tipe) => {
    if (tipe === "tambah") return "badge badge-success";
    if (tipe === "kurang") return "badge badge-error";
    return "badge badge-warning";
  };

  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          <p className="sales-page__eyebrow">KAS & KEUANGAN</p>
          <h1 className="text-headline-lg">Cashbox</h1>
          <p className="text-body-md sales-page__subtitle">
            Kelola saldo kas lokal dan riwayat mutasi setiap cashbox.
          </p>
        </div>
        <button className="btn-primary sales-page__add" onClick={() => setShowCreate((v) => !v)}>
          <span className="material-symbols-outlined">add</span>
          Buat Cashbox
        </button>
      </header>

      {/* Stats */}
      <section className="sales-stats">
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">account_balance_wallet</span>
          <div>
            <span>Total Cashbox</span>
            <strong>{list.length}</strong>
          </div>
        </div>
        <div className="sales-stat-card">
          <span className="material-symbols-outlined">payments</span>
          <div>
            <span>Total Saldo</span>
            <strong>{rupiah(totalSaldo)}</strong>
          </div>
        </div>
      </section>

      {/* Form buat cashbox — inline collapsible */}
      {showCreate && (
        <section className="sales-panel">
          <div className="sales-panel__toolbar">
            <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>
              add_circle
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Buat Cashbox Baru</span>
          </div>
          <form onSubmit={createBox} style={{ padding: "16px", display: "flex", gap: "10px", alignItems: "flex-end" }}>
            <label style={{ flex: 1 }}>
              Nama Cashbox *
              <input
                className="input-field"
                placeholder="Mis: Kas Utama, Kas Cabang"
                value={boxNama}
                onChange={(e) => setBoxNama(e.target.value)}
                autoFocus
              />
            </label>
            <button className="btn-primary" type="submit">Simpan</button>
            <button className="btn-secondary" type="button" onClick={() => setShowCreate(false)}>
              Batal
            </button>
          </form>
        </section>
      )}

      {/* Tabel cashbox */}
      <section className="sales-panel">
        <div className="sales-panel__toolbar">
          <div className="sales-search">
            <span className="material-symbols-outlined">search</span>
            <input
              placeholder="Cari cashbox…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={load} style={{ flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--color-text-secondary)" }}>
            Memuat…
          </div>
        ) : (
          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nama Cashbox</th>
                  <th>Saldo</th>
                  <th>Dibuat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--color-text-secondary)" }}>
                      {query ? "Tidak ada cashbox yang cocok." : "Belum ada cashbox. Buat cashbox baru di atas."}
                    </td>
                  </tr>
                ) : (
                  filteredList.map((cb, i) => (
                    <tr key={cb.id} style={{ cursor: "pointer" }} onClick={() => {
                      setSelectedBox(cb);
                      setMutasiForm({ tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: "" });
                    }}>
                      <td style={{ color: "var(--color-text-secondary)" }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{cb.nama}</td>
                      <td style={{ color: cb.saldo >= 0 ? "var(--color-primary)" : "var(--color-expense-red)", fontWeight: 700 }}>
                        {rupiah(cb.saldo)}
                      </td>
                      <td style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
                        {cb.created_at?.slice(0, 10)}
                      </td>
                      <td>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBox(cb);
                            setMutasiForm({ tipe: "tambah", jumlah: "", dari_cashbox_id: "", keterangan: "" });
                          }}
                        >
                          Mutasi
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal mutasi per cashbox */}
      {selectedBox && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedBox(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: "24px"
          }}
        >
          <div
            className="sales-panel"
            style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", borderRadius: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="sales-panel__toolbar" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>
                  account_balance_wallet
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedBox.nama}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    Saldo: {rupiah(selectedBox.saldo)}
                  </div>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setSelectedBox(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Form mutasi */}
            <form onSubmit={handleMutasi} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", borderBottom: "1px solid var(--color-surface-border)" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Input Mutasi</div>

              <label>
                Tipe Mutasi
                <select
                  className="input-field"
                  value={mutasiForm.tipe}
                  onChange={(e) => setMutasiForm((p) => ({ ...p, tipe: e.target.value }))}
                >
                  <option value="tambah">Tambah (pemasukan)</option>
                  <option value="kurang">Kurang (pengeluaran)</option>
                  <option value="pindah">Pindah dari kas lain</option>
                </select>
              </label>

              {mutasiForm.tipe === "pindah" && (
                <label>
                  Kas Asal *
                  <select
                    className="input-field"
                    value={mutasiForm.dari_cashbox_id}
                    onChange={(e) => setMutasiForm((p) => ({ ...p, dari_cashbox_id: e.target.value }))}
                  >
                    <option value="">— pilih kas asal —</option>
                    {list
                      .filter((cb) => cb.id !== selectedBox.id)
                      .map((cb) => (
                        <option key={cb.id} value={cb.id}>
                          {cb.nama} ({rupiah(cb.saldo)})
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <label>
                Jumlah (Rp) *
                <input
                  className="input-field"
                  inputMode="numeric"
                  placeholder="Nominal"
                  value={mutasiForm.jumlah}
                  onChange={(e) => setMutasiForm((p) => ({ ...p, jumlah: e.target.value.replace(/\D/g, "") }))}
                />
              </label>

              <label>
                Keterangan
                <input
                  className="input-field"
                  placeholder="Opsional"
                  value={mutasiForm.keterangan}
                  onChange={(e) => setMutasiForm((p) => ({ ...p, keterangan: e.target.value }))}
                />
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary" type="submit" style={{ flex: 1 }}>Kirim Mutasi</button>
                <button className="btn-secondary" type="button" onClick={() => setSelectedBox(null)} style={{ flex: 1 }}>
                  Tutup
                </button>
              </div>
            </form>

            {/* Histori mutasi cashbox terpilih */}
            <div style={{ padding: "16px" }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Riwayat Mutasi ({mutasiSelected.length})
              </div>
              {mutasiSelected.length === 0 ? (
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                  Belum ada riwayat mutasi.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {mutasiSelected.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px",
                        background: "var(--color-surface-container-low)",
                        borderRadius: 10,
                        fontSize: 13
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className={mutasiBadge(m.tipe)}>{m.tipe}</span>
                          {m.keterangan && (
                            <span style={{ color: "var(--color-text-secondary)" }}>{m.keterangan}</span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                          {m.tanggal?.slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                      <strong style={{
                        color: m.tipe === "tambah" ? "var(--color-primary)" : "var(--color-expense-red)"
                      }}>
                        {m.tipe === "tambah" ? "+" : "−"}{rupiah(m.jumlah)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
