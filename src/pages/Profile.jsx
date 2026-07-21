// ============================================================
// Profile.jsx — Hub menu dengan kotak fitur utama & sekunder.
//
// Struktur:
//   - Header: avatar toko + nama aplikasi.
//   - Fitur Utama: 2x2 grid kartu besar (Produk, Manajemen Keuangan,
//     Laporan, Cetak QRIS) dengan ikon primary navy.
//   - Fitur Sekunder: grid 2 kolom kartu ringkas untuk menu lainnya.
//   - Versi aplikasi di bawah.
// Design ref: Stitch — "Profil & Fitur MikroKas" (Kinetic Ledger).
// ============================================================
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import LogoMark from "../components/LogoMark";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

// Empat fitur utama yang paling sering dipakai.
const mainItems = [
  { path: "/produk", label: "Produk", icon: "inventory_2", desc: "Kelola stok dan harga" },
  { path: "/keuangan", label: "Manajemen Keuangan Toko", icon: "account_balance", desc: "Pemasukan & pengeluaran" },
  { path: "/laporan", label: "Laporan", icon: "description", desc: "Cetak laporan penjualan" },
  { path: "/qris", label: "Cetak QRIS", icon: "qr_code_2", desc: "Generate QR pembayaran" },
];

// Menu pendukung lainnya.
const secondaryItems = [
  { path: "/pembelian", label: "Pembelian", icon: "add_shopping_cart" },
  { path: "/riwayat-pembelian", label: "Riwayat Pembelian", icon: "local_shipping" },
  { path: "/riwayat", label: "Riwayat Penjualan", icon: "receipt_long" },
  { path: "/retur", label: "Retur Penjualan", icon: "assignment_return" },
  { path: "/promo", label: "Promo & Marketing", icon: "sell" },
  { path: "/riwayat-stok", label: "Riwayat Audit Stok", icon: "inventory" },
  { path: "/stock-opname", label: "Stock Opname", icon: "checklist" },
  { path: "/shift", label: "Shift Management", icon: "schedule" },
  { path: "/customer", label: "Customer", icon: "group" },
  { path: "/pesanan", label: "Pesanan Pelanggan", icon: "assignment" },
  { path: "/supplier", label: "Supplier", icon: "local_shipping" },
  { path: "/hutang-piutang", label: "Hutang & Piutang", icon: "payments" },
  { path: "/cashbox", label: "Cashbox", icon: "account_balance_wallet" },
  { path: "/backup-restore", label: "Backup & Restore", icon: "backup" },
  { path: "/toko", label: "Atur QRIS", icon: "settings" },
  { path: "/log", label: "Log Aplikasi", icon: "bug_report" },
];

// Kartu fitur utama — latar putih, ikon navy, ukuran besar.
const cardBase = {
  background: "var(--color-surface)",
  borderRadius: "12px",
  border: "1px solid var(--color-surface-border)",
  padding: "1rem",
  boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
  textDecoration: "none",
  color: "inherit",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  minHeight: "100px",
};

const iconWrap = {
  width: "40px",
  height: "40px",
  borderRadius: "10px",
  background: "linear-gradient(135deg, #7C3AED, #A78BFA)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#ffffff",
};

