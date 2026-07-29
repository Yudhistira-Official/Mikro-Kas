import { useEffect, useState, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge,
  useSearchFilter,
} from "../components/PageKit";
import { VirtualDataTable } from "../components/VirtualDataTable";

export default function StockOpname() {
  const { addToast } = useToast();
  const [tab, setTab] = useState("baru");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ── Tab Baru ── */
  const [form, setForm] = useState({ namaToko: "", tanggal: "", petugas: "", penanggungJawab: "", catatan: "" });
  const [produkList, setProdukList] = useState([]);
  const [fisikMap, setFisikMap] = useState({});

  const loadAwal = useCallback(async () => {
    try {
      setLoading(true);
      const [toko, produk] = await Promise.all([
        invoke("get_toko"),
        invoke("list_produk", { onlyActive: true }),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      setForm({
        namaToko: toko?.nama_toko || "",
        tanggal: today,
        petugas: "",
        penanggungJawab: "",
        catatan: "",
      });
      setProdukList(produk);
    } catch (e) { addToast(`Gagal muat data: ${e}`, "error"); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void loadAwal(); }, [loadAwal]);

  const updateFisik = (produkId, fisik) => {
    setFisikMap((prev) => {
      const curr = prev[produkId] || { fisik: null, keterangan: "" };
      return { ...prev, [produkId]: { ...curr, fisik } };
    });
  };
  const updateKeterangan = (produkId, keterangan) => {
    setFisikMap((prev) => {
      const curr = prev[produkId] || { fisik: null, keterangan: "" };
      return { ...prev, [produkId]: { ...curr, keterangan } };
    });
  };

  const allSelisihList = produkList
    .filter((p) => fisikMap[p.id]?.fisik !== null && fisikMap[p.id]?.fisik !== undefined && fisikMap[p.id]?.fisik !== "")
    .map((p) => {
      const fisik = parseInt(fisikMap[p.id].fisik, 10);
      return { id: p.id, nama: p.nama, sku: p.sku, satuan: p.satuan, stok: p.stok, fisik, selisih: Number.isFinite(fisik) ? fisik - p.stok : 0 };
    });
  const selisihMasuk = allSelisihList.filter((x) => x.selisih > 0).reduce((s, x) => s + x.selisih, 0);
  const selisihKeluar = allSelisihList.filter((x) => x.selisih < 0).reduce((s, x) => s + Math.abs(x.selisih), 0);
  const berubah = allSelisihList.filter((x) => x.selisih !== 0).length;
  const totalInput = allSelisihList.length;

  const simpanOpname = async () => {
    if (!form.namaToko.trim()) return addToast("Nama toko wajib diisi", "error");
    if (!form.tanggal.trim()) return addToast("Tanggal wajib diisi", "error");
    if (!form.petugas.trim()) return addToast("Petugas wajib diisi", "error");
    if (totalInput === 0) return addToast("Input stok fisik minimal satu produk", "info");

    setSaving(true);
    try {
      const items = allSelisihList.map((x) => ({
        produkId: x.id,
        kodeBarang: x.sku || "",
        namaBarang: x.nama,
        satuan: x.satuan || "",
        stokSistem: x.stok,
        stokFisik: x.fisik,
        keterangan: fisikMap[x.id]?.keterangan || "",
      }));

      await invoke("create_stock_opname", {
        input: {
          namaToko: form.namaToko,
          tanggal: form.tanggal,
          petugas: form.petugas,
          penanggungJawab: form.penanggungJawab,
          catatan: form.catatan,
          items,
        },
      });

      addToast("Opname berhasil disimpan", "success");
      setFisikMap({});
      const refreshed = await invoke("list_produk", { onlyActive: true });
      setProdukList(refreshed);
    } catch (e) { addToast(`Gagal simpan: ${e}`, "error"); }
    finally { setSaving(false); }
  };

  const { query, setQuery, filtered } = useSearchFilter(
    produkList,
    (p) => `${p.nama || ""} ${p.sku || ""}`
  );

  const columnsBaru = [
    { key: "no", label: "No", width: 40, align: "center",
      render: (_, idx) => idx + 1,
    },
    { key: "kode", label: "Kode Barang", render: (p) => <span className="text-label-md">{p.sku || "—"}</span> },
    { key: "nama", label: "Nama Barang", render: (p) => <b>{p.nama}</b> },
    { key: "satuan", label: "Satuan", render: (p) => p.satuan || "—", align: "center" },
    { key: "sistem", label: "Stok Sistem", align: "center", render: (p) => p.stok },
    { key: "fisik", label: "Stok Fisik", align: "center",
      render: (p) => {
        const val = fisikMap[p.id]?.fisik !== undefined ? fisikMap[p.id].fisik : "";
        return (
          <input
            className="input-field"
            style={{ width: 72, textAlign: "center" }}
            type="number"
            inputMode="numeric"
            value={val}
            onChange={(e) => updateFisik(p.id, e.target.value.replace(/\D/g, ""))}
            placeholder="0"
          />
        );
      },
    },
    { key: "selisih", label: "Selisih", align: "center",
      render: (p) => {
        const val = fisikMap[p.id]?.fisik;
        if (val === undefined || val === null || val === "") return "—";
        const fisik = parseInt(val, 10);
        if (!Number.isFinite(fisik)) return "—";
        const selisih = fisik - p.stok;
        if (selisih === 0) return <StatusBadge label="0" tone="neutral" />;
        return <StatusBadge label={`${selisih > 0 ? "+" : ""}${selisih}`} tone={selisih > 0 ? "success" : "danger"} />;
      },
    },
    { key: "keterangan", label: "Keterangan",
      render: (p) => (
        <input
          className="input-field"
          style={{ width: 140 }}
          value={fisikMap[p.id]?.keterangan || ""}
          onChange={(e) => updateKeterangan(p.id, e.target.value)}
          placeholder="Rusak/hilang..."
        />
      ),
    },
  ];

  /* ── Tab Riwayat ── */
  const [riwayat, setRiwayat] = useState([]);
  const [detailModal, setDetailModal] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  const loadRiwayat = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke("list_stock_opname");
      setRiwayat(data);
    } catch (e) { addToast(`Gagal muat riwayat: ${e}`, "error"); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { if (tab === "riwayat") void loadRiwayat(); }, [tab, loadRiwayat]);

  const openDetail = async (id) => {
    try {
      const full = await invoke("get_stock_opname", { id });
      setDetailModal(full.header);
      setDetailItems(full.items);
    } catch (e) { addToast(`Gagal muat detail: ${e}`, "error"); }
  };

  const exportDocx = async (id, kode) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: `${kode}.docx`,
        filters: [{ name: "Word Document", extensions: ["docx"] }],
      });
      if (!path) return;
      await invoke("export_stock_opname_docx", { opnameId: id, savePath: path });
      addToast("DOCX berhasil disimpan", "success");
    } catch (e) { addToast(`Gagal export: ${e}`, "error"); }
  };

  const columnsRiwayat = [
    { key: "kode", label: "Kode", render: (r) => <b>{r.kode}</b> },
    { key: "tanggal", label: "Tanggal" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "petugas", label: "Petugas" },
    { key: "jumlah", label: "Item", align: "center", render: (r) => r.jumlah_item },
    { key: "kurang", label: "Selisih (-)", align: "center",
      render: (r) => r.total_selisih_kurang !== 0 ? <StatusBadge label={String(r.total_selisih_kurang)} tone="danger" /> : "—",
    },
    { key: "lebih", label: "Selisih (+)", align: "center",
      render: (r) => r.total_selisih_lebih !== 0 ? <StatusBadge label={`+${r.total_selisih_lebih}`} tone="success" /> : "—",
    },
    { key: "aksi", label: "Aksi",
      render: (r) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn-secondary" onClick={() => openDetail(r.id)}>
            Detail
          </button>
          <button type="button" className="btn-primary" onClick={() => exportDocx(r.id, r.kode)}>
            Export DOCX
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="STOK"
      title="Stock Opname"
      description="Buat opname stok fisik baru atau lihat riwayat opname yang sudah tersimpan."
    >
      <div className="tab-bar" style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid var(--color-border)" }}>
        {["baru", "riwayat"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "10px 16px", cursor: "pointer",
              background: tab === t ? "var(--color-bg-active)" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
              fontWeight: tab === t ? 600 : 400, marginBottom: -2,
              color: tab === t ? "var(--color-primary)" : "var(--color-text-secondary)",
            }}
          >
            {t === "baru" ? "Opname Baru" : "Riwayat"}
          </button>
        ))}
      </div>

      {tab === "baru" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <label className="input-label" style={{ flex: "1 1 200px" }}>
              Nama Toko / Cabang
              <input className="input-field" value={form.namaToko} onChange={(e) => setForm((f) => ({ ...f, namaToko: e.target.value }))} />
            </label>
            <label className="input-label" style={{ flex: "1 1 150px" }}>
              Hari / Tanggal
              <input className="input-field" type="date" value={form.tanggal} onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))} />
            </label>
            <label className="input-label" style={{ flex: "1 1 180px" }}>
              Nama Petugas / Kasir
              <input className="input-field" value={form.petugas} onChange={(e) => setForm((f) => ({ ...f, petugas: e.target.value }))} placeholder="Nama pemeriksa" />
            </label>
            <label className="input-label" style={{ flex: "1 1 180px" }}>
              Penanggung Jawab
              <input className="input-field" value={form.penanggungJawab} onChange={(e) => setForm((f) => ({ ...f, penanggungJawab: e.target.value }))} placeholder="Nama kepala toko" />
            </label>
            <label className="input-label" style={{ flex: "1 1 100%" }}>
              Catatan
              <input className="input-field" value={form.catatan} onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))} placeholder="Opsional" />
            </label>
          </div>

          <InfoNote>
            Input stok fisik per produk. Selisih dihitung otomatis (Fisik − Sistem). Hanya baris dengan selisih ≠ 0 yang menyesuaikan stok.
          </InfoNote>

          <DataPanel
            searchValue={query}
            onSearch={setQuery}
            searchPlaceholder="Cari kode/nama barang..."
            loading={loading}
            isEmpty={!loading && filtered.length === 0}
            emptyIcon="inventory"
            emptyTitle="Tidak ada produk"
            emptyHint="Aktifkan produk terlebih dulu."
          >
            <VirtualDataTable columns={columnsBaru} rows={filtered} rowKey={(p) => p.id} loading={loading} emptyMessage="Tidak ada produk" />
          </DataPanel>

          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" onClick={simpanOpname} disabled={saving || totalInput === 0}>
              {saving ? "Menyimpan..." : `Simpan Opname (${totalInput} item)`}
            </button>
            <span className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
              {berubah > 0 ? `${berubah} item berubah · +${selisihMasuk} / -${selisihKeluar}` : "Belum ada perubahan"}
            </span>
          </div>
        </>
      )}

      {tab === "riwayat" && (
        <DataPanel
          onRefresh={loadRiwayat}
          loading={loading}
          isEmpty={!loading && riwayat.length === 0}
          emptyIcon="history"
          emptyTitle="Belum ada opname"
          emptyHint="Buat opname baru di tab Opname Baru."
        >
          <VirtualDataTable columns={columnsRiwayat} rows={riwayat} loading={loading} emptyMessage="Belum ada opname" />
        </DataPanel>
      )}

      {detailModal && (
        <FormModal
          title={`Detail Opname: ${detailModal.kode}`}
          description={`${detailModal.nama_toko} · ${detailModal.tanggal} · ${detailModal.petugas}`}
          onClose={() => { setDetailModal(null); setDetailItems([]); }}
          submitLabel="Tutup"
          onSubmit={() => { setDetailModal(null); setDetailItems([]); }}
        >
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Kode</th>
                  <th>Nama</th>
                  <th>Sat</th>
                  <th>Sistem</th>
                  <th>Fisik</th>
                  <th>Selisih</th>
                  <th>Ket</th>
                </tr>
              </thead>
              <tbody>
                {detailItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td>{item.kode_barang}</td>
                    <td><b>{item.nama_barang}</b></td>
                    <td className="text-label-md">{item.satuan}</td>
                    <td style={{ textAlign: "center" }}>{item.stok_sistem}</td>
                    <td style={{ textAlign: "center" }}>{item.stok_fisik}</td>
                    <td style={{ textAlign: "center" }}>
                      {item.selisih !== 0 ? (
                        <StatusBadge label={String(item.selisih)} tone={item.selisih > 0 ? "success" : "danger"} />
                      ) : "0"}
                    </td>
                    <td className="text-label-md">{item.keterangan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailModal.catatan && (
              <p className="text-label-md" style={{ marginTop: 8, color: "var(--color-text-secondary)" }}>
                Catatan: {detailModal.catatan}
              </p>
            )}
          </div>
        </FormModal>
      )}
    </PageShell>
  );
}
