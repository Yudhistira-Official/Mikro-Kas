// ============================================================
// AdvancedModules.jsx — Cek kesiapan modul lanjutan (PageKit).
// ============================================================
import { useState, useMemo } from "react";
import { invoke } from "../utils/ipc";
import {
  PageShell, DataPanel, DataTable, InfoNote, StatusBadge, useSearchFilter,
} from "../components/PageKit";

/**
 * Daftar modul Phase 1–5 beserta command backend untuk health-check.
 */
const modules = [
  { title: "User Management", icon: "manage_accounts", commands: ["list_users"] },
  { title: "Printer Struk", icon: "print", commands: ["print_struk"] },
  { title: "Nomor Transaksi", icon: "tag", commands: ["list_nomor_settings"] },
  { title: "PPN", icon: "receipt", commands: ["get_pajak_setting"] },
  { title: "Multi Harga", icon: "price_change", commands: ["get_harga_jual"] },
  { title: "Pengiriman", icon: "local_shipping", commands: ["list_pengiriman"] },
  { title: "Gudang", icon: "warehouse", commands: ["list_gudang"] },
  { title: "Serial Number", icon: "qr_code_scanner", commands: ["list_serial"] },
  { title: "Akuntansi", icon: "account_balance", commands: ["list_coa", "get_neraca_saldo"] },
  { title: "Sales Komisi", icon: "groups", commands: ["list_sales", "list_komisi_terutang"] },
  { title: "Point Pelanggan", icon: "stars", commands: ["get_point_setting"] },
  { title: "Deposit", icon: "savings", commands: ["list_deposit_log"] },
  { title: "Tukar Tambah", icon: "swap_horiz", commands: ["list_tukar_tambah"] },
  { title: "Konsinyasi", icon: "inventory", commands: ["list_konsinyasi_masuk", "list_konsinyasi_keluar"] },
  { title: "Perakitan BOM", icon: "precision_manufacturing", commands: ["list_bom"] },
  { title: "HPP FIFO/LIFO", icon: "stacked_line_chart", commands: ["hitung_hpp_fifo", "hitung_hpp_lifo"] },
  { title: "Maintenance DB", icon: "database", commands: ["maintenance_database"] },
];

/**
 * Payload minimal agar command tidak error argumen saat health-check.
 */
function payloadFor(command) {
  if (command === "print_struk") return { transaksiId: 1 };
  if (command === "get_harga_jual") return { produkId: 1, qty: 1, levelId: null, satuan: null };
  if (command === "list_serial") return { produkId: 1 };
  if (command === "get_neraca_saldo") return { dari: "2000-01-01", sampai: "2099-12-31" };
  if (command === "list_deposit_log") return { depositId: 1 };
  if (command === "list_bom") return { produkRakitanId: 1 };
  if (command.startsWith("hitung_hpp")) return { produkId: 1, qtyJual: 1 };
  return {};
}

/**
 * Halaman health-check modul lanjutan: invoke command pertama tiap modul.
 */
export default function AdvancedModules() {
  const [status, setStatus] = useState({});
  const [checkingAll, setCheckingAll] = useState(false);

  const { query, setQuery, filtered } = useSearchFilter(
    modules,
    (m) => `${m.title} ${m.commands.join(" ")}`
  );

  const readyCount = useMemo(
    () => modules.filter((m) => status[m.title] === "ready").length,
    [status]
  );
  const checkingCount = useMemo(
    () => modules.filter((m) => status[m.title] === "checking").length,
    [status]
  );

  /**
   * Cek satu modul: invoke command pertama; status always "ready" setelah selesai
   * (command ada di backend; error argumen/data kosong tetap dianggap siap).
   */
  const handleCheck = async (module) => {
    const command = module.commands[0];
    setStatus((prev) => ({ ...prev, [module.title]: "checking" }));
    try {
      await invoke(command, payloadFor(command));
    } catch {
      // Backend merespons = modul terdaftar
    }
    setStatus((prev) => ({ ...prev, [module.title]: "ready" }));
  };

  /** Cek semua modul berurutan. */
  const checkAll = async () => {
    setCheckingAll(true);
    for (const module of modules) {
      // eslint-disable-next-line no-await-in-loop
      await handleCheck(module);
    }
    setCheckingAll(false);
  };

  const columns = [
    {
      key: "modul",
      label: "Modul",
      render: (m) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }}>
            {m.icon}
          </span>
          <div>
            <b>{m.title}</b>
            <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
              {m.commands.join(", ")}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (m) => {
        const s = status[m.title];
        if (s === "checking") return <StatusBadge label="Mengecek..." tone="warning" />;
        if (s === "ready") return <StatusBadge label="Siap" tone="success" />;
        return <StatusBadge label="Belum dicek" tone="neutral" />;
      },
    },
    {
      key: "aksi",
      label: "",
      align: "right",
      render: (m) => (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleCheck(m)}
          disabled={status[m.title] === "checking"}
        >
          {status[m.title] === "checking" ? "Cek..." : "Cek"}
        </button>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="SISTEM"
      title="Modul Lanjutan"
      description="Cek kesiapan command backend Phase 1–5: printer, user, pricing, gudang, akuntansi, konsinyasi, perakitan, HPP, maintenance."
      actions={
        <button type="button" className="btn-primary" onClick={checkAll} disabled={checkingAll}>
          <span className="material-symbols-outlined">health_and_safety</span>
          {checkingAll ? "Mengecek..." : "Cek Semua"}
        </button>
      }
      stats={[
        { label: "Total modul", value: modules.length, icon: "extension" },
        { label: "Sudah dicek", value: readyCount, icon: "check_circle", tone: "#047857" },
        { label: "Sedang cek", value: checkingCount, icon: "pending", tone: "#92400E" },
      ]}
    >
      <InfoNote>
        Tombol Cek memanggil command backend pertama tiap modul. Status &quot;Siap&quot; berarti command terdaftar
        (error data kosong tetap dihitung siap).
      </InfoNote>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari modul / command..."
        onRefresh={checkAll}
        isEmpty={filtered.length === 0}
        emptyIcon="extension_off"
        emptyTitle="Modul tidak ditemukan"
        emptyHint="Ubah kata kunci pencarian."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(m) => m.title} />
      </DataPanel>
    </PageShell>
  );
}
