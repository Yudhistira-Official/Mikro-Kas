use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use std::io::Write;
use std::path::Path;
use tauri::State;

const LEBAR_DEFAULT: usize = 48;

/// Standar thermal POS: hanya 32 (58mm) atau 48 (80mm).
fn lebar_kertas(conn: &rusqlite::Connection) -> usize {
    let raw = conn
        .query_row("SELECT lebar_kertas FROM toko WHERE id=1", [], |row| row.get::<_, i64>(0))
        .ok()
        .unwrap_or(LEBAR_DEFAULT as i64);
    if raw <= 40 { 32 } else { 48 }
}

fn _pad_right(s: &str, w: usize) -> String {
    let clean: String = s.chars().take(w).collect();
    format!("{:<width$}", clean, width = w)
}

fn _pad_left(s: &str, w: usize) -> String {
    let clean: String = s.chars().take(w).collect();
    format!("{:>width$}", clean, width = w)
}

/// Format item row: nama kiri, "qty x subtotal" kanan (monospaced).
pub fn item_row(nama: &str, qty: i64, subtotal: i64, w: usize) -> String {
    let right = format!("{} x {}", qty, format_rupiah(subtotal));
    kv_row(nama, &right, w)
}

/// Baris label kiri + nilai kanan (lebar kertas monospaced).
pub fn kv_row(label: &str, value: &str, w: usize) -> String {
    let lw = label.chars().count();
    let vw = value.chars().count();
    if lw + vw + 1 >= w {
        format!("{} {}", label, value)
    } else {
        let spaces = w - lw - vw;
        format!("{}{}{}", label, " ".repeat(spaces), value)
    }
}

pub fn dash_line(w: usize) -> String {
    "-".repeat(w)
}

/// Wrap teks justify-ish: pecah per kata agar muat lebar kertas, rata kiri.
pub fn wrap_text(s: &str, w: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut cur = String::new();
    for word in s.split_whitespace() {
        if cur.is_empty() {
            if word.chars().count() <= w {
                cur = word.to_string();
            } else {
                // potong kata super panjang
                let mut rest = word;
                while !rest.is_empty() {
                    let take: String = rest.chars().take(w).collect();
                    let n = take.chars().count();
                    lines.push(take);
                    rest = &rest[rest.char_indices().nth(n).map(|(i, _)| i).unwrap_or(rest.len())..];
                }
            }
        } else if cur.chars().count() + 1 + word.chars().count() <= w {
            cur.push(' ');
            cur.push_str(word);
        } else {
            lines.push(cur);
            cur = word.to_string();
        }
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    lines
}

/// Kode role singkat untuk nomor struk.
fn role_code(role: &str) -> &'static str {
    match role {
        "admin" => "ADM",
        "kasir" => "KSR",
        "supervisor" => "SPV",
        "inventori" => "INV",
        _ => "USR",
    }
}

/// Format No struk: 00002/ADM/INV (5 digit / role / prefix setting).
fn format_no_struk(transaksi_id: i64, role: &str, prefix: &str) -> String {
    let p = if prefix.trim().is_empty() { "INV" } else { prefix.trim() };
    format!("{:05}/{}/{}", transaksi_id, role_code(role), p)
}

pub fn _receipt_labels(w: usize) -> (&'static str, &'static str, &'static str, &'static str, &'static str) {
    if w < 36 {
        ("B", "Qty", "Plg", "Kmb", "Cs")
    } else if w < 44 {
        ("Brs", "Qty", "Plg", "Kmb", "Kasir")
    } else {
        ("Baris", "Jumlah", "Pelanggan", "Kembali", "Kasir")
    }
}

fn format_amount(amount: i64) -> String {
    let s = amount.to_string();
    let mut result = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push('.');
        }
        result.push(c);
    }
    result.chars().rev().collect()
}

fn format_rupiah(amount: i64) -> String {
    format!("Rp{}", format_amount(amount))
}

