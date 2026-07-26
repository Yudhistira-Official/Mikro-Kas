//! Commands import/export CSV — export produk, customer, supplier
use crate::db::DbState;
use tauri::State;

#[tauri::command]
pub fn export_produk_csv(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum FROM produk WHERE is_active=1 ORDER BY nama")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut csv = String::from("\u{FEFF}nama,sku,satuan,harga_beli,harga_jual,stok,stok_minimum\n");
    for row in rows {
        let (nama, sku, satuan, harga_beli, harga_jual, stok, stok_min) =
            row.map_err(|e| e.to_string())?;
        csv.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            escape_csv(&nama),
            escape_csv(&sku.unwrap_or_default()),
            escape_csv(&satuan),
            harga_beli,
            harga_jual,
            stok,
            stok_min
        ));
    }

    Ok(csv)
}

#[tauri::command]
pub fn export_customer_csv(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT nama, telepon, alamat FROM customer ORDER BY nama")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut csv = String::from("\u{FEFF}nama,telepon,alamat\n");
    for row in rows {
        let (nama, telepon, alamat) = row.map_err(|e| e.to_string())?;
        csv.push_str(&format!(
            "{},{},{}\n",
            escape_csv(&nama),
            escape_csv(&telepon.unwrap_or_default()),
            escape_csv(&alamat.unwrap_or_default())
        ));
    }

    Ok(csv)
}

#[tauri::command]
pub fn export_supplier_csv(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT nama, telepon, alamat FROM supplier ORDER BY nama")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut csv = String::from("\u{FEFF}nama,telepon,alamat\n");
    for row in rows {
        let (nama, telepon, alamat) = row.map_err(|e| e.to_string())?;
        csv.push_str(&format!(
            "{},{},{}\n",
            escape_csv(&nama),
            escape_csv(&telepon.unwrap_or_default()),
            escape_csv(&alamat.unwrap_or_default())
        ));
    }

    Ok(csv)
}

fn escape_csv(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
