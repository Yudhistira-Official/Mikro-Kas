// shift_cmd.rs — Shift management and cash count persistence.

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::user_cmd::AuthState;
use crate::db::DbState;

const ALLOWED_DENOMS: &[(i64, bool)] = &[
    (100_000, false),
    (50_000, false),
    (20_000, false),
    (10_000, false),
    (5_000, false),
    (2_000, false),
    (1_000, false),
    (500, true),
    (200, true),
    (100, true),
    (50, true),
    (25, true),
    (10, true),
    (1, true),
];

#[cfg(test)]
mod tests {
    use super::{
        authorize_shift_close, buka_shift_persist, has_persisted_pecahan, pendapatan_aktual,
        persisted_keys, require_authenticated_user, require_shift_access, total_akhir, total_awal,
        validate_closing_rows, validate_qty, variance, CashCountRow,
    };
    use crate::commands::user_cmd::{AuthState, User};
    use rusqlite::Connection;
    use std::sync::Mutex;

    #[test]
    fn unauthenticated_shift_action_is_rejected() {
        let auth = AuthState(Mutex::new(None));
        assert!(require_authenticated_user(&auth).is_err());
    }

    #[test]
    fn authenticated_shift_action_resolves_user_id() {
        let auth = AuthState(Mutex::new(Some(User {
            id: 42,
            username: "kasir".into(),
            nama_lengkap: Some("Kasir Test".into()),
            role: "kasir".into(),
            is_active: true,
            must_change_password: false,
        })));
        assert_eq!(require_authenticated_user(&auth).unwrap(), 42);
    }

    #[test]
    fn shift_cash_count_requires_authenticated_user() {
        let auth = AuthState(Mutex::new(None));
        assert!(require_authenticated_user(&auth).is_err());
    }

    #[test]
    fn legacy_no_owner_shift_requires_supervisor_or_admin() {
        let cashier = AuthState(Mutex::new(Some(User {
            id: 1,
            username: "kasir".into(),
            nama_lengkap: None,
            role: "kasir".into(),
            is_active: true,
            must_change_password: false,
        })));
        assert!(authorize_shift_close(&cashier, 1, None).is_err());
        for role in ["supervisor", "admin"] {
            let auth = AuthState(Mutex::new(Some(User {
                id: 1,
                username: "u".into(),
                nama_lengkap: None,
                role: role.into(),
                is_active: true,
                must_change_password: false,
            })));
            assert!(authorize_shift_close(&auth, 1, None).is_ok());
        }
    }

    #[test]
    fn shift_cash_count_allows_authorized_roles() {
        for role in ["kasir", "supervisor", "admin"] {
            let auth = AuthState(Mutex::new(Some(User {
                id: 1,
                username: "u".into(),
                nama_lengkap: None,
                role: role.into(),
                is_active: true,
                must_change_password: false,
            })));
            assert!(require_shift_access(&auth).is_ok());
        }
    }

    #[test]
    fn closing_count_rejects_caller_opening_quantity_mismatch() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE shift (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', saldo_awal INTEGER NOT NULL DEFAULT 0, saldo_akhir INTEGER, total_penjualan INTEGER NOT NULL DEFAULT 0, total_pengeluaran INTEGER NOT NULL DEFAULT 0, selisih INTEGER NOT NULL DEFAULT 0, catatan TEXT, opened_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), user_id INTEGER, cashbox_id INTEGER); CREATE TABLE cashbox_pecahan (id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL, denom INTEGER NOT NULL, qty_awal INTEGER NOT NULL DEFAULT 0, qty_akhir INTEGER NOT NULL DEFAULT 0, is_koin INTEGER NOT NULL DEFAULT 0, UNIQUE(shift_id, denom, is_koin));").unwrap();
        let rows = vec![CashCountRow {
            denom: 100_000,
            is_koin: false,
            qty_awal: 2,
            qty_akhir: 0,
        }];
        let mut conn = conn;
        let id = buka_shift_persist(&mut conn, "Pagi", 200_000, None, None, &rows).unwrap();
        let mut caller_rows = rows;
        caller_rows[0].qty_awal = 1;
        assert!(validate_closing_rows(&conn, id, &caller_rows).is_err());
    }

