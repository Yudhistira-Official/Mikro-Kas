// ============================================================
// NomorTransaksi.jsx — Format penomoran otomatis (PageKit).
//
// Commands: list_nomor_settings, update_nomor_setting, generate_nomor
// ============================================================
import { useEffect, useState, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import SearchSelect from "../components/SearchSelect";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter,
} from "../components/PageKit";

const resetLabels = { none: "Tidak reset", monthly: "Setiap bulan", yearly: "Setiap tahun" };

/**
 * Preview nomor dari prefix + digit_run + current_number (tanpa side-effect).
 */
function previewNomor(item) {
  const dig = Math.max(1, Math.min(12, Number(item.digit_run) || 1));
  const num = String(Number(item.current_number) || 1).padStart(dig, "0");
  return `${item.prefix || ""}${num}`;
}

/**
 * Halaman pengaturan nomor transaksi: format, counter, reset, generate.
 */
export default function NomorTransaksi() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ prefix: "", digit_run: 4, reset_period: "none" });
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke("list_nomor_settings");
      setSettings(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const { query, setQuery, filtered } = useSearchFilter(
    settings,
    (s) => `${s.tipe || ""} ${s.prefix || ""} ${s.reset_period || ""}`
  );

  /** Buka modal edit format nomor. */
  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      prefix: item.prefix || "",
      digit_run: item.digit_run ?? 4,
      reset_period: item.reset_period || "none",
    });
  };

  /** Simpan format nomor via update_nomor_setting. */
  const save = async (e) => {
    e.preventDefault();
    if (!editItem) return;
    const digitRun = Number(form.digit_run);
    if (!form.prefix.trim()) return addToast("Prefix wajib diisi", "error");
    if (!digitRun || digitRun < 1 || digitRun > 12) return addToast("Digit nomor harus 1-12", "error");
    setSaving(true);
    try {
      await invoke("update_nomor_setting", {
        req: {
          tipe: editItem.tipe,
          prefix: form.prefix.trim(),
          digit_run: digitRun,
          reset_period: form.reset_period,
        },
      });
      addToast(`Format ${editItem.tipe} diperbarui`, "success");
      setEditItem(null);
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Generate nomor berikutnya (side-effect: increment counter di DB).
   */
  const generate = async (tipe) => {
    setGenerating(tipe);
    try {
      const nomor = await invoke("generate_nomor", { tipe });
      setResult({ tipe, nomor });
      addToast("Nomor berhasil di-generate", "success");
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setGenerating(null);
    }
  };

  const columns = [
    {
      key: "tipe",
      label: "Tipe",
      render: (item) => (
        <div>
          <b style={{ textTransform: "capitalize" }}>{String(item.tipe || "").replace(/_/g, " ")}</b>
          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
            Counter: {item.current_number}
          </div>
        </div>
      ),
    },
    {
      key: "format",
      label: "Format",
      render: (item) => (
        <code style={{ fontSize: 12 }}>
          {item.prefix}
          {"0".repeat(Math.max(0, Number(item.digit_run) || 0)).slice(0, 4) || "####"}
        </code>
      ),
    },
    {
      key: "preview",
      label: "Preview",
      render: (item) => <b>{previewNomor(item)}</b>,
    },
    {
      key: "reset",
      label: "Reset",
      render: (item) => (
        <StatusBadge
          label={resetLabels[item.reset_period] || item.reset_period}
          tone={item.reset_period === "none" ? "neutral" : "primary"}
        />
      ),
    },
    {
      key: "aksi",
      label: "",
      align: "right",
      render: (item) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12, padding: "4px 10px", minHeight: 0 }}
            onClick={() => generate(item.tipe)}
            disabled={generating === item.tipe}
          >
            {generating === item.tipe ? "..." : "Generate"}
          </button>
          <button type="button" className="btn-icon" onClick={() => openEdit(item)} title="Edit">
            <span className="material-symbols-outlined">edit</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="PENGATURAN"
      title="Nomor Transaksi"
      description="Atur prefix, jumlah digit, dan periode reset counter untuk setiap tipe transaksi."
      stats={[
        { label: "Tipe nomor", value: settings.length, icon: "tag" },
        {
          label: "Reset bulanan",
          value: settings.filter((s) => s.reset_period === "monthly").length,
          icon: "calendar_month",
        },
      ]}
    >
      <InfoNote>
        Prefix + digit menentukan format (contoh INV0001). Generate mengambil nomor berikutnya dan menaikkan counter.
        Reset bulanan/tahunan mengembalikan counter ke 1 pada periode baru.
      </InfoNote>

      {result && (
        <div className="card" style={{ marginBottom: 12, background: "var(--color-primary-fixed)" }}>
          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
            Nomor terakhir di-generate ({result.tipe})
          </div>
          <strong style={{ fontSize: 22, letterSpacing: "0.04em" }}>{result.nomor}</strong>
        </div>
      )}

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari tipe / prefix..."
        onRefresh={load}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon="tag"
        emptyTitle="Belum ada pengaturan nomor"
        emptyHint="Data nomor diisi otomatis saat migrasi database."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(s) => s.id} />
      </DataPanel>

      {editItem && (
        <FormModal
          title={`Edit: ${String(editItem.tipe).replace(/_/g, " ")}`}
          description="Ubah prefix, digit, dan periode reset. Counter saat ini tidak diubah."
          onClose={() => setEditItem(null)}
          onSubmit={save}
          submitLabel="Simpan Format"
          submitting={saving}
        >
          <label className="input-label">Prefix *</label>
          <input
            className="input-field"
            value={form.prefix}
            onChange={(e) => setForm((p) => ({ ...p, prefix: e.target.value }))}
            placeholder="Contoh: INV"
            autoFocus
          />
          <label className="input-label">Jumlah Digit * (1–12)</label>
          <input
            className="input-field"
            type="number"
            min={1}
            max={12}
            value={form.digit_run}
            onChange={(e) => setForm((p) => ({ ...p, digit_run: e.target.value }))}
          />
          <label className="input-label">Reset Counter</label>
          <SearchSelect
            value={form.reset_period}
            onChange={(value) => setForm((p) => ({ ...p, reset_period: value }))}
            options={[{ value: "none", label: "Tidak reset" }, { value: "monthly", label: "Setiap bulan" }, { value: "yearly", label: "Setiap tahun" }]}
            placeholder="Pilih periode"
          />
          <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 8 }}>
            Preview: <b>{previewNomor({ ...editItem, ...form, digit_run: Number(form.digit_run) })}</b>
          </p>
        </FormModal>
      )}
    </PageShell>
  );
}
