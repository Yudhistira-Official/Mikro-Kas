//! Commands printer — ESC/POS thermal (universal path/port + auto-detect)
use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use std::io::Write;
use std::path::Path;
use tauri::State;

/// Membangun teks struk dari data transaksi.
#[tauri::command]
pub fn build_struk_text(state: State<DbState>, transaksi_id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let (nama_toko, qris): (String, Option<String>) = conn
        .query_row(
            "SELECT nama_toko, qris_statis FROM toko WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Toko tidak ditemukan".to_string())?;

    let (total, metode_bayar, tanggal, catatan): (i64, String, String, Option<String>) = conn
        .query_row(
            "SELECT total, metode_bayar, tanggal, catatan FROM transaksi WHERE id=?1",
            params![transaksi_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "Transaksi tidak ditemukan".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT p.nama, ti.qty, ti.harga_satuan, ti.subtotal
             FROM transaksi_item ti
             JOIN produk p ON p.id = ti.produk_id
             WHERE ti.transaksi_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(params![transaksi_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut text = format!("{}\n", nama_toko);
    text.push_str(&format!("Tanggal: {}\n", tanggal));
    text.push_str(&format!("Nota: #{}\n", transaksi_id));
    text.push_str("================================\n");

    let mut subtotal = 0i64;
    for item_result in items {
        let (nama, qty, harga, sub) = item_result.map_err(|e| e.to_string())?;
        subtotal += sub;
        text.push_str(&format!(
            "{}\n  {} x {} = {}\n",
            nama,
            qty,
            format_rupiah(harga),
            format_rupiah(sub)
        ));
    }

    text.push_str("================================\n");
    text.push_str(&format!("Subtotal: {}\n", format_rupiah(subtotal)));
    text.push_str(&format!("TOTAL: {}\n", format_rupiah(total)));
    text.push_str(&format!("Bayar: {}\n", metode_bayar));

    if let Some(note) = catatan {
        text.push_str(&format!("Catatan: {}\n", note));
    }

    if let Some(qr) = qris {
        text.push_str(&format!("\nQRIS: {}\n", qr));
    }

    text.push_str("\nTerima kasih!\n");

    Ok(text)
}

/// Candidate printer paths for auto-detect (Windows / Linux / macOS-ish).
fn default_candidates() -> Vec<String> {
    let mut out = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for i in 1..=9 {
            out.push(format!(r"\\.\USB00{}", i));
            out.push(format!(r"\\.\COM{}", i));
        }
        for i in 10..=20 {
            out.push(format!(r"\\.\COM{}", i));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for i in 0..=9 {
            out.push(format!("/dev/usb/lp{}", i));
        }
        for i in 0..=9 {
            out.push(format!("/dev/lp{}", i));
        }
        // Serial USB adapters (common for thermal printers)
        for name in [
            "/dev/ttyUSB0",
            "/dev/ttyUSB1",
            "/dev/ttyUSB2",
            "/dev/ttyACM0",
            "/dev/ttyACM1",
            "/dev/ttyS0",
            "/dev/ttyS1",
        ] {
            out.push(name.to_string());
        }
        // Scan /dev for more ttyUSB* / ttyACM* if present
        if let Ok(entries) = std::fs::read_dir("/dev") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("ttyUSB")
                    || name.starts_with("ttyACM")
                    || name.starts_with("usb/lp")
                {
                    let path = format!("/dev/{}", name);
                    if !out.contains(&path) {
                        out.push(path);
                    }
                }
            }
        }
    }

    out
}

fn build_escpos_payload(text: &str) -> Vec<u8> {
    let mut data: Vec<u8> = Vec::new();
    data.extend_from_slice(b"\x1B@"); // ESC @ init
                                      // Code page / simple text (CP437-compatible ASCII + latin digits)
    data.extend_from_slice(text.as_bytes());
    data.extend_from_slice(b"\n\n");
    data.extend_from_slice(b"\x1Bd\x04"); // ESC d 4 feed
    data.extend_from_slice(b"\x1DV\x00"); // GS V 0 full cut (ignored if unsupported)
    data
}

fn try_write_device(path: &str, data: &[u8]) -> Result<(), String> {
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("Buka {path}: {e}"))?;
    f.write_all(data)
        .map_err(|e| format!("Tulis {path}: {e}"))?;
    let _ = f.flush();
    Ok(())
}

/// Lists candidate printer paths that currently exist / can open for write.
#[derive(Debug, Serialize)]
pub struct PrinterCandidate {
    pub path: String,
    pub writable: bool,
}

#[tauri::command]
pub fn list_printer_candidates() -> Result<Vec<PrinterCandidate>, String> {
    let mut list = Vec::new();
    for path in default_candidates() {
        let exists = Path::new(&path).exists() || path.starts_with(r"\\.\");
        if !exists && !path.starts_with(r"\\.\") {
            continue;
        }
        let writable = std::fs::OpenOptions::new().write(true).open(&path).is_ok();
        list.push(PrinterCandidate { path, writable });
    }
    Ok(list)
}

/// Prints receipt to preferred path if provided, otherwise auto-detects.
///
/// Parameters:
/// - `transaksi_id`: transaction id
/// - `printer_path`: optional override (COM3, /dev/usb/lp0, \\.\USB001, …)
#[tauri::command]
pub fn print_struk(
    state: State<DbState>,
    transaksi_id: i64,
    printer_path: Option<String>,
) -> Result<String, String> {
    let text = build_struk_text(state, transaksi_id)?;
    let data = build_escpos_payload(&text);

    let mut candidates: Vec<String> = Vec::new();
    if let Some(p) = printer_path {
        let p = p.trim().to_string();
        if !p.is_empty() {
            candidates.push(p);
        }
    }
    candidates.extend(default_candidates());

    let mut last_err = String::from("Tidak ada printer yang dapat ditulis.");
    for dev in candidates {
        match try_write_device(&dev, &data) {
            Ok(()) => return Ok(format!("Cetak ke {dev} berhasil")),
            Err(e) => last_err = e,
        }
    }

    Err(format!(
        "Printer tidak ditemukan / tidak bisa ditulis. {last_err} Atur path di Profil Perusahaan atau pasang printer ESC/POS USB."
    ))
}

fn format_rupiah(amount: i64) -> String {
    let s = amount.to_string();
    let mut result = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push('.');
        }
        result.push(c);
    }
    format!("Rp{}", result.chars().rev().collect::<String>())
}
