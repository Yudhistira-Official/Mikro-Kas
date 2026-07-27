use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize)]
pub struct Serial {
    pub id: i64,
    pub produk_id: i64,
    pub serial_number: String,
    pub gudang_id: i64,
    pub status: String,
    pub transaksi_id: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct CheckSerialResult {
    pub exists: bool,
    pub id: Option<i64>,
    pub produk_id: Option<i64>,
    pub serial_number: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeItem {
    pub serial_id: i64,
    pub produk_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeSerialInput {
    pub ref_number: String,
    pub items: Vec<FinalizeItem>,
}

#[tauri::command]
pub fn list_serial(state: State<DbState>, produk_id: i64) -> Result<Vec<Serial>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, produk_id, serial_number, gudang_id, status, transaksi_id, created_at FROM serial WHERE produk_id=?1 ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![produk_id], |row| {
            Ok(Serial {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                serial_number: row.get(2)?,
                gudang_id: row.get(3)?,
                status: row.get(4)?,
                transaksi_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_serial_number(
    state: State<DbState>,
    serial_number: String,
) -> Result<CheckSerialResult, String> {
    if serial_number.trim().is_empty() {
        return Err("Serial number tidak boleh kosong".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, produk_id, serial_number, status FROM serial WHERE serial_number = ?1",
        params![serial_number.trim()],
        |row| {
            Ok(CheckSerialResult {
                exists: true,
                id: Some(row.get(0)?),
                produk_id: Some(row.get(1)?),
                serial_number: Some(row.get(2)?),
                status: Some(row.get(3)?),
            })
        },
    );
    match result {
        Ok(r) => Ok(r),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(CheckSerialResult {
            exists: false,
            id: None,
            produk_id: None,
            serial_number: None,
            status: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn add_serial(
    state: State<DbState>,
    produk_id: i64,
    serial_number: String,
    gudang_id: i64,
) -> Result<i64, String> {
    if serial_number.trim().is_empty() {
        return Err("Serial number tidak boleh kosong".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO serial (produk_id, serial_number, gudang_id) VALUES (?1, ?2, ?3)",
        params![produk_id, serial_number.trim(), gudang_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_serial_status(
    state: State<DbState>,
    id: i64,
    status: String,
    transaksi_id: Option<i64>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE serial SET status=?1, transaksi_id=?2 WHERE id=?3",
        params![status, transaksi_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_serial(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM serial WHERE id=?1 AND status='ready'",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn finalize_serial_transaction(
    state: State<DbState>,
    input: FinalizeSerialInput,
) -> Result<(), String> {
    if input.items.is_empty() {
        return Err("Tidak ada item untuk diselesaikan".into());
    }
    let ref_number = input.ref_number.trim().to_string();
    if ref_number.is_empty() {
        return Err("No. referensi wajib diisi".into());
    }

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Check for duplicate serial_id across items
    let mut seen = std::collections::HashSet::new();
    for item in &input.items {
        if !seen.insert(item.serial_id) {
            return Err(format!("Serial ID {} duplikat dalam input", item.serial_id));
        }
    }

    for item in &input.items {
        let (current_status, current_produk): (String, i64) = tx
            .query_row(
                "SELECT status, produk_id FROM serial WHERE id = ?1",
                params![item.serial_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| format!("Serial ID {} tidak ditemukan", item.serial_id))?;

        if current_status != "ready" {
            return Err(format!(
                "Serial ID {} berstatus '{}', bukan 'ready'",
                item.serial_id, current_status
            ));
        }
        if current_produk != item.produk_id {
            return Err(format!(
                "Serial ID {} bukan milik produk ID {}",
                item.serial_id, item.produk_id
            ));
        }

        tx.execute(
            "UPDATE serial SET status = 'terjual', transaksi_id = ?1 WHERE id = ?2",
            params![ref_number, item.serial_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
