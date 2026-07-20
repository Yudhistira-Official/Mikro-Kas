//! Commands Cashbox — saldo kas lokal + log mutasi.
use crate::db::DbState;
use crate::models::cashbox::{Cashbox, CashboxMutasi, MutasiInput};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn list_cashbox(state: State<DbState>) -> Result<Vec<Cashbox>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nama, saldo, created_at FROM cashbox ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Cashbox {
                id: row.get(0)?,
                nama: row.get(1)?,
                saldo: row.get(2)?,
                created_at: row.get(3)?,
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
pub fn create_cashbox(state: State<DbState>, nama: String) -> Result<Cashbox, String> {
    let nama = nama.trim();
    if nama.is_empty() {
        return Err("Nama cashbox wajib diisi".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO cashbox (nama, saldo) VALUES (?1, 0)",
        params![nama],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, nama, saldo, created_at FROM cashbox WHERE id=?1",
        params![id],
        |row| {
            Ok(Cashbox {
                id: row.get(0)?,
                nama: row.get(1)?,
                saldo: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mutasi_cashbox(state: State<DbState>, input: MutasiInput) -> Result<(), String> {
    if input.jumlah <= 0 {
        return Err("Jumlah harus lebih dari 0".into());
    }
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    match input.tipe.as_str() {
        "tambah" => {
            tx.execute(
                "UPDATE cashbox SET saldo = saldo + ?1 WHERE id=?2",
                params![input.jumlah, input.cashbox_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "kurang" => {
            tx.execute(
                "UPDATE cashbox SET saldo = saldo - ?1 WHERE id=?2 AND saldo >= ?1",
                params![input.jumlah, input.cashbox_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "pindah" => {
            let dari = input.dari_cashbox_id.ok_or("Cashbox asal wajib diisi")?;
            tx.execute(
                "UPDATE cashbox SET saldo = saldo - ?1 WHERE id=?2 AND saldo >= ?1",
                params![input.jumlah, dari],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE cashbox SET saldo = saldo + ?1 WHERE id=?2",
                params![input.jumlah, input.cashbox_id],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => return Err("Tipe mutasi tidak valid".into()),
    }
    tx.execute("INSERT INTO cashbox_mutasi (cashbox_id, tipe, jumlah, dari_cashbox_id, keterangan) VALUES (?1, ?2, ?3, ?4, ?5)", params![input.cashbox_id, input.tipe, input.jumlah, input.dari_cashbox_id, input.keterangan]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_cashbox_mutasi(
    state: State<DbState>,
    cashbox_id: Option<i64>,
) -> Result<Vec<CashboxMutasi>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let (sql, params_box): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(id) =
        cashbox_id
    {
        ("SELECT id, cashbox_id, tipe, jumlah, dari_cashbox_id, keterangan, tanggal FROM cashbox_mutasi WHERE cashbox_id=?1 ORDER BY tanggal DESC", vec![Box::new(id)])
    } else {
        ("SELECT id, cashbox_id, tipe, jumlah, dari_cashbox_id, keterangan, tanggal FROM cashbox_mutasi ORDER BY tanggal DESC", vec![])
    };
    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        params_box.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(CashboxMutasi {
                id: row.get(0)?,
                cashbox_id: row.get(1)?,
                tipe: row.get(2)?,
                jumlah: row.get(3)?,
                dari_cashbox_id: row.get(4)?,
                keterangan: row.get(5)?,
                tanggal: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