    #[test]
    fn zero_opening_count_persists_snapshot_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE shift (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', saldo_awal INTEGER NOT NULL DEFAULT 0, saldo_akhir INTEGER, total_penjualan INTEGER NOT NULL DEFAULT 0, total_pengeluaran INTEGER NOT NULL DEFAULT 0, selisih INTEGER NOT NULL DEFAULT 0, catatan TEXT, opened_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), user_id INTEGER, cashbox_id INTEGER); CREATE TABLE cashbox_pecahan (id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL, denom INTEGER NOT NULL, qty_awal INTEGER NOT NULL DEFAULT 0, qty_akhir INTEGER NOT NULL DEFAULT 0, is_koin INTEGER NOT NULL DEFAULT 0, UNIQUE(shift_id, denom, is_koin));").unwrap();
        let rows = vec![CashCountRow {
            denom: 100_000,
            is_koin: false,
            qty_awal: 0,
            qty_akhir: 0,
        }];
        let mut conn = conn;
        let id = buka_shift_persist(&mut conn, "Kosong", 0, None, None, &rows).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM cashbox_pecahan WHERE shift_id=?1",
                [id],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert!(has_persisted_pecahan(1));
    }

    #[test]
    fn opening_count_persists_rows_and_rejects_mismatched_total() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE shift (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', saldo_awal INTEGER NOT NULL DEFAULT 0, saldo_akhir INTEGER, total_penjualan INTEGER NOT NULL DEFAULT 0, total_pengeluaran INTEGER NOT NULL DEFAULT 0, selisih INTEGER NOT NULL DEFAULT 0, catatan TEXT, opened_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), user_id INTEGER, cashbox_id INTEGER); CREATE TABLE cashbox_pecahan (id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL, denom INTEGER NOT NULL, qty_awal INTEGER NOT NULL DEFAULT 0, qty_akhir INTEGER NOT NULL DEFAULT 0, is_koin INTEGER NOT NULL DEFAULT 0, UNIQUE(shift_id, denom, is_koin));").unwrap();
        let rows = vec![
            CashCountRow {
                denom: 100_000,
                is_koin: false,
                qty_awal: 2,
                qty_akhir: 0,
            },
            CashCountRow {
                denom: 500,
                is_koin: true,
                qty_awal: 4,
                qty_akhir: 0,
            },
        ];
        let mut conn = conn;
        let id = buka_shift_persist(&mut conn, "Pagi", 202_000, Some(7), Some(1), &rows).unwrap();
        assert_eq!(
            conn.query_row("SELECT saldo_awal FROM shift WHERE id=?1", [id], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            202_000
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM cashbox_pecahan WHERE shift_id=?1 AND qty_awal > 0",
                [id],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            2
        );
        assert!(buka_shift_persist(&mut conn, "Salah", 1, None, None, &rows).is_err());
    }

    #[test]
    fn cash_count_calculates_totals_and_variance() {
        let rows = vec![
            (100_000_i64, 5_i64, 12_i64),
            (50_000, 10, 15),
            (20_000, 10, 8),
            (10_000, 10, 5),
            (5_000, 10, 4),
            (2_000, 10, 5),
            (1_000, 10, 10),
            (1, 10_000, 10_000),
        ];
        assert_eq!(total_awal(&rows).unwrap(), 1_390_000);
        assert_eq!(total_akhir(&rows).unwrap(), 2_210_000);
        assert_eq!(pendapatan_aktual(2_210_000, 1_390_000).unwrap(), 820_000);
        assert_eq!(variance(820_000, 820_000).unwrap(), 0);
    }

    #[test]
    fn persisted_sparse_rows_keep_exact_denominations() {
        let rows = vec![
            CashCountRow {
                denom: 100_000,
                is_koin: false,
                qty_awal: 1,
                qty_akhir: 0,
            },
            CashCountRow {
                denom: 1,
                is_koin: true,
                qty_awal: 2,
                qty_akhir: 0,
            },
        ];
        let keys = persisted_keys(&rows);
        assert_eq!(keys, vec![(100_000, false), (1, true)]);
    }

    #[test]
    fn cash_count_marker_distinguishes_legacy_and_persisted_rows() {
        assert!(!has_persisted_pecahan(0));
        assert!(has_persisted_pecahan(1));
    }

    #[test]
    fn cash_count_rejects_negative_or_fractional_quantities() {
        assert!(validate_qty(-1.0).is_err());
        assert!(validate_qty(1.5).is_err());
        assert!(validate_qty(f64::NAN).is_err());
        assert!(validate_qty(f64::INFINITY).is_err());
        assert!(validate_qty(9_223_372_036_854_775_808.0).is_err());
        assert_eq!(validate_qty(10.0), Ok(10));
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CashCountRow {
    pub denom: i64,
    pub is_koin: bool,
    pub qty_awal: i64,
    pub qty_akhir: i64,
}

#[derive(Debug, Serialize)]
pub struct CashCountSheet {
    pub shift_id: i64,
    pub rows: Vec<CashCountRow>,
    pub total_awal: i64,
    pub total_akhir: i64,
    pub has_pecahan: bool,
    pub total_penjualan: i64,
    pub total_pengeluaran: i64,
}

#[derive(Debug, Serialize)]
pub struct Shift {
    pub id: i64,
    pub nama: String,
    pub status: String,
    pub saldo_awal: i64,
    pub saldo_akhir: Option<i64>,
    pub total_penjualan: i64,
    pub total_pengeluaran: i64,
    pub selisih: i64,
    pub catatan: Option<String>,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub created_at: String,
    pub kasir_nama: Option<String>,
    pub cashbox_id: Option<i64>,
    pub total_awal: i64,
    pub total_akhir: Option<i64>,
}

#[derive(Deserialize)]
pub struct BukaShiftInput {
    pub nama: String,
    pub saldo_awal: i64,
    #[serde(default)]
    pub cashbox_id: Option<i64>,
    #[serde(default)]
    pub rows: Vec<CashCountRow>,
}

fn shift_from_row(row: &Row<'_>) -> rusqlite::Result<Shift> {
    Ok(Shift {
        id: row.get(0)?,
        nama: row.get(1)?,
        status: row.get(2)?,
        saldo_awal: row.get(3)?,
        saldo_akhir: row.get(4)?,
        total_penjualan: row.get(5)?,
        total_pengeluaran: row.get(6)?,
        selisih: row.get(7)?,
        catatan: row.get(8)?,
        opened_at: row.get(9)?,
        closed_at: row.get(10)?,
        created_at: row.get(11)?,
        kasir_nama: row.get(12)?,
        cashbox_id: row.get(13)?,
        total_awal: row.get(14)?,
        total_akhir: row.get(15)?,
    })
}

fn shift_sql() -> &'static str {
    "SELECT s.id,s.nama,s.status,s.saldo_awal,s.saldo_akhir,s.total_penjualan,s.total_pengeluaran,s.selisih,s.catatan,s.opened_at,s.closed_at,s.created_at,u.nama_lengkap,s.cashbox_id,COALESCE((SELECT SUM(denom*qty_awal) FROM cashbox_pecahan WHERE shift_id=s.id),s.saldo_awal),CASE WHEN s.status='closed' THEN COALESCE((SELECT SUM(denom*qty_akhir) FROM cashbox_pecahan WHERE shift_id=s.id),s.saldo_akhir) END FROM shift s LEFT JOIN users u ON u.id=s.user_id"
}

#[tauri::command]
pub fn list_shift(
    state: State<DbState>,
    auth: State<AuthState>,
    status_filter: Option<String>,
) -> Result<Vec<Shift>, String> {
    require_shift_access(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let suffix = match status_filter.as_deref() {
        Some("open") => " WHERE s.status='open'",
        Some("closed") => " WHERE s.status='closed'",
        _ => "",
    };
    let mut stmt = conn
        .prepare(&format!(
            "{}{} ORDER BY s.opened_at DESC",
            shift_sql(),
            suffix
        ))
        .map_err(|e| e.to_string())?;
    let result = stmt
        .query_map([], shift_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    result
}

fn require_authenticated_user(auth: &AuthState) -> Result<i64, String> {
    auth.0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .filter(|user| user.is_active)
        .map(|user| user.id)
        .ok_or_else(|| "Login diperlukan".to_string())
}

fn require_shift_access(auth: &AuthState) -> Result<i64, String> {
    let user = auth.0.lock().map_err(|e| e.to_string())?;
    let user = user
        .as_ref()
        .filter(|user| user.is_active)
        .ok_or_else(|| "Login diperlukan".to_string())?;
    match user.role.as_str() {
        "kasir" | "supervisor" | "admin" => Ok(user.id),
        _ => Err("Role tidak berwenang mengakses data shift".to_string()),
    }
}

fn authorize_shift_close(
    auth: &AuthState,
    user_id: i64,
    owner_id: Option<i64>,
) -> Result<(), String> {
    let user = auth.0.lock().map_err(|e| e.to_string())?;
    let user = user
        .as_ref()
        .filter(|user| user.is_active)
        .ok_or_else(|| "Login diperlukan".to_string())?;
    if matches!(user.role.as_str(), "supervisor" | "admin")
        || (user.id == user_id && owner_id == Some(user.id))
    {
        Ok(())
    } else {
        Err("Kasir hanya dapat menutup shift miliknya".to_string())
    }
}

#[tauri::command]
pub fn buka_shift(
    state: State<DbState>,
    auth: State<AuthState>,
    input: BukaShiftInput,
) -> Result<Shift, String> {
    let user_id = require_authenticated_user(&auth)?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    validate_cashbox(&conn, input.cashbox_id)?;
    let id = buka_shift_persist(
        &mut *conn,
        &input.nama,
        input.saldo_awal,
        Some(user_id),
        input.cashbox_id,
        &input.rows,
    )?;
    conn.query_row(
        &format!("{} WHERE s.id=?1", shift_sql()),
        [id],
        shift_from_row,
    )
    .map_err(|e| e.to_string())
}

fn buka_shift_persist(
    conn: &mut Connection,
    nama: &str,
    saldo_awal: i64,
    user_id: Option<i64>,
    cashbox_id: Option<i64>,
    rows: &[CashCountRow],
) -> Result<i64, String> {
    validate_rows(rows)?;
    let total = if rows.is_empty() {
        saldo_awal
    } else {
        checked_total(rows, true)?
    };
    if total != saldo_awal {
        return Err("Opening total does not match saldo_awal".to_string());
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE shift SET status='closed', closed_at=datetime('now') WHERE status='open'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO shift (nama,saldo_awal,user_id,cashbox_id) VALUES (?1,?2,?3,?4)",
        params![nama, saldo_awal, user_id, cashbox_id],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    for row in rows {
        tx.execute("INSERT INTO cashbox_pecahan (shift_id,denom,is_koin,qty_awal,qty_akhir) VALUES (?1,?2,?3,?4,0)", params![id, row.denom, row.is_koin as i64, row.qty_awal]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn tutup_shift(
    state: State<DbState>,
    auth: State<AuthState>,
    id: i64,
    saldo_akhir: Option<i64>,
    rows: Option<Vec<CashCountRow>>,
    catatan: Option<String>,
) -> Result<Shift, String> {
    let user_id = require_shift_access(&auth)?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let (opened_at, saldo_awal, owner_id): (String, i64, Option<i64>) = tx
        .query_row(
            "SELECT opened_at,saldo_awal,user_id FROM shift WHERE id=?1 AND status='open'",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "Shift tidak ditemukan atau sudah ditutup".to_string())?;
    authorize_shift_close(&auth, user_id, owner_id)?;
    let opening: Vec<(i64, bool)> = {
        let mut stmt = tx.prepare("SELECT denom,is_koin FROM cashbox_pecahan WHERE shift_id=?1 ORDER BY is_koin,denom DESC").map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([id], |r| Ok((r.get(0)?, r.get::<_, i64>(1)? != 0)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string());
        result?
    };
    let has_persisted_counts = !opening.is_empty();
    let close_rows = if let Some(rows) = rows {
        validate_rows(&rows)?;
        rows
    } else if has_persisted_counts {
        return Err(
            "Shift dengan snapshot denominasi wajib ditutup melalui hitungan kas".to_string(),
        );
    } else {
        let total = saldo_akhir.ok_or_else(|| "Saldo akhir harus diisi".to_string())?;
        if total < 0 {
            return Err("Saldo akhir tidak boleh negatif".to_string());
        }
        drop(tx);
        return close_legacy(&mut *conn, id, total, catatan);
    };
    validate_closing_rows(&tx, id, &close_rows)?;
    if close_rows.len() != opening.len()
        || close_rows
            .iter()
            .map(|r| (r.denom, r.is_koin))
            .collect::<std::collections::HashSet<_>>()
            != opening.iter().copied().collect()
    {
        return Err("Closing denominations must exactly match opening denominations".to_string());
    }
    let total_akhir = checked_total(&close_rows, false)?;
    let closed_at: String = tx
        .query_row("SELECT datetime('now')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let total_penjualan: i64 = tx.query_row("SELECT COALESCE(SUM(total),0) FROM transaksi WHERE tipe='penjualan' AND metode_bayar='tunai' AND tanggal >= ?1 AND tanggal <= ?2", params![opened_at, closed_at], |r| r.get(0)).map_err(|e| e.to_string())?;
    let total_pengeluaran: i64 = tx.query_row("SELECT COALESCE(SUM(jumlah),0) FROM kas WHERE tipe='pengeluaran' AND tanggal >= ?1 AND tanggal <= ?2", params![opened_at, closed_at], |r| r.get(0)).map_err(|e| e.to_string())?;
    let expected = saldo_awal
        .checked_add(total_penjualan)
        .and_then(|v| v.checked_sub(total_pengeluaran))
        .ok_or_else(|| "Shift summary overflow".to_string())?;
    let selisih = total_akhir
        .checked_sub(expected)
        .ok_or_else(|| "Shift variance overflow".to_string())?;
    tx.execute("UPDATE shift SET status='closed',saldo_akhir=?1,total_penjualan=?2,total_pengeluaran=?3,selisih=?4,catatan=?5,closed_at=?6 WHERE id=?7", params![total_akhir,total_penjualan,total_pengeluaran,selisih,catatan,closed_at,id]).map_err(|e| e.to_string())?;
    for row in close_rows {
        let changed = tx.execute("UPDATE cashbox_pecahan SET qty_akhir=?1 WHERE shift_id=?2 AND denom=?3 AND is_koin=?4", params![row.qty_akhir,id,row.denom,row.is_koin as i64]).map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("Closing denomination row not found".to_string());
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{} WHERE s.id=?1", shift_sql()),
        [id],
        shift_from_row,
    )
    .map_err(|e| e.to_string())
}

fn close_legacy(
    conn: &mut Connection,
    id: i64,
    saldo_akhir: i64,
    catatan: Option<String>,
) -> Result<Shift, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let (opened_at, saldo_awal): (String, i64) = tx
        .query_row(
            "SELECT opened_at,saldo_awal FROM shift WHERE id=?1 AND status='open'",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Shift tidak ditemukan atau sudah ditutup".to_string())?;
    let closed_at: String = tx
        .query_row("SELECT datetime('now')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let total_penjualan: i64 = tx.query_row("SELECT COALESCE(SUM(total),0) FROM transaksi WHERE tipe='penjualan' AND metode_bayar='tunai' AND tanggal >= ?1 AND tanggal <= ?2", params![opened_at, closed_at], |r| r.get(0)).map_err(|e| e.to_string())?;
    let total_pengeluaran: i64 = tx.query_row("SELECT COALESCE(SUM(jumlah),0) FROM kas WHERE tipe='pengeluaran' AND tanggal >= ?1 AND tanggal <= ?2", params![opened_at, closed_at], |r| r.get(0)).map_err(|e| e.to_string())?;
    let expected = saldo_awal
        .checked_add(total_penjualan)
        .and_then(|v| v.checked_sub(total_pengeluaran))
        .ok_or_else(|| "Shift summary overflow".to_string())?;
    let selisih = saldo_akhir
        .checked_sub(expected)
        .ok_or_else(|| "Shift variance overflow".to_string())?;
    tx.execute("UPDATE shift SET status='closed',saldo_akhir=?1,total_penjualan=?2,total_pengeluaran=?3,selisih=?4,catatan=?5,closed_at=?6 WHERE id=?7", params![saldo_akhir,total_penjualan,total_pengeluaran,selisih,catatan,closed_at,id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{} WHERE s.id=?1", shift_sql()),
        [id],
        shift_from_row,
    )
    .map_err(|e| e.to_string())
}

fn validate_cashbox(conn: &Connection, cashbox_id: Option<i64>) -> Result<(), String> {
    let id = cashbox_id.ok_or_else(|| "Cashbox wajib dipilih".to_string())?;
    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM cashbox WHERE id=?1", [id], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;
    if exists != 1 {
        return Err("Cashbox tidak ditemukan".to_string());
    }
    Ok(())
}

fn validate_closing_rows(
    conn: &Connection,
    shift_id: i64,
    rows: &[CashCountRow],
) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT denom,is_koin,qty_awal FROM cashbox_pecahan WHERE shift_id=?1")
        .map_err(|e| e.to_string())?;
    let persisted = stmt
        .query_map([shift_id], |row| {
            Ok((
                (row.get::<_, i64>(0)?, row.get::<_, i64>(1)? != 0),
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<std::collections::HashMap<_, _>, _>>()
        .map_err(|e| e.to_string())?;
    let submitted = rows
        .iter()
        .map(|row| ((row.denom, row.is_koin), row.qty_awal))
        .collect::<std::collections::HashMap<_, _>>();
    if persisted != submitted {
        return Err(
            "Opening denomination quantities do not match persisted shift data".to_string(),
        );
    }
    Ok(())
}

fn checked_total(rows: &[CashCountRow], opening: bool) -> Result<i64, String> {
    rows.iter().try_fold(0_i64, |sum, row| {
        let qty = if opening { row.qty_awal } else { row.qty_akhir };
        row.denom
            .checked_mul(qty)
            .and_then(|value| sum.checked_add(value))
            .ok_or_else(|| "Cash count total overflow".to_string())
    })
}

#[tauri::command]
pub fn get_shift_cash_count(
    state: State<DbState>,
    auth: State<AuthState>,
    shift_id: i64,
) -> Result<CashCountSheet, String> {
    require_shift_access(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT denom,is_koin,qty_awal,qty_akhir FROM cashbox_pecahan WHERE shift_id=?1 ORDER BY is_koin,denom DESC").map_err(|e| e.to_string())?;
    let stored = stmt
        .query_map([shift_id], |r| {
            Ok(CashCountRow {
                denom: r.get(0)?,
                is_koin: r.get::<_, i64>(1)? != 0,
                qty_awal: r.get(2)?,
                qty_akhir: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let (fallback_awal, fallback_akhir): (i64, Option<i64>) = conn
        .query_row(
            "SELECT saldo_awal,saldo_akhir FROM shift WHERE id=?1",
            [shift_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let has_pecahan = has_persisted_pecahan(stored.len());
    let rows = if has_pecahan {
        stored.clone()
    } else {
        ALLOWED_DENOMS
            .iter()
            .map(|&(denom, is_koin)| CashCountRow {
                denom,
                is_koin,
                qty_awal: 0,
                qty_akhir: 0,
            })
            .collect()
    };
    let total_awal = if has_pecahan {
        checked_total(&rows, true)?
    } else {
        fallback_awal
    };
    let total_akhir = if has_pecahan {
        checked_total(&rows, false)?
    } else {
        fallback_akhir.unwrap_or(0)
    };
    let (opened_at, closed_at): (String, Option<String>) = conn
        .query_row(
            "SELECT opened_at,closed_at FROM shift WHERE id=?1",
            [shift_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let total_penjualan: i64 = conn.query_row("SELECT COALESCE(SUM(total),0) FROM transaksi WHERE tipe='penjualan' AND metode_bayar='tunai' AND tanggal >= ?1 AND tanggal <= COALESCE(?2, datetime('now'))", params![opened_at, closed_at], |r| r.get(0)).map_err(|e| e.to_string())?;
    let total_pengeluaran: i64 = conn.query_row("SELECT COALESCE(SUM(jumlah),0) FROM kas WHERE tipe='pengeluaran' AND tanggal >= ?1 AND tanggal <= COALESCE(?2, datetime('now'))", params![opened_at, closed_at], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(CashCountSheet {
        shift_id,
        rows,
        total_awal,
        total_akhir,
        has_pecahan,
        total_penjualan,
        total_pengeluaran,
    })
}

fn has_persisted_pecahan(row_count: usize) -> bool {
    row_count > 0
}

fn persisted_keys(rows: &[CashCountRow]) -> Vec<(i64, bool)> {
    rows.iter().map(|row| (row.denom, row.is_koin)).collect()
}

fn validate_rows(rows: &[CashCountRow]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for row in rows {
        if !ALLOWED_DENOMS.contains(&(row.denom, row.is_koin))
            || !seen.insert((row.denom, row.is_koin))
            || row.qty_awal < 0
            || row.qty_akhir < 0
        {
            return Err("Invalid cash denomination or quantity".to_string());
        }
    }
    Ok(())
}
fn total_awal(rows: &[(i64, i64, i64)]) -> Result<i64, String> {
    rows.iter().try_fold(0_i64, |sum, (d, q, _)| {
        d.checked_mul(*q)
            .and_then(|v| sum.checked_add(v))
            .ok_or_else(|| "Cash count total overflow".to_string())
    })
}
fn total_akhir(rows: &[(i64, i64, i64)]) -> Result<i64, String> {
    rows.iter().try_fold(0_i64, |sum, (d, _, q)| {
        d.checked_mul(*q)
            .and_then(|v| sum.checked_add(v))
            .ok_or_else(|| "Cash count total overflow".to_string())
    })
}
fn pendapatan_aktual(total_akhir: i64, total_awal: i64) -> Result<i64, String> {
    total_akhir
        .checked_sub(total_awal)
        .ok_or_else(|| "Cash income overflow".to_string())
}
fn variance(actual: i64, pos: i64) -> Result<i64, String> {
    actual
        .checked_sub(pos)
        .ok_or_else(|| "Cash variance overflow".to_string())
}
fn validate_qty(value: f64) -> Result<i64, String> {
    if !value.is_finite() || value < 0.0 || value >= 9_223_372_036_854_775_808.0 {
        return Err("Quantity must be a finite non-negative i64".to_string());
    }
    if value.fract() != 0.0 {
        return Err("Quantity must be a whole number".to_string());
    }
    Ok(value as i64)
}
