//! Commands customer display — data untuk layar customer
use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct CustomerDisplayData {
    pub total: i64,
    pub items: Vec<CustomerDisplayItem>,
}

#[derive(Debug, Serialize)]
pub struct CustomerDisplayItem {
    pub nama: String,
    pub qty: i64,
    pub harga_satuan: i64,
    pub subtotal: i64,
}

#[tauri::command]
pub fn get_customer_display_data(
    state: State<DbState>,
    transaksi_id: i64,
) -> Result<CustomerDisplayData, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let total: i64 = conn
        .query_row(
            "SELECT total FROM transaksi WHERE id=?1",
            params![transaksi_id],
            |row| row.get(0),
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

    let items_iter = stmt
        .query_map(params![transaksi_id], |row| {
            Ok(CustomerDisplayItem {
                nama: row.get(0)?,
                qty: row.get(1)?,
                harga_satuan: row.get(2)?,
                subtotal: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for item in items_iter {
        items.push(item.map_err(|e| e.to_string())?);
    }

    Ok(CustomerDisplayData { total, items })
}
