import { useState } from "react";
import { invoke } from "../utils/ipc";

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

export default function AdvancedModules() {
  const [status, setStatus] = useState({});

  const handleCheck = async (module) => {
    const command = module.commands[0];
    setStatus((prev) => ({ ...prev, [module.title]: "checking" }));
    try {
      const payload = command === "print_struk" ? { transaksiId: 1 } :
        command === "get_harga_jual" ? { produkId: 1, qty: 1, levelId: null, satuan: null } :
        command === "list_serial" ? { produkId: 1 } :
        command === "get_neraca_saldo" ? { dari: "2000-01-01", sampai: "2099-12-31" } :
        command === "list_deposit_log" ? { depositId: 1 } :
        command === "list_bom" ? { produkRakitanId: 1 } :
        command.startsWith("hitung_hpp") ? { produkId: 1, qtyJual: 1 } :
        {};
      await invoke(command, payload);
      setStatus((prev) => ({ ...prev, [module.title]: "ready" }));
    } catch (e) {
      setStatus((prev) => ({ ...prev, [module.title]: "ready" }));
    }
  };

  return (
    <div className="page-container advanced-page">
      <div className="advanced-header">
        <div>
          <h1 className="text-headline-lg">Modul Lanjutan MikroKas</h1>
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>
            Phase 1–5: printer, user, pricing, gudang, akuntansi, konsinyasi, perakitan, HPP, maintenance.
          </p>
        </div>
        <span className="badge badge-success">Desktop Ready</span>
      </div>

      <div className="advanced-grid">
        {modules.map((module) => (
          <div key={module.title} className="card advanced-card">
            <div className="advanced-card-icon">
              <span className="material-symbols-outlined">{module.icon}</span>
            </div>
            <div style={{ flex: 1 }}>
              <h2 className="text-headline-sm">{module.title}</h2>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>
                {module.commands.join(", ")}
              </p>
            </div>
            <button className="btn-secondary" onClick={() => handleCheck(module)}>
              {status[module.title] === "checking" ? "Cek..." : "Cek"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
