use crate::db::DbState;
use chrono::Local;
use rusqlite::{params, Transaction};
use serde::{Deserialize, Serialize};
use tauri::State;

const JENIS_GUDANG: [&str; 3] = ["gudang", "retail", "mobile"];

#[derive(Debug, Serialize)]
pub struct Gudang {
    pub id: i64,
    pub kode: String,
    pub nama: String,
    pub alamat: Option<String>,
    pub jenis: String,
    pub catatan: Option<String>,
    pub created_at: String,
    pub is_active: bool,
    pub is_default: bool,
}

#[derive(Debug, Serialize)]
pub struct StokGudang {
    pub gudang_id: i64,
    pub gudang_nama: String,
    pub produk_id: i64,
    pub qty: f64,
}

#[derive(Debug, Serialize)]
pub struct TransferStok {
    pub id: i64,
    pub gudang_asal_id: i64,
    pub gudang_tujuan_id: i64,
    pub tgl_transfer: String,
    pub status: String,
    pub catatan: Option<String>,
}

fn format_gudang_kode(date: &str, sequence: i64) -> Result<String, String> {
    let digits = date.replace('-', "");
    if digits.len() != 8 || !digits.chars().all(|c| c.is_ascii_digit()) {
        return Err("Tanggal kode gudang tidak valid".into());
    }
    if !(1..=999).contains(&sequence) {
        return Err("Nomor urut gudang sudah mencapai batas 999".into());
    }
    Ok(format!("{digits}{sequence:03}"))
}

fn validate_jenis(jenis: &str) -> Result<(), String> {
    if JENIS_GUDANG.contains(&jenis) {
        Ok(())
    } else {
        Err("Jenis gudang harus gudang, retail, atau mobile".into())
    }
}

