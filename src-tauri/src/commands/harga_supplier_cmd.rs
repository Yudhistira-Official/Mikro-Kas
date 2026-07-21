// harga_supplier_cmd.rs — Command CRUD catatan harga supplier.
// Design ref: KasGo — Catatan Harga Supplier untuk perbandingan harga.
use crate::db::DbState;
use crate::models::harga_supplier::{CatatanHargaSupplier, HargaSupplierInput};
use rusqlite::params;
use tauri::State;

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CatatanHargaSupplier> {
    Ok(CatatanHargaSupplier {
        id: row.get(0)?,
        supplier_id: row.get(1)?,
        produk_id: row.get(2)?,
        produk_nama: row.get(3)?,
        harga: row.get(4)?,
        satuan: row.get(5)?,
        catatan: row.get(6)?,
        created_at: row.get(7)?,
    })
}

#[tauri::command]
pub fn list_catatan_harga_supplier(
    state: State<DbState>,
    supplier_id: i64,
) -> Result<Vec<CatatanHargaSupplier>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ch.id, ch.supplier_id, ch.produk_id, p.nama, ch.harga, ch.satuan, ch.catatan, ch.created_at
             FROM catatan_harga_supplier ch
             JOIN produk p ON p.id = ch.produk_id
             WHERE ch.supplier_id = ?1
             ORDER BY ch.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![supplier_id], map_row)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_catatan_harga_supplier(
    state: State<DbState>,
    input: HargaSupplierInput,
) -> Result<CatatanHargaSupplier, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO catatan_harga_supplier (supplier_id, produk_id, harga, satuan, catatan) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.supplier_id,
            input.produk_id,
            input.harga,
            input.satuan,
            input.catatan
        ],
    )
    .map_err(|e| format!("Gagal simpan catatan harga: {e}"))?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT ch.id, ch.supplier_id, ch.produk_id, p.nama, ch.harga, ch.satuan, ch.catatan, ch.created_at
         FROM catatan_harga_supplier ch
         JOIN produk p ON p.id = ch.produk_id
         WHERE ch.id = ?1",
        params![id],
        map_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_catatan_harga_supplier(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM catatan_harga_supplier WHERE id=?1",
        params![id],
    )
    .map_err(|e| format!("Gagal hapus catatan harga: {e}"))?;
    Ok(())
}
