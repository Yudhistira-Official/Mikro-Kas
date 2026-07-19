use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct Ringkasan {
    pub total_penjualan: i64,
    pub total_pembelian: i64,
    pub total_pemasukan_kas: i64,
    pub total_pengeluaran_kas: i64,
}

#[derive(Debug, Serialize)]
pub struct PenjualanHarian {
    pub hari: String,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct ProdukTerlaris {
    pub nama: String,
    pub total_qty: i64,
    pub total_revenue: i64,
}

/// Ringkasan keuntungan laporan penjualan.
/// ponytail: modal dihitung dari harga_beli produk SAAT INI, bukan historical snapshot.
/// Upgrade path: tambah kolom harga_beli_saat_transaksi di transaksi_item.
#[derive(Debug, Serialize)]
pub struct KeuntunganPenjualan {
    pub total_penjualan: i64,
    pub total_modal: i64,
    pub total_keuntungan: i64,
}

#[tauri::command]
pub fn get_ringkasan(
    state: State<DbState>,
    dari: String,
    sampai: String,
) -> Result<Ringkasan, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);

    let total_penjualan: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM transaksi WHERE tipe='penjualan' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let total_pembelian: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM transaksi WHERE tipe='pembelian' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let total_pemasukan_kas: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(jumlah), 0) FROM kas WHERE tipe='pemasukan' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let total_pengeluaran_kas: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(jumlah), 0) FROM kas WHERE tipe='pengeluaran' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(Ringkasan {
        total_penjualan,
        total_pembelian,
        total_pemasukan_kas,
        total_pengeluaran_kas,
    })
}

#[tauri::command]
pub fn get_penjualan_harian(
    state: State<DbState>,
    dari: String,
    sampai: String,
) -> Result<Vec<PenjualanHarian>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);
    let mut stmt = conn
        .prepare(
            "SELECT date(tanggal) AS hari, SUM(total) AS total
             FROM transaksi
             WHERE tipe='penjualan' AND tanggal BETWEEN ?1 AND ?2
             GROUP BY date(tanggal)
             ORDER BY hari ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![dari, sampai_with_time], |row| {
            Ok(PenjualanHarian {
                hari: row.get(0)?,
                total: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_produk_terlaris(
    state: State<DbState>,
    dari: String,
    sampai: String,
    limit: Option<i64>,
) -> Result<Vec<ProdukTerlaris>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);
    let limit_val = limit.unwrap_or(10);
    let sql = format!(
        "SELECT p.nama, SUM(ti.qty) AS total_qty, SUM(ti.subtotal) AS total_revenue
         FROM transaksi_item ti
         JOIN produk p ON p.id = ti.produk_id
         JOIN transaksi t ON t.id = ti.transaksi_id
         WHERE t.tipe = 'penjualan' AND t.tanggal BETWEEN ?1 AND ?2
         GROUP BY p.id
         ORDER BY total_qty DESC
         LIMIT {}",
        limit_val
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![dari, sampai_with_time], |row| {
            Ok(ProdukTerlaris {
                nama: row.get(0)?,
                total_qty: row.get(1)?,
                total_revenue: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Hitung total penjualan, modal, dan keuntungan untuk PDF laporan.
#[tauri::command]
pub fn get_keuntungan_penjualan(
    state: State<DbState>,
    dari: String,
    sampai: String,
) -> Result<KeuntunganPenjualan, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);

    // Profit = subtotal penjualan - harga_beli saat ini * qty.
    // COALESCE menjaga PDF tetap bisa dibuat walau belum ada transaksi.
    let (total_penjualan, total_modal): (i64, i64) = conn
        .query_row(
            "SELECT
                COALESCE(SUM(ti.subtotal), 0) AS total_penjualan,
                COALESCE(SUM(p.harga_beli * ti.qty), 0) AS total_modal
             FROM transaksi_item ti
             JOIN transaksi t ON t.id = ti.transaksi_id
             JOIN produk p ON p.id = ti.produk_id
             WHERE t.tipe = 'penjualan' AND t.tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    Ok(KeuntunganPenjualan {
        total_penjualan,
        total_modal,
        total_keuntungan: total_penjualan - total_modal,
    })
}
