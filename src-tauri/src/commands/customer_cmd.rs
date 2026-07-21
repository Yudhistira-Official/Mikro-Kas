//! Command CRUD customer + detail tambahan.
use crate::db::DbState;
use crate::models::customer::{Customer, CustomerInput};
use rusqlite::params;
use serde::Serialize;
use tauri::State;

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: row.get(0)?,
        nama: row.get(1)?,
        telepon: row.get(2)?,
        alamat: row.get(3)?,
        deskripsi_tambahan: row.get(4)?,
        limit_kredit: row.get(5).unwrap_or(0),
        created_at: row.get(6)?,
    })
}

#[tauri::command]
pub fn list_customer(state: State<DbState>) -> Result<Vec<Customer>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nama, telepon, alamat, deskripsi_tambahan, limit_kredit, created_at
             FROM customer
             ORDER BY lower(nama) ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Ambil laporan pelanggan berupa rekap nilai belanja & loyalty point.
/// Dihitung dari detail history transaksi (melalui parse string customer_id di catatan).
#[tauri::command]
pub fn get_laporan_pelanggan(state: State<DbState>) -> Result<Vec<LaporanPelangganRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 1. Ambil semua customer
    let mut stmt_cust = conn
        .prepare("SELECT id, nama, telepon FROM customer")
        .map_err(|e| e.to_string())?;
    let cust_rows = stmt_cust
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut customers = Vec::new();
    for r in cust_rows {
        customers.push(r.map_err(|e| e.to_string())?);
    }

    // 2. Ambil semua transaksi penjualan yang memiliki catatan
    let mut stmt_tx = conn
        .prepare("SELECT total, catatan FROM transaksi WHERE tipe='penjualan' AND catatan IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let tx_rows = stmt_tx
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut tx_data = Vec::new();
    for r in tx_rows {
        tx_data.push(r.map_err(|e| e.to_string())?);
    }

    // 3. Agregasikan data
    let mut report = Vec::new();
    for (cid, name, telp) in customers {
        let mut total_tx = 0;
        let mut total_belanja = 0;

        let cid_pattern = format!("customer_id={}", cid);
        for &(total, ref catatan) in &tx_data {
            let contains_id = catatan.split('|').any(|part| {
                let part_trimmed = part.trim();
                part_trimmed == cid_pattern
                    || part_trimmed.starts_with(&format!("{} ", cid_pattern))
                    || part_trimmed.ends_with(&format!(" {}", cid_pattern))
                    || part_trimmed.contains(&format!(" {} ", cid_pattern))
            });

            if contains_id {
                total_tx += 1;
                total_belanja += total;
            }
        }

        // Poin loyalty: 1 poin tiap kelipatan Rp 10.000 belanja
        let poin = total_belanja / 10000;

        report.push(LaporanPelangganRow {
            customer_id: cid,
            customer_nama: name,
            customer_telepon: telp,
            total_transaksi: total_tx,
            total_belanja,
            poin_loyalty: poin,
        });
    }

    // Urutkan berdasarkan total belanja terbanyak
    report.sort_by(|a, b| b.total_belanja.cmp(&a.total_belanja));
    Ok(report)
}

