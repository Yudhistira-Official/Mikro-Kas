import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { PageShell, DataPanel, InfoNote } from "../components/PageKit";
import { applyWindowMode, getWindowMode, setWindowMode } from "../utils/windowMode";
import { getPrinterPath, setPrinterPath } from "../utils/printerSettings";

export default function Sistem() {
  const { addToast } = useToast();
  const [windowMode, setWindowModeState] = useState(() => getWindowMode());
  const [theme, setTheme] = useState("light");
  const [printerPath, setPrinterPathState] = useState(() => getPrinterPath());
  const [printerCandidates, setPrinterCandidates] = useState([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    invoke("list_printer_candidates")
      .then((list) => setPrinterCandidates(Array.isArray(list) ? list : []))
      .catch(() => setPrinterCandidates([]));
  }, [theme]);

  const chooseTheme = (next) => {
    setTheme(next);
    localStorage.setItem("mikrokas_theme", next);
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event("theme-changed"));
    addToast(`Tema ${next === "light" ? "terang" : "gelap"} dipilih`, "success");
  };

  return (
    <PageShell eyebrow="PENGATURAN" title="Sistem" description="Kelola tampilan aplikasi, jendela, dan perangkat kasir.">
      <DataPanel isEmpty={false}>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <div><p className="text-headline-sm">Tema Aplikasi</p><p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Atur tampilan dasar aplikasi pada perangkat ini.</p></div>
          <div className="theme-options">
            {[["light", "light_mode", "Terang"], ["dark", "dark_mode", "Gelap"]].map(([value, icon, label]) => (
              <button
                key={value}
                type="button"
                className={`theme-card${theme === value ? " active" : ""}`}
                onClick={() => chooseTheme(value)}
              >
                <span className="material-symbols-outlined">{icon}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
        </div>
      </DataPanel>

      <DataPanel isEmpty={false}>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <div><p className="text-headline-sm">Tampilan Jendela Aplikasi</p><p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Atur bagaimana aplikasi dibuka: jendela biasa atau fullscreen.</p></div>
          <div className="window-mode-options">
            <button type="button" className={`window-mode-card${windowMode === "windowed" ? " active" : ""}`} onClick={async () => { const next = setWindowMode("windowed"); setWindowModeState(next); await applyWindowMode(next); addToast("Mode windowed disimpan", "success"); }}><span className="material-symbols-outlined">web_asset</span><strong>Windowed</strong><span>Jendela biasa dengan title bar OS</span></button>
            <button type="button" className={`window-mode-card${windowMode === "fullscreen" ? " active" : ""}`} onClick={async () => { const next = setWindowMode("fullscreen"); setWindowModeState(next); await applyWindowMode(next); addToast("Mode fullscreen disimpan", "success"); }}><span className="material-symbols-outlined">fullscreen</span><strong>Fullscreen</strong><span>Layar penuh tanpa bingkai jendela</span></button>
          </div>
          <InfoNote>Preferensi disimpan di perangkat ini dan diterapkan otomatis saat aplikasi dibuka kembali.</InfoNote>
        </div>
      </DataPanel>

      <DataPanel isEmpty={false}>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
          <div><p className="text-headline-sm">Printer Struk (ESC/POS)</p><p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>Kosongkan untuk deteksi otomatis. Isi path manual jika perlu.</p></div>
          <label className="input-label">Path / Port printer<input className="input-field" list="printer-candidates" value={printerPath} onChange={(e) => setPrinterPathState(e.target.value)} placeholder="Auto-detect (kosongkan)" /><datalist id="printer-candidates">{printerCandidates.map((c) => <option key={c.path} value={c.path}>{c.writable ? "siap tulis" : "terdeteksi"}</option>)}</datalist></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="btn-primary" onClick={() => { setPrinterPath(printerPath); addToast(printerPath ? `Printer diset: ${printerPath}` : "Printer: auto-detect", "success"); }}>Simpan Printer</button><button type="button" className="btn-secondary" onClick={() => { setPrinterPathState(""); setPrinterPath(""); addToast("Printer kembali ke auto-detect", "info"); }}>Reset Auto</button><button type="button" className="btn-secondary" onClick={() => invoke("list_printer_candidates").then((list) => { setPrinterCandidates(Array.isArray(list) ? list : []); addToast(`Ditemukan ${(list || []).length} kandidat device`, "info"); }).catch((e) => addToast(String(e), "error"))}>Deteksi Ulang</button></div>
          <InfoNote>Scanner barcode USB (HID/keyboard wedge) langsung aktif di Kasir.</InfoNote>
        </div>
      </DataPanel>
    </PageShell>
  );
}
