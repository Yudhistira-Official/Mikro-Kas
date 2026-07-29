use crate::commands::user_cmd::{require_admin, require_authenticated, AuthState};
use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareSettings {
    pub printer_path: String,
    pub lebar_kertas: i64,
    pub scanner_enabled: bool,
    pub scanner_min_length: i64,
    pub scanner_timeout_ms: i64,
    pub scanner_baud_rate: i64,
    pub scanner_port: String,
    pub scanner_terminator: String,
    pub display_enabled: bool,
    pub display_type: String,
    pub display_port: String,
}

impl Default for HardwareSettings {
    fn default() -> Self {
        Self {
            printer_path: String::new(),
            lebar_kertas: 48,
            scanner_enabled: true,
            scanner_min_length: 3,
            scanner_timeout_ms: 50,
            scanner_baud_rate: 9600,
            scanner_port: String::new(),
            scanner_terminator: "Enter".into(),
            display_enabled: false,
            display_type: "none".into(),
            display_port: String::new(),
        }
    }
}

pub fn ensure_hardware_table(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS hardware_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            printer_path TEXT NOT NULL DEFAULT '',
            lebar_kertas INTEGER NOT NULL DEFAULT 48,
            scanner_enabled INTEGER NOT NULL DEFAULT 1,
            scanner_min_length INTEGER NOT NULL DEFAULT 3,
            scanner_timeout_ms INTEGER NOT NULL DEFAULT 50,
            scanner_baud_rate INTEGER NOT NULL DEFAULT 9600,
            scanner_port TEXT NOT NULL DEFAULT '',
            scanner_terminator TEXT NOT NULL DEFAULT 'Enter',
            display_enabled INTEGER NOT NULL DEFAULT 0,
            display_type TEXT NOT NULL DEFAULT 'none',
            display_port TEXT NOT NULL DEFAULT ''
        );
        INSERT OR IGNORE INTO hardware_settings (id) VALUES (1);",
    );
    crate::db::ensure_column(conn, "hardware_settings", "scanner_baud_rate", "INTEGER NOT NULL DEFAULT 9600");
    crate::db::ensure_column(conn, "hardware_settings", "scanner_port", "TEXT NOT NULL DEFAULT ''");
}

