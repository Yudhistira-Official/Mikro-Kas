import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, DataTable, FormModal, StatusBadge, useSearchFilter } from "../components/PageKit";
import { VirtualDataTable } from "../components/VirtualDataTable";
import SearchSelect from "../components/SearchSelect";
import PinGate from "../components/PinGate";

const JENIS_GUDANG = [
  { value: "gudang", label: "Gudang Penyimpanan" },
  { value: "retail", label: "Toko/Kasir Retail" },
  { value: "mobile", label: "Mobile Canvas" },
];

const jenisLabel = (value) => JENIS_GUDANG.find((item) => item.value === value)?.label || value;

/**
 * Gudang — CRUD lokasi penyimpanan stok (PageKit).
 */
export default function Gudang() {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [headerStats, setHeaderStats] = useState({ total: 0, default_count: 0, punya_alamat: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nama: "", alamat: "", jenis: "gudang", catatan: "", is_active: true });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletePinOpen, setDeletePinOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setList(await invoke("list_gudang"));
      const s = await invoke("get_gudang_stats").catch(() => null);
      if (s) setHeaderStats({ total: Number(s.total||0), default_count: Number(s.default_count||0), punya_alamat: Number(s.punya_alamat||0) }); }
    catch (error) { const _m=String(error); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const { query, setQuery, filtered } = useSearchFilter(list, (g) => `${g.kode || ""} ${g.nama} ${g.alamat || ""} ${jenisLabel(g.jenis)} ${g.catatan || ""} ${g.is_active ? "aktif" : "nonaktif"}`);

  const openForm = (item = null) => {
    setEditing(item);
    setForm(item ? { nama: item.nama, alamat: item.alamat || "", jenis: item.jenis || "gudang", catatan: item.catatan || "", is_active: item.is_active !== false } : { nama: "", alamat: "", jenis: "gudang", catatan: "", is_active: true });
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.nama.trim()) return addToast("Nama gudang wajib diisi", "error");
    try {
      if (editing) {
        const oldData = { ...editing };
        await invoke("update_gudang", { id: editing.id, nama: form.nama, alamat: form.alamat || null, jenis: form.jenis, catatan: form.catatan || null, is_active: form.is_active });
        addToast("Gudang diperbarui", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("update_gudang", { id: oldData.id, nama: oldData.nama, alamat: oldData.alamat, jenis: oldData.jenis, catatan: oldData.catatan, is_active: oldData.is_active });
            load();
          },
        });
      } else {
        const createdId = await invoke("create_gudang", { nama: form.nama, alamat: form.alamat || null, jenis: form.jenis, catatan: form.catatan || null });
        addToast("Gudang ditambahkan", "success", {
          label: "Urungkan",
          action: async () => {
            await invoke("delete_gudang", { id: createdId });
            load();
          },
        });
      }
      setShowForm(false);
      load();
    } catch (error) { const _m=String(error); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }
  };

  const [confirmNonaktif, setConfirmNonaktif] = useState(null);

  const nonaktifkan = async (item) => {
    setConfirmNonaktif(null);
    const snapshot = { ...item };
    try {
      await invoke("delete_gudang", { id: item.id });
      addToast("Gudang dinonaktifkan", "success", {
        label: "Urungkan",
        action: async () => {
          await invoke("create_gudang", { nama: snapshot.nama, alamat: snapshot.alamat, jenis: snapshot.jenis, catatan: snapshot.catatan });
          load();
        },
      });
      load();
    } catch (error) { const _m=String(error); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }
  };

  const columns = [
    {
      key: "nama",
      label: "Gudang",
      render: (g) => (
        <div className="sales-name">
          <span className="sales-avatar"><span className="material-symbols-outlined" style={{ fontSize: 18 }}>warehouse</span></span>
           <span><strong>{g.nama}</strong><small>{g.kode || `ID: ${g.id}`} · {jenisLabel(g.jenis)}</small></span>
        </div>
      ),
    },
    { key: "alamat", label: "Alamat / Cabang", render: (g) => g.alamat || "-" },
    { key: "catatan", label: "Catatan", render: (g) => g.catatan || "-" },
    {
      key: "status",
      label: "Status",
      render: (g) => <StatusBadge label={g.is_default ? "Default" : g.is_active ? "Aktif" : "Nonaktif"} tone={g.is_default ? "primary" : g.is_active ? "success" : "danger"} />,
    },
    {
      key: "aksi",
      label: "Aksi",
      render: (g) => (
        <div className="sales-row-actions">
          <button type="button" className="btn-icon" onClick={() => openForm(g)} title="Edit">
            <span className="material-symbols-outlined">edit</span>
          </button>
           <button type="button" className="btn-icon" onClick={() => setConfirmNonaktif(g)} title="Nonaktifkan" disabled={g.is_default}>
             <span className="material-symbols-outlined" style={{ color: "#dc2626", fontWeight: 700 }}>close</span>
           </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="MASTER DATA"
      title="Departemen / Gudang"
      description="Kelola lokasi penyimpanan stok. Gudang default menjadi lokasi utama transaksi."
      actions={
        <button type="button" className="btn-primary" onClick={() => openForm()}>
          <span className="material-symbols-outlined">add_business</span>Tambah Gudang
        </button>
      }
      stats={[
        { label: "Total Gudang", value: headerStats.total, icon: "warehouse" },
        { label: "Gudang Default", value: headerStats.default_count, icon: "home_work" },
        { label: "Dengan Alamat", value: headerStats.punya_alamat, icon: "location_on" },
      ]}
    >
      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari nama atau alamat gudang..."
        onRefresh={load}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon="warehouse"
        emptyTitle="Belum ada gudang"
        emptyHint="Klik Tambah Gudang untuk menambah lokasi stok."
      >
        <VirtualDataTable columns={columns} rows={filtered} rowKey={(g) => g.id} loading={loading} emptyMessage="Belum ada gudang" />
      </DataPanel>

      {showForm && (
        <FormModal
          title={editing ? "Edit Gudang" : "Tambah Gudang"}
          description="Tentukan lokasi penyimpanan stok."
          onClose={() => setShowForm(false)}
          onSubmit={save}
        >
          <label className="input-label">Kode Dept/Gudang</label>
          <input className="input-field" value={editing ? editing.kode || "" : "Dibuat otomatis oleh sistem"} readOnly />
          <label className="input-label">Nama / Keterangan *</label>
          <input className="input-field" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} autoFocus />
          <label className="input-label">Alamat / Cabang</label>
          <input className="input-field" value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} />
          <label className="input-label">Fungsi / Jenis</label>
          <SearchSelect value={form.jenis} onChange={(value) => setForm({ ...form, jenis: value })} options={JENIS_GUDANG} placeholder="Pilih jenis lokasi" />
          <label className="input-label">Status Aktif</label>
          <SearchSelect value={form.is_active ? "aktif" : "nonaktif"} onChange={(value) => setForm({ ...form, is_active: value === "aktif" })} options={[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]} placeholder="Pilih status" disabled={editing?.is_default} />
          <label className="input-label">Keterangan Tambahan / Catatan</label>
          <textarea className="input-field" rows={3} value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
          {editing && !editing.is_default && !editing.is_active && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--color-surface-border)", paddingTop: 16 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "100%", justifyContent: "center", color: "var(--color-error)", borderColor: "var(--color-error)" }}
                onClick={() => setPendingDelete(editing)}
              >
                Hapus Gudang dari Database
              </button>
            </div>
          )}
        </FormModal>
      )}

      {pendingDelete && (
        <FormModal
          title="Hapus Permanen Gudang"
          description={`Yakin ingin menghapus gudang "${pendingDelete.nama}" dari database?`}
          onClose={() => setPendingDelete(null)}
          submitLabel="Ya, Hapus"
          onSubmit={() => setDeletePinOpen(true)}
        >
          <p className="text-body-md" style={{ color: "var(--color-error)", fontWeight: 600 }}>Tindakan ini tidak bisa dibatalkan.</p>
        </FormModal>
      )}

      {deletePinOpen && pendingDelete && (
        <PinGate role="admin" autoSuccess onCancel={() => { setDeletePinOpen(false); setPendingDelete(null); }} onSuccess={async () => {
          const item = pendingDelete;
          setDeletePinOpen(false);
          setPendingDelete(null);
          try {
            await invoke("hapus_gudang_permanen", { id: item.id });
            addToast("Gudang dihapus permanen", "info");
            setShowForm(false);
            load();
          } catch (e) { { const _m=String(e); if(!_m.includes("no such table")&&!_m.includes("no such column")) addToast(_m,"error"); }; }
        }} />
      )}

      {confirmNonaktif && (
        <FormModal
          title="Nonaktifkan Gudang"
          description={`Yakin ingin menonaktifkan gudang "${confirmNonaktif.nama}"?`}
          onClose={() => setConfirmNonaktif(null)}
          submitLabel="Ya"
          onSubmit={() => nonaktifkan(confirmNonaktif)}
        >
          <p className="text-body-md">Data stok tetap tersimpan.</p>
        </FormModal>
      )}
    </PageShell>
  );
}
