use crate::db::DbState;
use crate::models::produk::{Produk, ProdukInput};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn list_produk(
    state: State<DbState>,
    search: Option<String>,
    kategori_id: Option<i64>,
    only_active: Option<bool>,
) -> Result<Vec<Produk>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT p.id, p.kategori_id, k.nama, p.nama, p.sku, p.satuan,
                p.harga_beli, p.harga_jual, p.stok, p.stok_minimum,
                p.is_active, p.created_at, p.updated_at
         FROM produk p
         LEFT JOIN kategori k ON k.id = p.kategori_id
         WHERE 1=1",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 0;

    if only_active.unwrap_or(true) {
        param_idx += 1;
        sql.push_str(&format!(" AND p.is_active = ?{}", param_idx));
        param_values.push(Box::new(1i64));
    }
    if let Some(ref s) = search {
        param_idx += 1;
        sql.push_str(&format!(" AND p.nama LIKE ?{}", param_idx));
        param_values.push(Box::new(format!("%{}%", s)));
    }
    if let Some(kid) = kategori_id {
        param_idx += 1;
        sql.push_str(&format!(" AND p.kategori_id = ?{}", param_idx));
        param_values.push(Box::new(kid));
    }

    sql.push_str(" ORDER BY p.nama ASC");

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(Produk {
                id: row.get(0)?,
                kategori_id: row.get(1)?,
                kategori_nama: row.get(2)?,
                nama: row.get(3)?,
                sku: row.get(4)?,
                satuan: row.get(5)?,
                harga_beli: row.get(6)?,
                harga_jual: row.get(7)?,
                stok: row.get(8)?,
                stok_minimum: row.get(9)?,
                is_active: row.get::<_, i64>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
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
pub fn get_produk(state: State<DbState>, id: i64) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT p.id, p.kategori_id, k.nama, p.nama, p.sku, p.satuan,
                p.harga_beli, p.harga_jual, p.stok, p.stok_minimum,
                p.is_active, p.created_at, p.updated_at
         FROM produk p
         LEFT JOIN kategori k ON k.id = p.kategori_id
         WHERE p.id = ?1",
        params![id],
        |row| {
            Ok(Produk {
                id: row.get(0)?,
                kategori_id: row.get(1)?,
                kategori_nama: row.get(2)?,
                nama: row.get(3)?,
                sku: row.get(4)?,
                satuan: row.get(5)?,
                harga_beli: row.get(6)?,
                harga_jual: row.get(7)?,
                stok: row.get(8)?,
                stok_minimum: row.get(9)?,
                is_active: row.get::<_, i64>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        },
    )
    .map_err(|e| format!("Produk tidak ditemukan: {}", e))
}

#[tauri::command]
pub fn create_produk(state: State<DbState>, input: ProdukInput) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO produk (kategori_id, nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.kategori_id,
            input.nama,
            input.sku,
            input.satuan.unwrap_or_else(|| "pcs".to_string()),
            input.harga_beli.unwrap_or(0),
            input.harga_jual,
            input.stok.unwrap_or(0),
            input.stok_minimum.unwrap_or(0),
        ],
    )
    .map_err(|e| format!("Gagal simpan produk: {}", e))?;
    let id = conn.last_insert_rowid();
    // Query langsung tanpa fungsi terpisah untuk hindari borrow conflict
    let produk = conn
        .query_row(
            "SELECT p.id, p.kategori_id, k.nama, p.nama, p.sku, p.satuan,
                p.harga_beli, p.harga_jual, p.stok, p.stok_minimum,
                p.is_active, p.created_at, p.updated_at
         FROM produk p
         LEFT JOIN kategori k ON k.id = p.kategori_id
         WHERE p.id = ?1",
            params![id],
            |row| {
                Ok(Produk {
                    id: row.get(0)?,
                    kategori_id: row.get(1)?,
                    kategori_nama: row.get(2)?,
                    nama: row.get(3)?,
                    sku: row.get(4)?,
                    satuan: row.get(5)?,
                    harga_beli: row.get(6)?,
                    harga_jual: row.get(7)?,
                    stok: row.get(8)?,
                    stok_minimum: row.get(9)?,
                    is_active: row.get::<_, i64>(10)? != 0,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            },
        )
        .map_err(|e| format!("Gagal mengambil produk baru: {}", e))?;
    Ok(produk)
}

#[tauri::command]
pub fn update_produk(state: State<DbState>, id: i64, input: ProdukInput) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE produk SET kategori_id=?1, nama=?2, sku=?3, satuan=?4,
         harga_beli=?5, harga_jual=?6, stok=?7, stok_minimum=?8,
         updated_at=datetime('now')
         WHERE id=?9",
        params![
            input.kategori_id,
            input.nama,
            input.sku,
            input.satuan.unwrap_or_else(|| "pcs".to_string()),
            input.harga_beli.unwrap_or(0),
            input.harga_jual,
            input.stok.unwrap_or(0),
            input.stok_minimum.unwrap_or(0),
            id,
        ],
    )
    .map_err(|e| format!("Gagal update produk: {}", e))?;
    // Query langsung tanpa fungsi terpisah
    let produk = conn
        .query_row(
            "SELECT p.id, p.kategori_id, k.nama, p.nama, p.sku, p.satuan,
                p.harga_beli, p.harga_jual, p.stok, p.stok_minimum,
                p.is_active, p.created_at, p.updated_at
         FROM produk p
         LEFT JOIN kategori k ON k.id = p.kategori_id
         WHERE p.id = ?1",
            params![id],
            |row| {
                Ok(Produk {
                    id: row.get(0)?,
                    kategori_id: row.get(1)?,
                    kategori_nama: row.get(2)?,
                    nama: row.get(3)?,
                    sku: row.get(4)?,
                    satuan: row.get(5)?,
                    harga_beli: row.get(6)?,
                    harga_jual: row.get(7)?,
                    stok: row.get(8)?,
                    stok_minimum: row.get(9)?,
                    is_active: row.get::<_, i64>(10)? != 0,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            },
        )
        .map_err(|e| format!("Gagal mengambil produk: {}", e))?;
    Ok(produk)
}

#[tauri::command]
pub fn delete_produk(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // Soft delete — set is_active=0 biar histori transaksi tetap valid
    conn.execute(
        "UPDATE produk SET is_active = 0, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Gagal hapus produk: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_produk_low_stock(state: State<DbState>) -> Result<Vec<Produk>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.kategori_id, k.nama, p.nama, p.sku, p.satuan,
                    p.harga_beli, p.harga_jual, p.stok, p.stok_minimum,
                    p.is_active, p.created_at, p.updated_at
             FROM produk p
             LEFT JOIN kategori k ON k.id = p.kategori_id
             WHERE p.is_active = 1 AND p.stok < p.stok_minimum
             ORDER BY p.stok ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Produk {
                id: row.get(0)?,
                kategori_id: row.get(1)?,
                kategori_nama: row.get(2)?,
                nama: row.get(3)?,
                sku: row.get(4)?,
                satuan: row.get(5)?,
                harga_beli: row.get(6)?,
                harga_jual: row.get(7)?,
                stok: row.get(8)?,
                stok_minimum: row.get(9)?,
                is_active: row.get::<_, i64>(10)? != 0,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