// Kartu sekunder — lebih ringkas, ikon outline abu.
const secondaryCard = {
  background: "var(--color-surface)",
  borderRadius: "12px",
  border: "1px solid var(--color-surface-border)",
  padding: "0.875rem",
  textDecoration: "none",
  color: "inherit",
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const secondaryIcon = {
  width: "32px",
  height: "32px",
  borderRadius: "8px",
  background: "linear-gradient(135deg, #7C3AED, #A78BFA)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#ffffff",
  flexShrink: 0,
};

export default function Profile() {
  const { addToast } = useToast();
  const [pins, setPins] = useState([]);
  const [newPin, setNewPin] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);

  // Load PIN list saat mount
  useEffect(() => {
    invoke("list_kasir_pins")
      .then(setPins)
      .catch(() => {});
  }, []);

  const handleSetPin = async () => {
    if (newPin.length < 4 || newPin.length > 6) {
      addToast("PIN harus 4-6 digit", "error");
      return;
    }
    try {
      await invoke("set_kasir_pin", { pin: newPin, role: "kasir" });
      addToast("PIN kasir berhasil disimpan", "success");
      setNewPin("");
      setShowPinInput(false);
      const updated = await invoke("list_kasir_pins");
      setPins(updated);
    } catch (e) {
      addToast(`Gagal simpan PIN: ${e}`, "error");
    }
  };

  const handleDeletePin = async (id) => {
    try {
      await invoke("delete_kasir_pin", { id });
      addToast("PIN kasir dihapus", "success");
      const updated = await invoke("list_kasir_pins");
      setPins(updated);
    } catch (e) {
      addToast(`Gagal hapus PIN: ${e}`, "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header toko */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "0.5rem 0 0.25rem" }}>
        <LogoMark size={56} />
        <div>
          <p className="text-headline-sm">MikroKas</p>
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>Aplikasi kasir UMKM</p>
        </div>
      </div>

      {/* Fitur Utama — 2x2 grid */}
      <div>
        <p className="text-label-md" style={{ color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem", fontWeight: 600 }}>Fitur Utama</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          {mainItems.map((item) => (
            <NavLink key={item.path} to={item.path} style={cardBase} className="list-dense-item">
              <div style={iconWrap}>
                <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>{item.icon}</span>
              </div>
              <p className="text-headline-sm" style={{ fontSize: "14px", lineHeight: "1.3" }}>{item.label}</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{item.desc}</p>
            </NavLink>
          ))}
        </div>
      </div>

      {/* Fitur Sekunder — grid 2 kolom */}
      <div>
        <p className="text-label-md" style={{ color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem", fontWeight: 600 }}>Lainnya</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
          {secondaryItems.map((item) => (
            <NavLink key={item.path} to={item.path} style={secondaryCard} className="list-dense-item">
              <div style={secondaryIcon}>
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>{item.icon}</span>
              </div>
              <span className="text-body-md" style={{ fontSize: "13px", fontWeight: 500 }}>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* PIN Kasir Management */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-primary)", fontSize: "20px" }}>lock</span>
          <p className="text-headline-sm" style={{ fontSize: "16px", fontWeight: 600 }}>PIN Kasir</p>
        </div>
        <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginBottom: "1rem", fontSize: "13px" }}>
          {pins.length > 0 ? "PIN aktif untuk keamanan kasir" : "Belum ada PIN diatur"}
        </p>
        {pins.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            {pins.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--color-surface-container)", borderRadius: "8px", marginBottom: "8px" }}>
                <span className="text-body-md" style={{ fontSize: "14px" }}>PIN {p.role}</span>
                <button onClick={() => handleDeletePin(p.id)} className="btn-secondary" style={{ padding: "4px 12px", fontSize: "12px", color: "var(--color-expense-red)" }}>Hapus</button>
              </div>
            ))}
          </div>
        )}
        {showPinInput ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              placeholder="4-6 digit PIN"
              className="input-field"
              style={{ flex: 1 }}
              autoFocus
            />
            <button onClick={handleSetPin} className="btn-primary" style={{ padding: "8px 16px" }}>Simpan</button>
            <button onClick={() => { setShowPinInput(false); setNewPin(""); }} className="btn-secondary" style={{ padding: "8px 12px" }}>Batal</button>
          </div>
        ) : (
          <button onClick={() => setShowPinInput(true)} className="btn-primary" style={{ width: "100%", padding: "10px" }}>
            {pins.length > 0 ? "Ubah PIN" : "Atur PIN Kasir"}
          </button>
        )}
      </div>

      {/* Versi */}
      <p className="text-label-md" style={{ textAlign: "center", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
        MikroKas v2.0.0
      </p>
    </div>
  );
}