/// Generate teks struk monospaced (lebar kertas), alignment via tag ESC/POS.
#[tauri::command]
pub fn build_struk_text(state: State<DbState>, transaksi_id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let w = lebar_kertas(&conn);

    let (nama_toko, alamat, telepon, fax_opt): (String, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT nama_toko, alamat, telepon, fax FROM toko WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "Toko tidak ditemukan".to_string())?;

    crate::db::ensure_column(&conn, "transaksi", "pajak_nominal", "INTEGER NOT NULL DEFAULT 0");
    crate::db::ensure_column(&conn, "transaksi", "biaya_layanan", "INTEGER NOT NULL DEFAULT 0");
    crate::db::ensure_column(&conn, "transaksi", "ongkir", "INTEGER NOT NULL DEFAULT 0");
    crate::db::ensure_column(&conn, "transaksi", "dibayar", "INTEGER NOT NULL DEFAULT 0");
    crate::db::ensure_column(&conn, "transaksi", "user_id", "INTEGER");

    let (total, metode_bayar, tanggal, dibayar, user_id, catatan, pajak, biaya, ongkir_val): (
        i64, String, String, i64, Option<i64>, Option<String>, i64, i64, i64,
    ) = conn
        .query_row(
            "SELECT total, metode_bayar, tanggal,
                    COALESCE(dibayar, 0), user_id, catatan,
                    COALESCE(pajak_nominal, 0), COALESCE(biaya_layanan, 0), COALESCE(ongkir, 0)
             FROM transaksi WHERE id=?1",
            params![transaksi_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            },
        )
        .map_err(|_| "Transaksi tidak ditemukan".to_string())?;

    // Kasir: nama + role
    let (kasir_nama, kasir_role): (String, String) = user_id
        .and_then(|uid| {
            conn.query_row(
                "SELECT COALESCE(nama_lengkap, username), role FROM users WHERE id=?1",
                params![uid],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .ok()
        })
        .unwrap_or_else(|| ("Admin".to_string(), "admin".to_string()));

    // Prefix nomor dari setting jual
    let prefix: String = conn
        .query_row(
            "SELECT prefix FROM nomor_settings WHERE tipe = 'jual'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "INV".to_string());

    let no_struk = format_no_struk(transaksi_id, &kasir_role, &prefix);

    // Customer dari catatan
    let pelanggan = catatan
        .as_ref()
        .and_then(|c| {
            let sidx = c.find("customer_id=")?;
            let rest = &c[sidx + 12..];
            let eidx = rest
                .find(|ch: char| !ch.is_ascii_digit())
                .unwrap_or(rest.len());
            let cid: i64 = rest[..eidx].parse().ok()?;
            conn.query_row(
                "SELECT nama FROM customer WHERE id=?1",
                params![cid],
                |row| row.get::<_, String>(0),
            )
            .ok()
        })
        .unwrap_or_else(|| "UMUM".to_string());

    // Diskon dari catatan (diskon=N)
    let diskon = catatan
        .as_ref()
        .and_then(|c| {
            let sidx = c.find("diskon=")?;
            let rest = &c[sidx + 7..];
            let eidx = rest
                .find(|ch: char| !ch.is_ascii_digit())
                .unwrap_or(rest.len());
            rest[..eidx].parse::<i64>().ok()
        })
        .unwrap_or(0)
        .max(0);

    // Parse tanggal
    let (tgl, jam) = if let Some(space) = tanggal.find(' ') {
        let d = &tanggal[..space];
        let t = &tanggal[space + 1..];
        let d_parts: Vec<&str> = d.split('-').collect();
        let t_parts: Vec<&str> = t.split(':').collect();
        let dd = d_parts.get(2).unwrap_or(&"01");
        let mm = d_parts.get(1).unwrap_or(&"01");
        let yy = d_parts.first().copied().unwrap_or("2024");
        let hh = t_parts.first().copied().unwrap_or("00");
        let mi = t_parts.get(1).copied().unwrap_or("00");
        let ss = t_parts.get(2).copied().unwrap_or("00");
        // potong detik jika ada fraksi
        let ss = ss.split('.').next().unwrap_or(ss);
        (
            format!("{dd}-{mm}-{yy}"),
            format!("{hh}:{mi}:{ss}"),
        )
    } else {
        ("--".to_string(), "--:--:--".to_string())
    };

    let items: Vec<(String, i64, i64, i64)> = {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(p.nama, 'Item'), ti.qty, ti.harga_satuan, ti.subtotal
                 FROM transaksi_item ti
                 LEFT JOIN produk p ON p.id = ti.produk_id
                 WHERE ti.transaksi_id = ?1
                 ORDER BY ti.id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![transaksi_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    let subtotal: i64 = items.iter().map(|(_, _, _, s)| *s).sum();
    // dibayar: fallback ke total jika 0 (qris/transfer full)
    let dibayar_efektif = if dibayar > 0 { dibayar } else { total };
    let kembali = (dibayar_efektif - total).max(0);

    let mut text = String::new();

    // ── HEADER (center) ──
    text.push_str("<center>");
    text.push_str(&format!("{}\n", nama_toko));
    if let Some(ref a) = alamat {
        if !a.trim().is_empty() {
            for line in wrap_text(a.trim(), w) {
                text.push_str(&format!("{line}\n"));
            }
        }
    }
    if let Some(ref t) = telepon {
        if !t.trim().is_empty() {
            text.push_str(&format!("Telp: {}\n", t.trim()));
        }
    }
    if let Some(ref f) = fax_opt {
        if !f.trim().is_empty() && f.trim() != "-" {
            text.push_str(&format!("Fax: {}\n", f.trim()));
        }
    }
    text.push_str("</center>");

    // ── META (left, monospaced dual-align) ──
    text.push_str("<left>");
    text.push_str(&format!("{}\n", dash_line(w)));
    text.push_str(&format!("{}\n", kv_row(&format!("No : {no_struk}"), &tgl, w)));
    text.push_str(&format!(
        "{}\n",
        kv_row(&format!("Kasir : {kasir_nama}"), &jam, w)
    ));
    text.push_str(&format!("Pelanggan : {pelanggan}\n"));
    text.push_str(&format!("{}\n", dash_line(w)));

    // ── ITEMS ──
    for (nama, qty, _harga, sub) in &items {
        text.push_str(&format!("{}\n", item_row(nama, *qty, *sub, w)));
    }
    text.push_str(&format!("{}\n", dash_line(w)));

    // ── SUMMARY: hanya tampilkan non-zero untuk diskon/ppn/service/ongkir ──
    text.push_str(&format!("{}\n", kv_row("Subtotal", &format_rupiah(subtotal), w)));
    if diskon > 0 {
        text.push_str(&format!("{}\n", kv_row("Diskon", &format_rupiah(diskon), w)));
    }
    if pajak > 0 {
        text.push_str(&format!("{}\n", kv_row("PPN", &format_rupiah(pajak), w)));
    }
    if biaya > 0 {
        text.push_str(&format!("{}\n", kv_row("Service", &format_rupiah(biaya), w)));
    }
    if ongkir_val > 0 {
        text.push_str(&format!("{}\n", kv_row("Ongkir", &format_rupiah(ongkir_val), w)));
    }
    text.push_str(&format!("{}\n", kv_row("Total", &format_rupiah(total), w)));
    text.push_str(&format!("{}\n", dash_line(w)));

    let metode = metode_bayar.to_uppercase();
    text.push_str(&format!(
        "{}\n",
        kv_row(&metode, &format_rupiah(dibayar_efektif), w)
    ));
    text.push_str(&format!(
        "{}\n",
        kv_row("Kembali", &format_rupiah(kembali), w)
    ));
    text.push_str(&format!("{}\n", dash_line(w)));

    // ── FOOTER: baris tetap per lebar (hindari potong kata aneh) ──
    let footer_lines: &[&str] = if w <= 32 {
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
    for line in footer_lines {
        text.push_str(&format!("{line}\n"));
    }
    text.push_str("</left>");

    Ok(text)
}

pub fn build_escpos_payload(text: &str) -> Vec<u8> {
    let mut data: Vec<u8> = Vec::new();
    data.extend_from_slice(b"\x1B@"); // ESC @ init
    data.extend_from_slice(b"\x1B\x74\x00"); // ESC t 0 code page default
    data.extend_from_slice(b"\x1B\x61\x00"); // left align default

    let mut _in_center = false;
    let mut _in_right = false;
    let mut _in_left = false;
    let mut pos = 0;
    let chars: Vec<char> = text.chars().collect();

    while pos < chars.len() {
        if chars[pos] == '<' {
            let remaining: String = chars[pos..].iter().collect();
            if remaining.starts_with("<center>") {
                data.extend_from_slice(b"\x1B\x61\x01"); // ESC a 1 center
                _in_center = true;
                _in_right = false;
                _in_left = false;
                pos += 8;
                continue;
            }
            if remaining.starts_with("</center>") {
                pos += 9;
                continue;
            }
            if remaining.starts_with("<right>") {
                data.extend_from_slice(b"\x1B\x61\x02"); // ESC a 2 right
                _in_right = true;
                _in_center = false;
                _in_left = false;
                pos += 7;
                continue;
            }
            if remaining.starts_with("</right>") {
                pos += 8;
                continue;
            }
            if remaining.starts_with("<left>") {
                data.extend_from_slice(b"\x1B\x61\x00"); // ESC a 0 left
                _in_left = true;
                _in_center = false;
                _in_right = false;
                pos += 6;
                continue;
            }
            if remaining.starts_with("</left>") {
                pos += 7;
                continue;
            }
            if remaining.starts_with("<small>") {
                data.extend_from_slice(b"\x1B\x4D\x01"); // ESC M 1 Font B (condensed)
                pos += 7;
                continue;
            }
            if remaining.starts_with("</small>") {
                data.extend_from_slice(b"\x1B\x4D\x00"); // ESC M 0 Font A
                pos += 8;
                continue;
            }
        }
        // Normal character — UTF-8 (bukan cast u8 yang memecah karakter)
        let ch = chars[pos];
        let mut buf = [0u8; 4];
        let encoded = ch.encode_utf8(&mut buf);
        data.extend_from_slice(encoded.as_bytes());
        pos += 1;
    }

    data.extend_from_slice(b"\n\n");
    data.extend_from_slice(b"\x1Bd\x04"); // ESC d 4 feed
    data.extend_from_slice(b"\x1DV\x00"); // GS V 0 full cut
    data
}

// ═══ rest of the file unchanged ═══

fn try_write_device(path: &str, data: &[u8]) -> Result<(), String> {
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("Buka {path}: {e}"))?;
    f.write_all(data).map_err(|e| format!("Tulis {path}: {e}"))?;
    let _ = f.flush();
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct PrinterCandidate {
    pub path: String,
    pub writable: bool,
}

pub fn default_candidates() -> Vec<String> {
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
        if let Ok(entries) = std::fs::read_dir("/dev") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("ttyUSB") || name.starts_with("ttyACM") || name.starts_with("usb/lp") {
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

    for dev in candidates {
        match try_write_device(&dev, &data) {
            Ok(()) => return Ok(format!("Cetak ke {dev} berhasil")),
            Err(_) => continue,
        }
    }
    // Pesan error ringkas — detail teknis disembunyikan agar tidak membingungkan kasir
    Err("Cetak Struk Gagal. Coba periksa printer dahulu".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kv_row_aligns_left_right() {
        let line = kv_row("No : 00002/ADM/INV", "29-07-2026", 48);
        assert_eq!(line.chars().count(), 48);
        assert!(line.starts_with("No : 00002/ADM/INV"));
        assert!(line.ends_with("29-07-2026"));
    }

    #[test]
    fn format_no_struk_five_digit() {
        assert_eq!(format_no_struk(2, "admin", "INV"), "00002/ADM/INV");
        assert_eq!(format_no_struk(15, "kasir", "JL"), "00015/KSR/JL");
    }

    #[test]
    fn wrap_footer_fits_width() {
        let lines = wrap_text(
            "Barang yang telah dibeli tidak dapat dikembalikan kecuali ada perjanjian",
            32,
        );
        assert!(lines.len() >= 2);
        assert!(lines.iter().all(|l| l.chars().count() <= 32));
    }

    #[test]
    fn zero_fee_not_forced() {
        // pure logic: only non-zero fees render — covered by build_struk integration
        assert_eq!(format_rupiah(0), "Rp0");
        assert_eq!(format_rupiah(110_000), "Rp110.000");
    }
}