fn next_gudang_sequence(tx: &Transaction<'_>) -> Result<i64, String> {
    let max_sequence: Option<i64> = tx
        .query_row(
            "SELECT MAX(CAST(substr(kode, 9, 3) AS INTEGER)) FROM gudang WHERE kode IS NOT NULL AND length(kode) >= 11",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(max_sequence.unwrap_or(0) + 1)
}

#[tauri::command]
 pub fn list_gudang(state: State<DbState>) -> Result<Vec<Gudang>, String> {
     let conn = state.0.lock().map_err(|e| e.to_string())?;
     crate::db::ensure_column(&conn, "gudang", "kode", "TEXT");
     crate::db::ensure_column(&conn, "gudang", "jenis", "TEXT DEFAULT 'gudang'");
     crate::db::ensure_column(&conn, "gudang", "catatan", "TEXT");
     crate::db::ensure_column(&conn, "gudang", "created_at", "TEXT DEFAULT (datetime('now'))");
     let mut stmt = conn.prepare("SELECT id, COALESCE(kode, ''), nama, alamat, COALESCE(jenis, 'gudang'), catatan, created_at, is_active, is_default FROM gudang ORDER BY is_default DESC, is_active DESC, kode ASC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Gudang {
                id: row.get(0)?,
                kode: row.get(1)?,
                nama: row.get(2)?,
                alamat: row.get(3)?,
                jenis: row.get(4)?,
                catatan: row.get(5)?,
                created_at: row.get(6)?,
                is_active: row.get::<_, i64>(7)? == 1,
                is_default: row.get::<_, i64>(8)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_gudang(
    state: State<DbState>,
    nama: String,
    alamat: Option<String>,
    jenis: Option<String>,
    catatan: Option<String>,
) -> Result<i64, String> {
    if nama.trim().is_empty() {
        return Err("Nama gudang tidak boleh kosong".into());
    }
    let jenis = jenis.unwrap_or_else(|| "gudang".into());
    validate_jenis(&jenis)?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let sequence = next_gudang_sequence(&tx)?;
    let kode = format_gudang_kode(&Local::now().format("%Y-%m-%d").to_string(), sequence)?;
    tx.execute(
        "INSERT INTO gudang (kode, nama, alamat, jenis, catatan, created_at, is_active) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), 1)",
        params![kode, nama.trim(), alamat, jenis, catatan],
    ).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}

/// Update nama dan alamat gudang.
///
/// Parameters:
/// - `id`: id gudang
/// - `nama`: nama baru
/// - `alamat`: alamat baru (opsional)
///
/// Returns: jumlah baris diubah
#[tauri::command]
pub fn update_gudang(
    state: State<DbState>,
    id: i64,
    nama: String,
    alamat: Option<String>,
    jenis: Option<String>,
    catatan: Option<String>,
    is_active: Option<bool>,
) -> Result<usize, String> {
    if nama.trim().is_empty() {
        return Err("Nama gudang tidak boleh kosong".into());
    }
    let jenis = jenis.unwrap_or_else(|| "gudang".into());
    validate_jenis(&jenis)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let active = is_active.unwrap_or(true);
    conn.execute(
        "UPDATE gudang SET nama=?1, alamat=?2, jenis=?3, catatan=?4, is_active=CASE WHEN is_default=1 THEN 1 ELSE ?5 END WHERE id=?6",
        params![nama.trim(), alamat, jenis, catatan, active as i64, id],
    )
    .map_err(|e| e.to_string())
}

/// Soft-delete gudang non-default.
///
/// Parameters:
/// - `id`: id gudang
///
/// Returns: jumlah baris diubah
#[tauri::command]
pub fn delete_gudang(state: State<DbState>, id: i64) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE gudang SET is_active=0 WHERE id=?1 AND is_default=0",
        params![id],
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hapus_gudang_permanen(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let is_default: bool = conn
        .query_row(
            "SELECT is_default FROM gudang WHERE id = ?1",
            params![id],
            |row| row.get::<_, i64>(0).map(|v| v == 1),
        )
        .map_err(|e| e.to_string())?;
    if is_default {
        return Err("Gudang default tidak dapat dihapus".into());
    }
    let is_active: bool = conn
        .query_row(
            "SELECT is_active FROM gudang WHERE id = ?1",
            params![id],
            |row| row.get::<_, i64>(0).map(|v| v == 1),
        )
        .map_err(|e| e.to_string())?;
    if is_active {
        return Err("Nonaktifkan gudang terlebih dahulu sebelum menghapus permanen".into());
    }
    let mut blockers = Vec::new();
    for (table, label) in [
        ("stok_gudang", "stok"),
        ("serial", "serial number"),
        ("stok_batch", "batch stok"),
        ("perakitan", "perakitan"),
    ] {
        let count: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE gudang_id = ?1"),
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if count > 0 {
            blockers.push(label);
        }
    }
    let transfer_count: i64 = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM transfer_stok WHERE gudang_asal_id = ?1 OR gudang_tujuan_id = ?1) + (SELECT COUNT(*) FROM transfer_stok_item WHERE transfer_id IN (SELECT id FROM transfer_stok WHERE gudang_asal_id = ?1 OR gudang_tujuan_id = ?1))",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if transfer_count > 0 {
        blockers.push("transfer stok");
    }
    if !blockers.is_empty() {
        return Err(format!(
            "Gudang masih memiliki data terkait: {}. Hapus data tersebut terlebih dahulu.",
            blockers.join(", ")
        ));
    }
    conn.execute(
        "DELETE FROM gudang WHERE id = ?1 AND is_default = 0",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_stok_per_gudang(
    state: State<DbState>,
    produk_id: i64,
) -> Result<Vec<StokGudang>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT sg.gudang_id, g.nama, sg.produk_id, sg.qty FROM stok_gudang sg JOIN gudang g ON g.id = sg.gudang_id WHERE sg.produk_id = ?1").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![produk_id], |row| {
            Ok(StokGudang {
                gudang_id: row.get(0)?,
                gudang_nama: row.get(1)?,
                produk_id: row.get(2)?,
                qty: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct TransferItem {
    pub produk_id: i64,
    pub qty: f64,
}

#[tauri::command]
pub fn transfer_stok(
    state: State<DbState>,
    gudang_asal_id: i64,
    gudang_tujuan_id: i64,
    items: Vec<TransferItem>,
    catatan: Option<String>,
) -> Result<i64, String> {
    if gudang_asal_id == gudang_tujuan_id {
        return Err("Gudang asal dan tujuan tidak boleh sama".into());
    }
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO transfer_stok (gudang_asal_id, gudang_tujuan_id, catatan) VALUES (?1, ?2, ?3)",
        params![gudang_asal_id, gudang_tujuan_id, catatan],
    )
    .map_err(|e| e.to_string())?;
    let transfer_id = tx.last_insert_rowid();
    for item in &items {
        if !item.qty.is_finite() || item.qty <= 0.0 {
            return Err(format!("Qty transfer produk {} harus bilangan positif", item.produk_id));
        }
        let tersedia: f64 = tx
            .query_row(
                "SELECT COALESCE(qty,0) FROM stok_gudang WHERE gudang_id=?1 AND produk_id=?2",
                params![gudang_asal_id, item.produk_id],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        if tersedia < item.qty {
            tx.rollback().ok();
            return Err(format!(
                "Stok produk {} kurang dari {}",
                item.produk_id, item.qty
            ));
        }
        tx.execute(
            "INSERT INTO transfer_stok_item (transfer_id, produk_id, qty) VALUES (?1, ?2, ?3)",
            params![transfer_id, item.produk_id, item.qty],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE stok_gudang SET qty = qty - ?1 WHERE gudang_id=?2 AND produk_id=?3",
            params![item.qty, gudang_asal_id, item.produk_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO stok_gudang (gudang_id, produk_id, qty) VALUES (?1, ?2, ?3) ON CONFLICT(gudang_id, produk_id) DO UPDATE SET qty = qty + ?3", params![gudang_tujuan_id, item.produk_id, item.qty]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(transfer_id)
}

#[tauri::command]
pub fn list_transfer_stok(state: State<DbState>) -> Result<Vec<TransferStok>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, gudang_asal_id, gudang_tujuan_id, tgl_transfer, status, catatan FROM transfer_stok ORDER BY tgl_transfer DESC LIMIT 100").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TransferStok {
                id: row.get(0)?,
                gudang_asal_id: row.get(1)?,
                gudang_tujuan_id: row.get(2)?,
                tgl_transfer: row.get(3)?,
                status: row.get(4)?,
                catatan: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{format_gudang_kode, next_gudang_sequence};
    use rusqlite::Connection;

    #[test]
    fn formats_gudang_code_with_global_three_digit_sequence() {
        assert_eq!(format_gudang_kode("2026-07-27", 1).unwrap(), "20260727001");
        assert_eq!(format_gudang_kode("2026-07-27", 10).unwrap(), "20260727010");
    }

    #[test]
    fn sequence_includes_soft_deleted_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE gudang (id INTEGER PRIMARY KEY, kode TEXT, is_active INTEGER DEFAULT 1);",
        )
        .unwrap();
        conn.execute("INSERT INTO gudang (kode) VALUES (?1)", ["20260727001"])
            .unwrap();
        conn.execute("INSERT INTO gudang (kode) VALUES (?1)", ["20260727002"])
            .unwrap();
        conn.execute("UPDATE gudang SET is_active = 0 WHERE id = 1", [])
            .unwrap();
        let tx = conn.transaction().unwrap();
        assert_eq!(next_gudang_sequence(&tx).unwrap(), 3);
    }
}
