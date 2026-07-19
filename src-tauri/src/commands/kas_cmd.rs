use crate::db::DbState;
use crate::models::kas::{Kas, KasInput};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn list_kas(
    state: State<DbState>,
    tipe: Option<String>,
    dari: Option<String>,
    sampai: Option<String>,
) -> Result<Vec<Kas>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut sql =
        String::from("SELECT id, tipe, kategori, jumlah, keterangan, tanggal FROM kas WHERE 1=1");
    let mut idx = 0;
    let mut params_list: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref t) = tipe {
        idx += 1;
        sql.push_str(&format!(" AND tipe = ?{}", idx));
        params_list.push(Box::new(t.clone()));
    }
    if let Some(ref d) = dari {
        idx += 1;
        sql.push_str(&format!(" AND tanggal >= ?{}", idx));
        params_list.push(Box::new(d.clone()));
    }
    if let Some(ref d) = sampai {
        idx += 1;
        sql.push_str(&format!(" AND tanggal <= ?{}", idx));
        params_list.push(Box::new(format!("{} 23:59:59", d)));
    }
    sql.push_str(" ORDER BY tanggal DESC, id DESC");

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        params_list.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(Kas {
                id: row.get(0)?,
                tipe: row.get(1)?,
                kategori: row.get(2)?,
                jumlah: row.get(3)?,
                keterangan: row.get(4)?,
                tanggal: row.get(5)?,
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
pub fn create_kas(state: State<DbState>, input: KasInput) -> Result<Kas, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tanggal = input
        .tanggal
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
    conn.execute(
        "INSERT INTO kas (tipe, kategori, jumlah, keterangan, tanggal) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.tipe,
            input.kategori,
            input.jumlah,
            input.keterangan,
            tanggal
        ],
    )
    .map_err(|e| format!("Gagal simpan kas: {}", e))?;
    let id = conn.last_insert_rowid();
    let mut stmt = conn
        .prepare("SELECT id, tipe, kategori, jumlah, keterangan, tanggal FROM kas WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |row| {
        Ok(Kas {
            id: row.get(0)?,
            tipe: row.get(1)?,
            kategori: row.get(2)?,
            jumlah: row.get(3)?,
            keterangan: row.get(4)?,
            tanggal: row.get(5)?,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_kas(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM kas WHERE id = ?1", params![id])
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
            "SELECT COALESCE(SUM(jumlah), 0) FROM kas WHERE tipe='pemasukan' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let pengeluaran: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(jumlah), 0) FROM kas WHERE tipe='pengeluaran' AND tanggal BETWEEN ?1 AND ?2",
            params![dari, sampai_with_time],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "pemasukan": pemasukan, "pengeluaran": pengeluaran }))
}