#[tauri::command]
pub fn get_hardware_settings(state: State<DbState>, auth: State<AuthState>) -> Result<HardwareSettings, String> {
    require_authenticated(auth.inner())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_hardware_table(&conn);
    conn.query_row(
        "SELECT printer_path, lebar_kertas, scanner_enabled, scanner_min_length,
                scanner_timeout_ms, scanner_baud_rate, scanner_port, scanner_terminator, display_enabled, display_type, display_port
         FROM hardware_settings WHERE id=1",
        [],
        |row| {
            Ok(HardwareSettings {
                printer_path: row.get(0)?,
                lebar_kertas: row.get(1)?,
                scanner_enabled: row.get::<_, i64>(2)? != 0,
                scanner_min_length: row.get(3)?,
                scanner_timeout_ms: row.get(4)?,
                scanner_baud_rate: row.get(5)?,
                scanner_port: row.get(6)?,
                scanner_terminator: row.get(7)?,
                display_enabled: row.get::<_, i64>(8)? != 0,
                display_type: row.get(9)?,
                display_port: row.get(10)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_hardware_settings(
    state: State<DbState>,
    auth: State<AuthState>,
    settings: HardwareSettings,
) -> Result<(), String> {
    require_admin(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_hardware_table(&conn);
    // Standar POS: hanya 32 (58mm) atau 48 (80mm)
    let mut settings = settings;
    settings.lebar_kertas = if settings.lebar_kertas <= 40 { 32 } else { 48 };
    conn.execute(
        "UPDATE hardware_settings SET
            printer_path=?1, lebar_kertas=?2, scanner_enabled=?3, scanner_min_length=?4,
            scanner_timeout_ms=?5, scanner_baud_rate=?6, scanner_port=?7, scanner_terminator=?8, display_enabled=?9, display_type=?10, display_port=?11
         WHERE id=1",
        params![
            settings.printer_path,
            settings.lebar_kertas,
            settings.scanner_enabled as i64,
            settings.scanner_min_length,
            settings.scanner_timeout_ms,
            settings.scanner_baud_rate,
            settings.scanner_port,
            settings.scanner_terminator,
            settings.display_enabled as i64,
            settings.display_type,
            settings.display_port,
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("UPDATE toko SET lebar_kertas=?1 WHERE id=1", params![settings.lebar_kertas])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_serial_scanner_ports(auth: State<AuthState>) -> Result<Vec<String>, String> {
    require_authenticated(auth.inner())?;
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_serial_barcode(
    auth: State<AuthState>,
    port: String,
    baud_rate: Option<u32>,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    require_authenticated(auth.inner())?;
    let mut device = serialport::new(port.trim(), baud_rate.unwrap_or(9600))
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(1500)))
        .open()
        .map_err(|e| format!("Gagal buka scanner serial: {e}"))?;
    let mut bytes = Vec::new();
    let mut buf = [0u8; 128];
    loop {
        match std::io::Read::read(&mut device, &mut buf) {
            Ok(0) => break,
            Ok(n) => {
                bytes.extend_from_slice(&buf[..n]);
                if bytes.contains(&b'\n') || bytes.contains(&b'\r') { break; }
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => break,
            Err(e) => return Err(format!("Gagal baca scanner serial: {e}")),
        }
        if bytes.len() >= 256 { break; }
    }
    let value = String::from_utf8_lossy(&bytes).trim().to_string();
    if value.is_empty() { return Err("Barcode serial kosong atau timeout".into()); }
    Ok(value)
}

#[tauri::command]
pub fn test_print_struk(state: State<DbState>, auth: State<AuthState>, printer_path: Option<String>) -> Result<String, String> {
    require_authenticated(auth.inner())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let (nama_toko, alamat, telepon, lebar): (String, Option<String>, Option<String>, i64) = conn
        .query_row(
            "SELECT nama_toko, alamat, telepon, lebar_kertas FROM toko WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get::<_, i64>(3).unwrap_or(48))),
        )
        .map_err(|_| "Toko belum diset".to_string())?;

    let w = (lebar as usize).clamp(32, 80);

    // Samakan layout dengan build_struk_text (kv_row + dash + wrap footer).
    use crate::commands::printer_cmd::{dash_line, item_row, kv_row, wrap_text};
    let dash = dash_line(w);
    let mut text = String::new();
    text.push_str("<center>");
    text.push_str(&format!("{}\n", nama_toko));
    if let Some(a) = alamat.filter(|s| !s.trim().is_empty()) {
        for line in wrap_text(a.trim(), w) {
            text.push_str(&format!("{line}\n"));
        }
    }
    if let Some(tel) = telepon.filter(|s| !s.trim().is_empty()) {
        text.push_str(&format!("Telp: {}\n", tel.trim()));
    }
    text.push_str("TEST PRINT\n");
    text.push_str("</center>");
    text.push_str("<left>");
    text.push_str(&format!("{}\n", dash));
    text.push_str(&format!("{}\n", kv_row("No : 00001/ADM/INV", "29-07-2026", w)));
    text.push_str(&format!("{}\n", kv_row("Kasir : Admin", "14:32:10", w)));
    text.push_str("Pelanggan : UMUM\n");
    text.push_str(&format!("{}\n", dash));
    text.push_str(&format!("{}\n", item_row("TEST PRODUK CONTOH", 2, 20000, w)));
    text.push_str(&format!("{}\n", item_row("PRODUK KEDUA", 1, 15000, w)));
    text.push_str(&format!("{}\n", item_row("PRODUK KETIGA PANJANG SEKALI", 5, 75000, w)));
    text.push_str(&format!("{}\n", dash));
    text.push_str(&format!("{}\n", kv_row("Subtotal", "Rp110.000", w)));
    text.push_str(&format!("{}\n", kv_row("Total", "Rp110.000", w)));
    text.push_str(&format!("{}\n", dash));
    text.push_str(&format!("{}\n", kv_row("TUNAI", "Rp150.000", w)));
    text.push_str(&format!("{}\n", kv_row("Kembali", "Rp40.000", w)));
    text.push_str(&format!("{}\n", dash));
    let footer: &[&str] = if w <= 32 {
        &[
            "Barang yang dibeli tidak dapat",
            "dikembalikan kecuali ada",
            "perjanjian",
        ]
    } else {
        &[
            "Barang yang telah dibeli tidak dapat",
            "dikembalikan kecuali ada perjanjian",
        ]
    };
    for line in footer {
        text.push_str(&format!("{line}\n"));
    }
    text.push_str("</left>");

    let bytes = crate::commands::printer_cmd::build_escpos_payload(&text);

    let candidates: Vec<String> = if let Some(ref p) = printer_path {
        if p.is_empty() { Vec::new() } else { vec![p.clone()] }
    } else {
        Vec::new()
    };

    let mut last_err = String::from("Tidak ada printer yang dapat ditulis.");
    for dev in if candidates.is_empty() {
        crate::commands::printer_cmd::default_candidates()
    } else {
        candidates
    } {
        match std::fs::OpenOptions::new().write(true).open(&dev) {
            Ok(mut f) => {
                f.write_all(&bytes).map_err(|e| format!("Tulis {dev}: {e}"))?;
                let _ = f.flush();
                return Ok(format!("Test print ke {dev} berhasil"));
            }
            Err(e) => last_err = format!("{dev}: {e}"),
        }
    }
    Err(last_err)
}
