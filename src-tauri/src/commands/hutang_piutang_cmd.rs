//! Commands Hutang/Piutang — tracking tagihan sederhana tanpa login.
use crate::db::DbState;
use crate::models::hutang_piutang::{BayarHutangPiutangInput, HutangPiutang, HutangPiutangInput};
use rusqlite::params;
use tauri::State;

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HutangPiutang> {
    Ok(HutangPiutang {
        id: row.get(0)?,
        tipe: row.get(1)?,
        kontak_id: row.get(2)?,
        kontak_tipe: row.get(3)?,
        jumlah: row.get(4)?,
        jumlah_bayar: row.get(5)?,
        keterangan: row.get(6)?,
        status: row.get(7)?,
        tanggal: row.get(8)?,
        created_at: row.get(9)?,
        jatuh_tempo: row.get(10)?,
    })
}

#[tauri::command]
pub fn list_hutang_piutang(
    state: State<DbState>,
    tipe: Option<String>,
    status: Option<String>,
) -> Result<Vec<HutangPiutang>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from("SELECT id, tipe, kontak_id, kontak_tipe, jumlah, jumlah_bayar, keterangan, status, tanggal, created_at, jatuh_tempo FROM hutang_piutang WHERE 1=1");
    let mut params_list: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(t) = tipe {
        sql.push_str(" AND tipe=?");
        params_list.push(Box::new(t));
    }
    if let Some(s) = status {
        sql.push_str(" AND status=?");
        params_list.push(Box::new(s));
    }
    sql.push_str(" ORDER BY CASE WHEN jatuh_tempo IS NULL OR jatuh_tempo = '' THEN 1 ELSE 0 END, jatuh_tempo ASC, tanggal DESC, id DESC");
    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        params_list.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), map_row)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_hutang_piutang(
    state: State<DbState>,
    input: HutangPiutangInput,
) -> Result<HutangPiutang, String> {
    if input.jumlah <= 0 {
        return Err("Jumlah harus lebih dari 0".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO hutang_piutang (tipe, kontak_id, kontak_tipe, jumlah, keterangan, tanggal, jatuh_tempo) VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6, datetime('now')), ?7)",
        params![input.tipe, input.kontak_id, input.kontak_tipe, input.jumlah, input.keterangan, input.tanggal, input.jatuh_tempo],
    ).map_err(|e| format!("Gagal menyimpan hutang/piutang: {e}"))?;
    let id = conn.last_insert_rowid();
    conn.query_row("SELECT id, tipe, kontak_id, kontak_tipe, jumlah, jumlah_bayar, keterangan, status, tanggal, created_at, jatuh_tempo FROM hutang_piutang WHERE id=?1", params![id], map_row).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bayar_hutang_piutang(
    state: State<DbState>,
    input: BayarHutangPiutangInput,
) -> Result<(), String> {
    if input.jumlah_bayar <= 0 {
        return Err("Nominal bayar harus lebih dari 0".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE hutang_piutang SET jumlah_bayar = MIN(jumlah, jumlah_bayar + ?1), status = CASE WHEN jumlah_bayar + ?1 >= jumlah THEN 'lunas' ELSE 'belum_lunas' END WHERE id=?2",
        params![input.jumlah_bayar, input.id],
    ).map_err(|e| format!("Gagal bayar: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_hutang_piutang(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM hutang_piutang WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
