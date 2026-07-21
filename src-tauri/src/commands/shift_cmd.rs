// shift_cmd.rs — Shift management: buka/tutup kasir harian, catat saldo awal/akhir, selisih kas.
// Setiap toko perlu tracking shift untuk variance kas harian seperti KasGo.
// Design ref: Shift Management — buka shift pagi, tutup setelah rekap.

use serde::Serialize;
use tauri::State;
use rusqlite::params;

use crate::db::DbState;

/// Representasi shift di UI: status open/closed, saldo, total penjualan/pengeluaran.
#[derive(Debug, Serialize)]
pub struct Shift {
    pub id: i64,
    pub nama: String,
    pub status: String,
    pub saldo_awal: i64,
    pub saldo_akhir: Option<i64>,
    pub total_penjualan: i64,
    pub total_pengeluaran: i64,
    pub selisih: i64,
    pub catatan: Option<String>,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub created_at: String,
}

/// Input untuk membuka shift baru.
#[derive(serde::Deserialize)]
pub struct BukaShiftInput {
    pub nama: String,
    pub saldo_awal: i64,
}

/// List shift dengan status tertentu atau semua.
#[tauri::command]
pub fn list_shift(state: State<DbState>, status_filter: Option<String>) -> Result<Vec<Shift>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql = match status_filter.as_deref() {
        Some("open") => "SELECT * FROM shift WHERE status='open' ORDER BY opened_at DESC",
        Some("closed") => "SELECT * FROM shift WHERE status='closed' ORDER BY closed_at DESC",
        _ => "SELECT * FROM shift ORDER BY opened_at DESC",
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Shift {
                id: row.get(0)?,
                nama: row.get(1)?,
                status: row.get(2)?,
                saldo_awal: row.get(3)?,
                saldo_akhir: row.get(4)?,
                total_penjualan: row.get(5)?,
                total_pengeluaran: row.get(6)?,
                selisih: row.get(7)?,
                catatan: row.get(8)?,
                opened_at: row.get(9)?,
                closed_at: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Buka shift baru. Tutup shift sebelumnya jika ada yang masih open.
#[tauri::command]
pub fn buka_shift(state: State<DbState>, input: BukaShiftInput) -> Result<Shift, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Tutup shift open sebelumnya otomatis.
    let _ = conn.execute(
        "UPDATE shift SET status='closed', closed_at=datetime('now') WHERE status='open'",
        [],
    );

    conn.execute(
        "INSERT INTO shift (nama, saldo_awal) VALUES (?1, ?2)",
        params![input.nama, input.saldo_awal],
    )
    .map_err(|e| format!("Gagal buka shift: {e}"))?;

    let id = conn.last_insert_rowid();
    let mut stmt = conn
        .prepare("SELECT * FROM shift WHERE id=?1")
        .map_err(|e| e.to_string())?;
    let shift = stmt
        .query_row(params![id], |row| {
            Ok(Shift {
                id: row.get(0)?,
                nama: row.get(1)?,
                status: row.get(2)?,
                saldo_awal: row.get(3)?,
                saldo_akhir: row.get(4)?,
                total_penjualan: row.get(5)?,
                total_pengeluaran: row.get(6)?,
                selisih: row.get(7)?,
                catatan: row.get(8)?,
                opened_at: row.get(9)?,
                closed_at: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(shift)
}

/// Tutup shift yang sedang open: rekap saldo, catat penjualan/pengeluaran, hitung selisih.
#[tauri::command]
pub fn tutup_shift(
    state: State<DbState>,
    id: i64,
    saldo_akhir: i64,
    catatan: Option<String>,
) -> Result<Shift, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Ambil total penjualan dan pengeluaran dari tabel kas untuk periode shift.
    // Shift: dari opened_at shift sampai sekarang.
    let (opened_at, saldo_awal): (String, i64) = conn
        .query_row(
            "SELECT opened_at, saldo_awal FROM shift WHERE id=?1 AND status='open'",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Shift tidak ditemukan atau sudah ditutup".to_string())?;

    // Hitung total penjualan (kas pemasukan dari transaksi) dan pengeluaran manual.
    let total_penjualan: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(jumlah),0) FROM kas WHERE tipe='pemasukan' AND tanggal >= ?1",
            params![opened_at],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let total_pengeluaran: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(jumlah),0) FROM kas WHERE tipe='pengeluaran' AND tanggal >= ?1",
            params![opened_at],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Selisih = saldo akhir fisik - (saldo awal + total penjualan - total pengeluaran)
    let saldo_seharusnya = saldo_awal + total_penjualan - total_pengeluaran;
    let selisih = saldo_akhir - saldo_seharusnya;

    conn.execute(
        "UPDATE shift SET status='closed', saldo_akhir=?1, total_penjualan=?2, total_pengeluaran=?3, selisih=?4, catatan=?5, closed_at=datetime('now') WHERE id=?6",
        params![saldo_akhir, total_penjualan, total_pengeluaran, selisih, catatan, id],
    )
    .map_err(|e| format!("Gagal tutup shift: {e}"))?;

    let mut stmt = conn
        .prepare("SELECT * FROM shift WHERE id=?1")
        .map_err(|e| e.to_string())?;
    let shift = stmt
        .query_row(params![id], |row| {
            Ok(Shift {
                id: row.get(0)?,
                nama: row.get(1)?,
                status: row.get(2)?,
                saldo_awal: row.get(3)?,
                saldo_akhir: row.get(4)?,
                total_penjualan: row.get(5)?,
                total_pengeluaran: row.get(6)?,
                selisih: row.get(7)?,
                catatan: row.get(8)?,
                opened_at: row.get(9)?,
                closed_at: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(shift)
}
