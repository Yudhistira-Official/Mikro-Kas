//! Commands printer — generate receipt text for 58mm thermal printers (Xpos 58, USB/RJ-11)
use crate::db::DbState;
use rusqlite::params;
use tauri::State;
use std::io::Write;

/// Membangun teks struk dari data transaksi.
///
/// Parameters:
/// - `transaksi_id`: ID transaksi yang akan dicetak
///
/// Returns:
/// - `String`: Teks struk siap cetak
#[tauri::command]
pub fn build_struk_text(state: State<DbState>, transaksi_id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let (nama_toko, qris): (String, Option<String>) = conn
        .query_row("SELECT nama_toko, qris_statis FROM toko WHERE id=1", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
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

/// Mengirim struk ke printer thermal 58mm via USB device node.
/// Mencoba /dev/usb/lp0, lp1, lp2 secara berurutan.
/// ESC/POS: ESC @ (init), teks, ESC d 4 (feed 4 baris), GS V 0 (cut).
///
/// Parameters:
/// - `transaksi_id`: ID transaksi yang akan dicetak
///
/// Returns:
/// - `String`: Pesan sukses dengan nama device yang digunakan
#[tauri::command]
pub fn print_struk(state: State<DbState>, transaksi_id: i64) -> Result<String, String> {
    let text = build_struk_text(state, transaksi_id)?;

    // ESC/POS init + teks + feed + cut
    let mut data: Vec<u8> = Vec::new();
    data.extend_from_slice(b"\x1B@");       // ESC @ — init printer
    data.extend_from_slice(text.as_bytes());
    data.extend_from_slice(b"\x1Bd\x04");  // ESC d 4 — feed 4 lines
    data.extend_from_slice(b"\x1DV\x00"); // GS V 0 — full cut

    // Kandidat device: Linux USB, Windows USB printer port, Windows COM port
    #[cfg(target_os = "windows")]
    let candidates: &[&str] = &[
        "\\\\.\\USB001", "\\\\.\\USB002", "\\\\.\\USB003",
        "\\\\.\\COM1",  "\\\\.\\COM2",  "\\\\.\\COM3",
        "\\\\.\\COM4",  "\\\\.\\COM5",  "\\\\.\\COM6",
        "\\\\.\\COM7",  "\\\\.\\COM8",  "\\\\.\\COM9",
    ];
    #[cfg(not(target_os = "windows"))]
    let candidates: &[&str] = &[
        "/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2",
    ];

    for dev in candidates {
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(dev) {
            f.write_all(&data).map_err(|e| format!("Gagal kirim ke {dev}: {e}"))?;
            return Ok(format!("Cetak ke {dev} berhasil"));
        }
    }

    Err("Printer tidak ditemukan. Pastikan printer terhubung dan driver terinstal.".to_string())
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
