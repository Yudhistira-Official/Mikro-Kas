import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, InfoNote } from "../components/PageKit";
import { applyWindowMode, getUserWindowMode, setUserWindowMode } from "../utils/windowMode";
import { getPrinterPath, setPrinterPath } from "../utils/printerSettings";

export default function Sistem({ currentUser }) {
  const { addToast } = useToast();
  const [resetting, setResetting] = useState(false);
  const [windowMode, setWindowModeState] = useState(() => getUserWindowMode(currentUser?.id));
  const [printerPath, setPrinterPathState] = useState(() => getPrinterPath());
  const [printerCandidates, setPrinterCandidates] = useState([]);
  const [serialPorts, setSerialPorts] = useState([]);
  const [hardware, setHardware] = useState(null);
  const [hardwareLoading, setHardwareLoading] = useState(true);
  const [hardwareSaving, setHardwareSaving] = useState(false);
  const [detectingHardware, setDetectingHardware] = useState(false);
  const [hardwareStatus, setHardwareStatus] = useState("Menyiapkan deteksi perangkat...");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const isUserAdmin = currentUser?.role === "admin";

  const detectHardware = async () => {
    setDetectingHardware(true);
    setHardwareStatus("Mendeteksi perangkat...");
    try {
      const [settings, printers, ports] = await Promise.all([
        invoke("get_hardware_settings"),
        invoke("list_printer_candidates").catch(() => []),
        invoke("list_serial_scanner_ports").catch(() => []),
      ]);
      const candidates = Array.isArray(printers) ? printers : [];
      const detectedPrinter = candidates.find((item) => item.writable) || candidates[0];
      const rawWidth = Number(detectedPrinter?.paperWidth || detectedPrinter?.paper_width || detectedPrinter?.width || settings?.paperWidth || settings?.lebarKertas || 48);
      // Standar POS thermal: 32 (58mm) atau 48 (80mm) saja
      const detectedWidth = rawWidth <= 40 ? 32 : 48;
      const next = { ...(settings || {}), paperWidth: detectedWidth, lebarKertas: detectedWidth };
      setHardware(next);
      setPrinterCandidates(candidates);
      setSerialPorts(Array.isArray(ports) ? ports : []);
      setPrinterPathState(next.printerPath || detectedPrinter?.path || "");
      setHardwareStatus(detectedPrinter ? `Printer terdeteksi: ${detectedPrinter.name || detectedPrinter.path || "siap digunakan"}` : "Deteksi selesai; pilih perangkat secara manual bila diperlukan.");
    } catch {
      setHardwareStatus("Deteksi selesai dengan sebagian perangkat belum ditemukan.");
    } finally {
      setDetectingHardware(false);
      setHardwareLoading(false);
    }
  };

  useEffect(() => { void detectHardware(); }, []);

  const executeFactoryReset = async () => {
    setPasswordError("");
    setResetting(true);
    try {
      // Verifikasi password dulu lewat login_user
      await invoke("login_user", { username: currentUser.username, password });
      // Password OK, lanjut reset
      await invoke("factory_reset");
      setShowPasswordModal(false);
      addToast("Reset pabrik berhasil! Semua data sudah dihapus.", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      const msg = String(error);
      if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("salah")) {
        setPasswordError("Password salah. Coba lagi.");
      } else {
        addToast(`Gagal reset pabrik: ${error}`, "error");
        setShowPasswordModal(false);
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <PageShell eyebrow="PENGATURAN" title="Sistem" description="Kelola tampilan aplikasi, jendela, dan perangkat kasir.">

      <DataPanel isEmpty={false}>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <div><p className="text-headline-sm">Tampilan Jendela Aplikasi</p><p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Atur bagaimana aplikasi dibuka: jendela biasa atau fullscreen.</p></div>
          <div className="window-mode-options">
            <button type="button" className={`window-mode-card${windowMode === "windowed" ? " active" : ""}`} onClick={async () => { const next = setUserWindowMode(currentUser?.id, "windowed"); setWindowModeState(next); await applyWindowMode(next); addToast("Mode windowed disimpan", "success"); }}><span className="material-symbols-outlined">web_asset</span><strong>Windowed</strong><span>Jendela biasa dengan title bar OS</span></button>
            <button type="button" className={`window-mode-card${windowMode === "fullscreen" ? " active" : ""}`} onClick={async () => { const next = setUserWindowMode(currentUser?.id, "fullscreen"); setWindowModeState(next); await applyWindowMode(next); addToast("Mode fullscreen disimpan", "success"); }}><span className="material-symbols-outlined">fullscreen</span><strong>Fullscreen</strong><span>Layar penuh tanpa bingkai jendela</span></button>
          </div>
          <InfoNote>Preferensi disimpan di perangkat ini dan diterapkan otomatis saat aplikasi dibuka kembali.</InfoNote>
        </div>
      </DataPanel>

      <DataPanel isEmpty={false}>
        <div className="hardware-settings">
          <div className="hardware-settings__header"><div><p className="text-headline-sm">Hardware POS</p><p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Deteksi perangkat, periksa draft, lalu simpan setelah sesuai.</p></div><button type="button" className="btn-secondary" onClick={detectHardware} disabled={detectingHardware}>{detectingHardware ? "Mendeteksi..." : "Deteksi Ulang"}</button></div>
          <InfoNote>{hardwareStatus}</InfoNote>
          {hardwareLoading ? <div className="loading-page"><div className="spinner" /></div> : hardware && <>
            <section className="hardware-card"><h3>Printer</h3><p className="text-label-md">Lebar kertas mengikuti printer terdeteksi; ubah bila perlu.</p><label className="input-label">Path / Port<input className="input-field" list="printer-candidates" value={printerPath} onChange={(e) => setPrinterPathState(e.target.value)} placeholder="Auto-detect" /><datalist id="printer-candidates">{printerCandidates.map((c) => <option key={c.path} value={c.path}>{c.writable ? "siap tulis" : "terdeteksi"}</option>)}</datalist></label><label className="input-label">Lebar kertas (karakter)
                <select
                  className="input-field"
                  value={Number(hardware.paperWidth ?? hardware.lebarKertas ?? 48) <= 40 ? 32 : 48}
                  onChange={(e) => {
                    const w = Number(e.target.value) <= 40 ? 32 : 48;
                    setHardware((v) => ({ ...v, paperWidth: w, lebarKertas: w }));
                  }}
                >
                  <option value={32}>32 karakter (58mm)</option>
                  <option value={48}>48 karakter (80mm)</option>
                </select>
              </label></section>
            <section className="hardware-card"><h3>Scanner</h3><label className="input-label"><input type="checkbox" checked={hardware.scannerEnabled ?? hardware.scanner_enabled ?? true} onChange={(e) => setHardware((v) => ({ ...v, scannerEnabled: e.target.checked }))} /> Scanner HID aktif</label><label className="input-label">Minimum panjang barcode<input className="input-field" type="number" min="1" value={hardware.scannerMinLength ?? 3} onChange={(e) => setHardware((v) => ({ ...v, scannerMinLength: Number(e.target.value) }))} /></label><label className="input-label">Port serial scanner<input className="input-field" list="serial-scanner-ports" value={hardware.scannerPort ?? ""} onChange={(e) => setHardware((v) => ({ ...v, scannerPort: e.target.value }))} placeholder="Kosong = HID" /><datalist id="serial-scanner-ports">{serialPorts.map((port) => <option key={port} value={port} />)}</datalist></label>{hardware.scannerPort && <label className="input-label">Baud rate<input className="input-field" type="number" min="1200" value={hardware.scannerBaudRate ?? 9600} onChange={(e) => setHardware((v) => ({ ...v, scannerBaudRate: Number(e.target.value) }))} /></label>}</section>
            <section className="hardware-card"><h3>Customer Display</h3><label className="input-label">Mode<select className="input-field" value={hardware.displayType ?? "none"} onChange={(e) => setHardware((v) => ({ ...v, displayType: e.target.value }))}><option value="none">Tidak digunakan</option><option value="window">Jendela kedua</option><option value="serial">Serial / USB</option></select></label><p className="text-label-md">Mode jendela memakai layar kedua; mode serial membutuhkan port perangkat.</p></section>
            <div className="hardware-settings__actions"><button type="button" className="btn-primary" disabled={hardwareSaving} onClick={async () => { setHardwareSaving(true); try { setPrinterPath(printerPath); await invoke("set_hardware_settings", { settings: hardware }); addToast("Pengaturan hardware disimpan", "success"); } catch (e) { addToast("Gagal menyimpan pengaturan hardware", "error"); } finally { setHardwareSaving(false); } }}>{hardwareSaving ? "Menyimpan..." : "Simpan Pengaturan Hardware"}</button><button type="button" className="btn-secondary" disabled={hardwareSaving} onClick={async () => { try { await invoke("test_print_struk", { printerPath: printerPath || null }); addToast("Test print dikirim", "success"); } catch { addToast("Test print gagal dikirim", "error"); } }}>Test Print</button></div>
          </>}
        </div>
      </DataPanel>

      {/* Reset Pabrik — hanya untuk admin */}
      {isUserAdmin && (
        <DataPanel isEmpty={false}>
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="text-headline-sm" style={{ color: "var(--color-expense-red)" }}>Reset Pabrik</p>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>
              Hapus semua data transaksi, produk, customer, supplier, dan setup. Data user tetap ada.
            </p>
            <InfoNote>Pastikan sudah backup data sebelum melanjutkan.</InfoNote>
            <button type="button" className="btn-secondary" onClick={() => setShowConfirmModal(true)} disabled={resetting}
              style={{ color: "var(--color-expense-red)", border: "1px solid var(--color-expense-red)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_sweep</span>
              {resetting ? "Menghapus..." : "Reset Pabrik"}
            </button>
          </div>
        </DataPanel>
      )}

      {/* Step 1: Konfirmasi */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-expense-red)", display: "block", marginBottom: 12 }}>warning</span>
            <h3 className="text-headline-md" style={{ marginBottom: 6 }}>Apakah kamu yakin?</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginBottom: 20 }}>
              Aksi ini tidak dapat diulang, pastikan kamu backup dulu.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowConfirmModal(false)}>Batal</button>
              <button type="button" className="btn-secondary" style={{ flex: 1, color: "var(--color-expense-red)", border: "1px solid var(--color-expense-red)" }}
                onClick={() => { setShowConfirmModal(false); setPassword(""); setPasswordError(""); setShowPasswordModal(true); }}>
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Verifikasi password */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => !resetting && setShowPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3 className="text-headline-md" style={{ marginBottom: 4 }}>Konfirmasi Password</h3>
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginBottom: 16 }}>
              Masukkan password akun <strong>{currentUser?.username}</strong> untuk melanjutkan.
            </p>
            <input
              className={`input-field${passwordError ? " input-field--error" : ""}`}
              type="password"
              placeholder="Password"
              value={password}
              autoFocus
              onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") executeFactoryReset(); }}
              style={{ marginBottom: 4 }}
            />
            {passwordError && <p style={{ color: "var(--color-expense-red)", fontSize: 12, marginBottom: 12 }}>{passwordError}</p>}
            {!passwordError && <div style={{ marginBottom: 12 }} />}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowPasswordModal(false)} disabled={resetting}>Batal</button>
              <button type="button" className="btn-secondary" style={{ flex: 1, color: "var(--color-expense-red)", border: "1px solid var(--color-expense-red)" }}
                onClick={executeFactoryReset} disabled={resetting || !password}>
                {resetting ? "Memverifikasi..." : "Reset Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