#[tauri::command]
pub fn create_customer(state: State<DbState>, input: CustomerInput) -> Result<Customer, String> {
    let nama = input.nama.trim();
    if nama.is_empty() {
        return Err("Nama wajib diisi".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO customer (nama, telepon, alamat, deskripsi_tambahan, limit_kredit) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            nama,
            input.telepon,
            input.alamat,
            input.deskripsi_tambahan,
            input.limit_kredit.unwrap_or(0),
        ],
    )
    .map_err(|e| format!("Gagal menyimpan data: {e}"))?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, limit_kredit, created_at FROM customer WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_customer(
    state: State<DbState>,
    id: i64,
    input: CustomerInput,
) -> Result<Customer, String> {
    let nama = input.nama.trim();
    if nama.is_empty() {
        return Err("Nama wajib diisi".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE customer SET nama=?1, telepon=?2, alamat=?3, deskripsi_tambahan=?4, limit_kredit=?5 WHERE id=?6",
        params![
            nama,
            input.telepon,
            input.alamat,
            input.deskripsi_tambahan,
            input.limit_kredit.unwrap_or(0),
            id
        ],
    )
    .map_err(|e| format!("Gagal update data: {e}"))?;
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, limit_kredit, created_at FROM customer WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_customer(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM customer WHERE id=?1", params![id])
        .map_err(|e| format!("Gagal hapus data: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_customer(state: State<DbState>, id: i64) -> Result<Customer, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, nama, telepon, alamat, deskripsi_tambahan, limit_kredit, created_at FROM customer WHERE id=?1",
        params![id],
        map_row,
    )
    .map_err(|_| "Customer tidak ditemukan".to_string())
}

// ============================================================
// Gap KasGo Phase 3: Import Customer CSV
// ============================================================

/// Ringkasan hasil import customer massal.
/// `dibuat` = customer baru; `diupdate` = customer existing cocok telepon/nama lalu ditimpa.
#[derive(Debug, Serialize)]
pub struct ImportCustomerResult {
    pub dibuat: i64,
    pub diupdate: i64,
    pub dilewati: i64,
    pub errors: Vec<String>,
}

/// Baris laporan pelanggan dengan poin loyalty.
#[derive(Debug, Serialize)]
pub struct LaporanPelangganRow {
    pub customer_id: i64,
    pub customer_nama: String,
    pub customer_telepon: Option<String>,
    pub total_transaksi: i64,
    pub total_belanja: i64,
    pub poin_loyalty: i64,
}

/// Parser CSV kecil tanpa dependency: cukup untuk format ekspor spreadsheet sederhana.
/// Mendukung tanda kutip ganda dan koma di dalam field quoted.
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut cols = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' if in_quotes && chars.peek() == Some(&'"') => {
                current.push('"');
                chars.next();
            }
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => {
                cols.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    cols.push(current.trim().to_string());
    cols
}

/// Import customer massal dari CSV.
/// Format: nama, telepon, alamat, deskripsi_tambahan
#[tauri::command]
pub fn import_customer_csv(state: State<DbState>, csv_text: String) -> Result<ImportCustomerResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut result = ImportCustomerResult { dibuat: 0, diupdate: 0, dilewati: 0, errors: Vec::new() };

    for (idx, raw_line) in csv_text.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim();
        if line.is_empty() { continue; }

        let cols = parse_csv_line(line);
        // Header spreadsheet dilewati otomatis.
        if line_no == 1 && cols.first().map(|v| v.to_lowercase()).as_deref() == Some("nama") {
            continue;
        }

        if cols.is_empty() || cols[0].trim().is_empty() {
            result.dilewati += 1;
            result.errors.push(format!("Baris {line_no}: nama wajib diisi"));
            continue;
        }

        let nama = cols[0].trim().to_string();
        let telepon = cols.get(1).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let alamat = cols.get(2).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let deskripsi = cols.get(3).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());

        // ponytail: matching telepon/nama cukup untuk import spreadsheet UMKM; tambah customer_code jika multi-cabang perlu dedupe kuat.
        let existing_id: Option<i64> = if let Some(ref telp) = telepon {
            conn.query_row("SELECT id FROM customer WHERE telepon = ?1 LIMIT 1", params![telp], |row| row.get(0)).ok()
        } else {
            conn.query_row("SELECT id FROM customer WHERE lower(nama) = lower(?1) LIMIT 1", params![nama], |row| row.get(0)).ok()
        };

        if let Some(id) = existing_id {
            conn.execute(
                "UPDATE customer SET nama=?1, telepon=?2, alamat=?3, deskripsi_tambahan=?4 WHERE id=?5",
                params![nama, telepon, alamat, deskripsi, id],
            ).map_err(|e| format!("Baris {line_no}: gagal update customer: {e}"))?;
            result.diupdate += 1;
        } else {
            conn.execute(
                "INSERT INTO customer (nama, telepon, alamat, deskripsi_tambahan) VALUES (?1, ?2, ?3, ?4)",
                params![nama, telepon, alamat, deskripsi],
            ).map_err(|e| format!("Baris {line_no}: gagal insert customer: {e}"))?;
            result.dibuat += 1;
        }
    }

    Ok(result)
}
