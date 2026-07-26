//! Akuntansi: Chart of Accounts (COA) dan Jurnal double-entry.
//!
//! Semua transaksi keuangan dicatat via jurnal dengan prinsip debit == kredit.
//! COA bersifat hierarkis: induk_id menunjuk ke akun parent.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Satu baris akun dalam Chart of Accounts.
#[derive(Debug, Serialize)]
pub struct Coa {
    pub id: i64,
    pub kode_akun: String,
    pub nama_akun: String,
    pub tipe: String,
    pub induk_id: Option<i64>,
    pub saldo_normal: String,
    pub is_active: i64,
}

/// Input untuk membuat akun COA baru.
#[derive(Debug, Deserialize)]
pub struct CoaInput {
    pub kode_akun: String,
    pub nama_akun: String,
    pub tipe: String,
    pub induk_id: Option<i64>,
    pub saldo_normal: Option<String>,
}

/// Satu baris jurnal (debit atau kredit) dalam transaksi double-entry.
#[derive(Debug, Deserialize, Serialize)]
pub struct JurnalLine {
    pub akun_id: i64,
    pub debit: f64,
    pub kredit: f64,
    pub keterangan: Option<String>,
}

/// Baris neraca saldo: kode akun, nama, dan total debit/kredit.
#[derive(Debug, Serialize)]
pub struct NeracaSaldoRow {
    pub kode_akun: String,
    pub nama_akun: String,
    pub tipe: String,
    pub total_debit: f64,
    pub total_kredit: f64,
    pub saldo: f64,
}

/// Jurnal tidak seimbang: daftar nomor jurnal yang debit != kredit.
#[derive(Debug, Serialize)]
pub struct JurnalTidakSeimbang {
    pub nomor_jurnal: String,
    pub tanggal: String,
    pub total_debit: f64,
    pub total_kredit: f64,
    pub selisih: f64,
}

/// Ambil semua akun COA aktif, urut berdasarkan kode_akun.
///
/// Parameters: -
/// Returns: Vec<Coa>
#[tauri::command]
pub fn list_coa(state: State<DbState>) -> Result<Vec<Coa>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, kode_akun, nama_akun, tipe, induk_id, saldo_normal, is_active
             FROM coa WHERE is_active = 1 ORDER BY kode_akun",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Coa {
                id: row.get(0)?,
                kode_akun: row.get(1)?,
                nama_akun: row.get(2)?,
                tipe: row.get(3)?,
                induk_id: row.get(4)?,
                saldo_normal: row.get(5)?,
                is_active: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Buat akun COA baru.
