//! Sales representatives dan komisi terutang.
//!
//! Sales bisa dikaitkan ke transaksi, komisi dihitung per item terjual.
//! Pembayaran komisi dicatat di komisi_terutang dengan status pending/paid.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Data sales representative.
#[derive(Debug, Serialize)]
pub struct Sales {
    pub id: i64,
    pub nama: String,
    pub kode: Option<String>,
    pub telepon: Option<String>,
    pub email: Option<String>,
    pub is_active: i64,
}

/// Input untuk membuat sales baru.
#[derive(Debug, Deserialize)]
pub struct SalesInput {
    pub nama: String,
    pub kode: Option<String>,
    pub telepon: Option<String>,
    pub email: Option<String>,
}

/// Komisi yang terutang ke sales dalam suatu periode.
#[derive(Debug, Serialize)]
pub struct KomisiTerutang {
    pub id: i64,
    pub sales_id: i64,
    pub sales_nama: String,
    pub periode: String,
    pub total_komisi: i64,
    pub sudah_dibayar: i64,
    pub sisa: i64,
    pub status: String,
}

/// Ambil semua sales aktif.
///
/// Returns: Vec<Sales>
#[tauri::command]
pub fn list_sales(state: State<DbState>) -> Result<Vec<Sales>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nama, kode, telepon, email, is_active
             FROM sales WHERE is_active = 1 ORDER BY nama",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Sales {
                id: row.get(0)?,
                nama: row.get(1)?,
                kode: row.get(2)?,
                telepon: row.get(3)?,
                email: row.get(4)?,
                is_active: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Buat sales baru.
///
/// Parameters:
/// - `input`: SalesInput
///
/// Returns: id sales baru
#[tauri::command]
pub fn create_sales(state: State<DbState>, input: SalesInput) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO sales (nama, kode, telepon, email) VALUES (?1, ?2, ?3, ?4)",
        params![input.nama, input.kode, input.telepon, input.email],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Ambil semua komisi terutang, opsional filter by sales_id atau status.
///
/// Parameters:
/// - `sales_id`: filter per sales, opsional
/// - `status`: "pending" | "paid" | None untuk semua
///
/// Returns: Vec<KomisiTerutang>
#[tauri::command]
pub fn list_komisi_terutang(
    state: State<DbState>,
    sales_id: Option<i64>,
    status: Option<String>,
) -> Result<Vec<KomisiTerutang>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT kt.id, kt.sales_id, s.nama, kt.periode,
                    kt.total_komisi, kt.sudah_dibayar, kt.sisa, kt.status
             FROM komisi_terutang kt
             JOIN sales s ON s.id = kt.sales_id
             WHERE (?1 IS NULL OR kt.sales_id = ?1)
               AND (?2 IS NULL OR kt.status = ?2)
             ORDER BY kt.periode DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![sales_id, status], |row| {
            Ok(KomisiTerutang {
                id: row.get(0)?,
                sales_id: row.get(1)?,
                sales_nama: row.get(2)?,
                periode: row.get(3)?,
                total_komisi: row.get(4)?,
                sudah_dibayar: row.get(5)?,
                sisa: row.get(6)?,
                status: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Bayar komisi terutang (full atau partial).
///
/// Parameters:
/// - `komisi_id`: id di tabel komisi_terutang
/// - `jumlah_bayar`: nominal yang dibayarkan
///
/// Returns: sisa komisi setelah pembayaran
///
/// Side effects:
/// - Update sudah_dibayar dan sisa di komisi_terutang
/// - Set status = 'paid' jika sisa == 0
#[tauri::command]
pub fn bayar_komisi(
    state: State<DbState>,
    komisi_id: i64,
    jumlah_bayar: i64,
) -> Result<i64, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Ambil data komisi untuk validasi
    let (total_komisi, sudah_dibayar, sisa): (i64, i64, i64) = tx
        .query_row(
            "SELECT total_komisi, sudah_dibayar, sisa FROM komisi_terutang WHERE id = ?1",
            params![komisi_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| format!("Komisi ID {} tidak ditemukan", komisi_id))?;

    if jumlah_bayar > sisa {
        return Err(format!(
            "Jumlah bayar {} melebihi sisa komisi {}",
            jumlah_bayar, sisa
        ));
    }

    let sudah_dibayar_baru = sudah_dibayar + jumlah_bayar;
    let sisa_baru = total_komisi - sudah_dibayar_baru;
    let status_baru = if sisa_baru == 0 { "paid" } else { "pending" };

    tx.execute(
        "UPDATE komisi_terutang
         SET sudah_dibayar = ?1, sisa = ?2, status = ?3, paid_at = CASE WHEN ?3 = 'paid' THEN datetime('now','localtime') ELSE paid_at END
         WHERE id = ?4",
        params![sudah_dibayar_baru, sisa_baru, status_baru, komisi_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(sisa_baru)
}

/// Update data sales yang sudah ada.
///
/// Parameters:
/// - `id`: id sales
/// - `input`: SalesInput — data baru
///
/// Returns: jumlah baris yang diubah
#[tauri::command]
pub fn update_sales(state: State<DbState>, id: i64, input: SalesInput) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let rows = conn.execute(
        "UPDATE sales SET nama = ?1, kode = ?2, telepon = ?3, email = ?4 WHERE id = ?5",
        params![input.nama, input.kode, input.telepon, input.email, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Nonaktifkan (soft delete) sales.
///
/// Parameters:
/// - `id`: id sales
///
/// Returns: jumlah baris yang diubah
///
/// Side effects: set is_active = 0
#[tauri::command]
pub fn delete_sales(state: State<DbState>, id: i64) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let rows = conn.execute(
        "UPDATE sales SET is_active = 0 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(rows)
}
