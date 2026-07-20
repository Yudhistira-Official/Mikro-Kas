//! Command keuangan terintegrasi.
//!
//! Prinsip data:
//!   - Pemasukan otomatis berasal dari transaksi penjualan.
//!   - Pengeluaran manual berasal dari tabel kas.
//!   - Pembelian stok dihitung sebagai pengeluaran otomatis.
//!   - Retur penjualan sudah dicatat sebagai kas pengeluaran oleh command retur.
//! Ini mencegah mismatch karena penjualan tidak perlu dicatat dua kali ke kas.
use crate::db::DbState;
use crate::models::kas::{Kas, KasInput};
use rusqlite::params;
use tauri::State;

fn map_kas_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Kas> {
    Ok(Kas {
        id: row.get(0)?,
        tipe: row.get(1)?,
        kategori: row.get(2)?,
        jumlah: row.get(3)?,
        keterangan: row.get(4)?,
        tanggal: row.get(5)?,
    })
}

#[tauri::command]
pub fn list_kas(
    state: State<DbState>,
    tipe: Option<String>,
    dari: Option<String>,
    sampai: Option<String>,
) -> Result<Vec<Kas>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let dari_sql = dari.unwrap_or_else(|| "0000-01-01".to_string());
    let sampai_sql = sampai
        .map(|d| format!("{} 23:59:59", d))
        .unwrap_or_else(|| "9999-12-31 23:59:59".to_string());

    // Union view ringan: penjualan otomatis + pembelian otomatis + kas pengeluaran manual.
    let mut sql = String::from(
        "SELECT id, tipe, kategori, jumlah, keterangan, tanggal FROM (
            SELECT id, 'pemasukan' AS tipe, 'Penjualan' AS kategori, total AS jumlah,
                   'Transaksi penjualan otomatis' AS keterangan, tanggal
            FROM transaksi
            WHERE tipe='penjualan' AND tanggal BETWEEN ?1 AND ?2
            UNION ALL
            SELECT -id AS id, 'pengeluaran' AS tipe, 'Pembelian Stok' AS kategori, total AS jumlah,
                   'Restock/pembelian otomatis' AS keterangan, tanggal
            FROM transaksi
            WHERE tipe='pembelian' AND tanggal BETWEEN ?1 AND ?2
            UNION ALL
            SELECT id, tipe, kategori, jumlah, keterangan, tanggal
            FROM kas
            WHERE tipe='pengeluaran' AND tanggal BETWEEN ?1 AND ?2
        ) WHERE 1=1",
    );
    if let Some(t) = tipe {
        sql.push_str(" AND tipe = ?3 ORDER BY tanggal DESC, id DESC");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![dari_sql, sampai_sql, t], map_kas_row)
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
        return Ok(result);
    }
    sql.push_str(" ORDER BY tanggal DESC, id DESC");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![dari_sql, sampai_sql], map_kas_row)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_kas(state: State<DbState>, input: KasInput) -> Result<Kas, String> {
    if input.tipe != "pengeluaran" {
        return Err(
            "Pemasukan dibuat otomatis dari penjualan. Input manual hanya untuk pengeluaran."
                .into(),
        );
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tanggal = input
        .tanggal
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
    conn.execute(
        "INSERT INTO kas (tipe, kategori, jumlah, keterangan, tanggal) VALUES ('pengeluaran', ?1, ?2, ?3, ?4)",
        params![input.kategori, input.jumlah, input.keterangan, tanggal],
    )
    .map_err(|e| format!("Gagal simpan kas: {}", e))?;
    let id = conn.last_insert_rowid();
    let mut stmt = conn
        .prepare("SELECT id, tipe, kategori, jumlah, keterangan, tanggal FROM kas WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], map_kas_row)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_kas(state: State<DbState>, id: i64) -> Result<(), String> {
    if id < 0 {
        return Err("Data otomatis pembelian tidak bisa dihapus dari Keuangan. Hapus/edit transaksi asalnya.".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM kas WHERE id = ?1 AND tipe='pengeluaran'",
        params![id],
    )
    .map_err(|e| format!("Gagal hapus kas: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_ringkasan_kas(
    state: State<DbState>,
    dari: String,
    sampai: String,
) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);
    let pemasukan: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM transaksi WHERE tipe='penjualan' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let pembelian: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM transaksi WHERE tipe='pembelian' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let pengeluaran_manual: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(jumlah), 0) FROM kas WHERE tipe='pengeluaran' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "pemasukan": pemasukan,
        "pengeluaran": pembelian + pengeluaran_manual,
        "pembelian": pembelian,
        "pengeluaran_manual": pengeluaran_manual
    }))
}