///
/// Parameters:
/// - `input`: CoaInput — kode, nama, tipe, induk_id opsional
///
/// Returns: id akun baru
#[tauri::command]
pub fn create_coa(state: State<DbState>, input: CoaInput) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let saldo_normal = input.saldo_normal.unwrap_or_else(|| {
        // Aktiva dan biaya bersaldo debit; lainnya kredit
        if input.tipe == "aktiva" || input.tipe == "hpp" || input.tipe == "biaya" {
            "debit".to_string()
        } else {
            "kredit".to_string()
        }
    });

    conn.execute(
        "INSERT INTO coa (kode_akun, nama_akun, tipe, induk_id, saldo_normal)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.kode_akun,
            input.nama_akun,
            input.tipe,
            input.induk_id,
            saldo_normal
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

/// Buat jurnal manual dengan multiple baris (double-entry).
///
/// Parameters:
/// - `tanggal`: format YYYY-MM-DD
/// - `nomor_jurnal`: nomor unik jurnal
/// - `keterangan`: deskripsi transaksi
/// - `lines`: Vec<JurnalLine> — setiap baris debit atau kredit ke satu akun
///
/// Returns: jumlah baris jurnal yang diinsert
///
/// Side effects:
/// - Validasi: total debit HARUS == total kredit sebelum insert
/// - Insert semua baris dalam satu transaksi database
#[tauri::command]
pub fn create_jurnal_manual(
    state: State<DbState>,
    tanggal: String,
    nomor_jurnal: String,
    keterangan: Option<String>,
    lines: Vec<JurnalLine>,
    ref_tabel: Option<String>,
    ref_id: Option<i64>,
) -> Result<usize, String> {
    // Validasi keseimbangan debit == kredit (toleransi floating point 0.01)
    let total_debit: f64 = lines.iter().map(|l| l.debit).sum();
    let total_kredit: f64 = lines.iter().map(|l| l.kredit).sum();
    if (total_debit - total_kredit).abs() > 0.01 {
        return Err(format!(
            "Jurnal tidak seimbang: debit={:.2} kredit={:.2}",
            total_debit, total_kredit
        ));
    }
    if lines.is_empty() {
        return Err("Jurnal harus memiliki minimal satu baris".to_string());
    }

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for line in &lines {
        tx.execute(
            "INSERT INTO jurnal (tanggal, nomor_jurnal, keterangan, akun_id, debit, kredit, ref_tabel, ref_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                tanggal,
                nomor_jurnal,
                keterangan,
                line.akun_id,
                line.debit,
                line.kredit,
                ref_tabel,
                ref_id
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let count = lines.len();
    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

/// Hitung neraca saldo: agregasi debit dan kredit per akun dalam periode.
///
/// Parameters:
/// - `dari`: tanggal awal (YYYY-MM-DD), opsional
/// - `sampai`: tanggal akhir (YYYY-MM-DD), opsional
///
/// Returns: Vec<NeracaSaldoRow> urut kode_akun
#[tauri::command]
pub fn get_neraca_saldo(
    state: State<DbState>,
    dari: Option<String>,
    sampai: Option<String>,
) -> Result<Vec<NeracaSaldoRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Filter tanggal opsional
    let where_clause = match (&dari, &sampai) {
        (Some(_), Some(_)) => "WHERE j.tanggal >= ?1 AND j.tanggal <= ?2",
        (Some(_), None) => "WHERE j.tanggal >= ?1",
        (None, Some(_)) => "WHERE j.tanggal <= ?2",
        (None, None) => "",
    };

    let sql = format!(
        "SELECT c.kode_akun, c.nama_akun, c.tipe, c.saldo_normal,
                COALESCE(SUM(j.debit), 0) AS total_debit,
                COALESCE(SUM(j.kredit), 0) AS total_kredit
         FROM coa c
         LEFT JOIN jurnal j ON j.akun_id = c.id {where_clause}
         WHERE c.is_active = 1
         GROUP BY c.id, c.kode_akun, c.nama_akun, c.tipe, c.saldo_normal
         ORDER BY c.kode_akun"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    // Binding parameter dinamis sesuai filter
    let dari_val = dari.as_deref().unwrap_or("");
    let sampai_val = sampai.as_deref().unwrap_or("");

    let rows = stmt
        .query_map(params![dari_val, sampai_val], |row| {
            let total_debit: f64 = row.get(4)?;
            let total_kredit: f64 = row.get(5)?;
            let saldo_normal: String = row.get(3)?;
            // Saldo = debit - kredit untuk akun ber-saldo debit, sebaliknya untuk kredit
            let saldo = if saldo_normal == "debit" {
                total_debit - total_kredit
            } else {
                total_kredit - total_debit
            };
            Ok(NeracaSaldoRow {
                kode_akun: row.get(0)?,
                nama_akun: row.get(1)?,
                tipe: row.get(2)?,
                total_debit,
                total_kredit,
                saldo,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Cek jurnal yang tidak seimbang (debit != kredit per nomor_jurnal).
///
/// Returns: Vec<JurnalTidakSeimbang> — idealnya kosong jika sistem sehat
#[tauri::command]
pub fn cek_jurnal_tidak_seimbang(
    state: State<DbState>,
) -> Result<Vec<JurnalTidakSeimbang>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT nomor_jurnal, tanggal,
                    SUM(debit)  AS total_debit,
                    SUM(kredit) AS total_kredit,
                    ABS(SUM(debit) - SUM(kredit)) AS selisih
             FROM jurnal
             GROUP BY nomor_jurnal, tanggal
             HAVING ABS(SUM(debit) - SUM(kredit)) > 0.01
             ORDER BY tanggal DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(JurnalTidakSeimbang {
                nomor_jurnal: row.get(0)?,
                tanggal: row.get(1)?,
                total_debit: row.get(2)?,
                total_kredit: row.get(3)?,
                selisih: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
