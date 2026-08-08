//! Commands Produk — CRUD produk + stok.
//! Gap KasGo Phase 1 menambah stock adjustment dengan audit trail.
use crate::commands::user_cmd::AuthState;
use crate::db::DbState;
use crate::models::produk::{Produk, ProdukInput, ProdukKasir};
use calamine::{open_workbook_from_rs, Data, Reader, Xlsx};
use chrono::{Duration, NaiveDateTime, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

const PRODUK_SELECT: &str =
    "SELECT p.id, p.kategori_id, k.nama, p.supplier_id, s.nama, p.nama, p.sku, p.kata_kunci, p.satuan,
                p.harga_beli, p.harga_jual, p.stok, p.stok_minimum,
                p.foto_path, COALESCE(p.harga_diskon,0), p.diskon_berlaku_sampai,
                p.is_active, p.satuan_multi, p.created_at, p.updated_at,
                p.merek, p.tipe_item, p.rak, p.kode_item
         FROM produk p
         LEFT JOIN kategori k ON k.id = p.kategori_id
         LEFT JOIN supplier s ON s.id = p.supplier_id";

fn map_produk(row: &rusqlite::Row<'_>) -> rusqlite::Result<Produk> {
    Ok(Produk {
        id: row.get(0)?,
        kategori_id: row.get(1)?,
        kategori_nama: row.get(2)?,
        supplier_id: row.get(3)?,
        supplier_nama: row.get(4)?,
        nama: row.get(5)?,
        sku: row.get(6)?,
        skus: Vec::new(),
        kata_kunci: row.get(7)?,
        satuan: row.get(8)?,
        harga_beli: row.get(9)?,
        harga_jual: row.get(10)?,
        stok: row.get(11)?,
        stok_minimum: row.get(12)?,
        foto_path: row.get(13)?,
        harga_diskon: row.get(14)?,
        diskon_berlaku_sampai: row.get(15)?,
        is_active: row.get::<_, i64>(16)? != 0,
        satuan_multi: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
        merek: row.get(20)?,
        tipe_item: row.get(21)?,
        rak: row.get(22)?,
        kode_item: row.get(23)?,
    })
}

/// Pastikan tabel produk_sku ada (idempotent).
fn ensure_produk_sku(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS produk_sku (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produk_id INTEGER NOT NULL,
            sku TEXT NOT NULL UNIQUE,
            is_primary INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE
         );
         CREATE INDEX IF NOT EXISTS idx_produk_sku_produk ON produk_sku(produk_id);",
    );
}

/// Normalisasi daftar SKU: trim, buang kosong/duplikat, urutan tetap.
fn normalize_skus(primary: Option<&str>, extra: Option<&[String]>) -> Vec<String> {
    let mut out = Vec::new();
    let push = |out: &mut Vec<String>, s: &str| {
        let t = s.trim();
        if t.is_empty() {
            return;
        }
        if !out.iter().any(|x: &String| x.eq_ignore_ascii_case(t)) {
            out.push(t.to_string());
        }
    };
    if let Some(list) = extra {
        for s in list {
            push(&mut out, s);
        }
    }
    if out.is_empty() {
        if let Some(p) = primary {
            push(&mut out, p);
        }
    }
    out
}

/// Simpan multi-SKU: SKU pertama = primary di produk.sku + produk_sku.
fn save_produk_skus(conn: &rusqlite::Connection, produk_id: i64, skus: &[String]) -> Result<(), String> {
    ensure_produk_sku(conn);
    conn.execute("DELETE FROM produk_sku WHERE produk_id = ?1", params![produk_id])
        .map_err(|e| e.to_string())?;
    for (i, sku) in skus.iter().enumerate() {
        // Hapus kepemilikan SKU di produk lain agar unique tidak bentrok saat reassign.
        let _ = conn.execute("DELETE FROM produk_sku WHERE sku = ?1 AND produk_id != ?2", params![sku, produk_id]);
        conn.execute(
            "INSERT INTO produk_sku (produk_id, sku, is_primary) VALUES (?1, ?2, ?3)",
            params![produk_id, sku, if i == 0 { 1 } else { 0 }],
        )
        .map_err(|e| format!("SKU '{sku}' bentrok / gagal simpan: {e}"))?;
    }
    let primary = skus.first().map(|s| s.as_str());
    conn.execute(
        "UPDATE produk SET sku = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![primary, produk_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Ambil semua SKU produk (primary dulu).
fn load_produk_skus(conn: &rusqlite::Connection, produk_id: i64) -> Vec<String> {
    ensure_produk_sku(conn);
    let mut stmt = match conn.prepare(
        "SELECT sku FROM produk_sku WHERE produk_id = ?1 ORDER BY is_primary DESC, id ASC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map(params![produk_id], |row| row.get::<_, String>(0))
        .ok()
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

/// Isi field skus untuk list produk.
fn attach_skus(conn: &rusqlite::Connection, items: &mut [Produk]) {
    ensure_produk_sku(conn);
    for p in items.iter_mut() {
        let mut skus = load_produk_skus(conn, p.id);
        if skus.is_empty() {
            if let Some(ref s) = p.sku {
                if !s.trim().is_empty() {
                    skus.push(s.clone());
                }
            }
        }
        if p.sku.is_none() {
            p.sku = skus.first().cloned();
        }
        p.skus = skus;
    }
}

#[tauri::command]
pub fn list_produk(
    state: State<DbState>,
    search: Option<String>,
    kategori_id: Option<i64>,
    only_active: Option<bool>,
    limit: Option<i64>,
    offset: Option<i64>,
    cursor_id: Option<i64>,
    cursor_val: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<Produk>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::ensure_column(&conn, "produk", "kata_kunci", "TEXT");
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    let mut sql = String::from(PRODUK_SELECT);
    sql.push_str(" WHERE 1=1");
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 0;

    if only_active.unwrap_or(true) {
        param_idx += 1;
        sql.push_str(&format!(" AND p.is_active = ?{}", param_idx));
        param_values.push(Box::new(1i64));
    }
    if let Some(ref s) = search {
        ensure_produk_sku(&conn);
        param_idx += 1;
        let p_contains = param_idx;
        // Substring match di mana saja: nama, sku utama, kata kunci, merek, kode_item, multi-SKU.
        sql.push_str(&format!(
            " AND (p.nama LIKE ?{0}
               OR COALESCE(p.sku, '') LIKE ?{0}
               OR COALESCE(p.kata_kunci, '') LIKE ?{0}
               OR COALESCE(p.merek, '') LIKE ?{0}
               OR COALESCE(p.kode_item, '') LIKE ?{0}
               OR EXISTS (SELECT 1 FROM produk_sku ps WHERE ps.produk_id = p.id AND ps.sku LIKE ?{0}))",
            p_contains
        ));
        param_values.push(Box::new(format!("%{}%", s.trim())));
        // Ranking binds — exact match (rank 0) dan prefix match (rank 1) untuk ORDER BY.
        // Sama dengan pola di list_produk_kasir agar urutan konsisten.
        param_idx += 1;
        param_values.push(Box::new(s.trim().to_string())); // exact param
        param_idx += 1;
        param_values.push(Box::new(format!("{}%", s.trim()))); // prefix param
    }

    if let Some(kid) = kategori_id {
        param_idx += 1;
        sql.push_str(&format!(" AND p.kategori_id = ?{}", param_idx));
        param_values.push(Box::new(kid));
    }

    // Sort column whitelist — mencegah SQL injection
    let sort_column = match sort_by.as_deref() {
        Some("nama") => "p.nama",
        Some("harga_jual") => "p.harga_jual",
        Some("stok") => "p.stok",
        _ => "p.nama",
    };
    let direction = match sort_order.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };

    // Composite cursor menjaga urutan stabil untuk nama, harga, dan stok.
    if let (Some(cid), Some(cval)) = (cursor_id, cursor_val) {
        let op = if direction == "DESC" { "<" } else { ">" };
        let id_op = op;
        param_idx += 1;
        sql.push_str(&format!(
            " AND ({0} {1} ?{2} OR ({0} = ?{2} AND p.id {3} ?{4}))",
            sort_column, op, param_idx, id_op, param_idx + 1
        ));
        param_values.push(Box::new(cval));
        param_idx += 1;
        param_values.push(Box::new(cid));
    }

    let id_dir = if direction == "DESC" { "DESC" } else { "ASC" };

    // Rank search: exact (0) > prefix/awalan (1) > contains (2), lalu sort kolom.
    // Identik dengan pola list_produk_kasir agar urutan konsisten di semua halaman.
    // param exact = param_idx-1, param prefix = param_idx (di-push saat search block atas).
    if search.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
        let p_exact = param_idx - 1;
        let p_prefix = param_idx;
        sql.push_str(&format!(
            " ORDER BY (CASE
                WHEN lower(p.nama) = lower(?{0}) OR lower(COALESCE(p.sku,'')) = lower(?{0})
                     OR EXISTS (SELECT 1 FROM produk_sku ps WHERE ps.produk_id = p.id AND lower(ps.sku) = lower(?{0})) THEN 0
                WHEN p.nama LIKE ?{1} OR COALESCE(p.sku,'') LIKE ?{1}
                     OR EXISTS (SELECT 1 FROM produk_sku ps WHERE ps.produk_id = p.id AND ps.sku LIKE ?{1}) THEN 1
                ELSE 2
              END) ASC, {2} {3}, p.id {4}",
            p_exact, p_prefix, sort_column, direction, id_dir
        ));
    } else {
        sql.push_str(&format!(" ORDER BY {} {}, p.id {}", sort_column, direction, id_dir));
    }

    if let Some(l) = limit {
        param_idx += 1;
        sql.push_str(&format!(" LIMIT ?{}", param_idx));
        param_values.push(Box::new(l));
    }
    if cursor_id.is_none() {
        if let Some(o) = offset {
            param_idx += 1;
            sql.push_str(&format!(" OFFSET ?{}", param_idx));
            param_values.push(Box::new(o));
        }
    }

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), map_produk)
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    attach_skus(&conn, &mut result);
    Ok(result)
}

/// list_produk_kasir — subset ringan untuk grid kasir, tanpa JOIN, dengan pagination
/// Cursor pagination: `cursor_id` + `cursor_val` lebih cepat dari OFFSET untuk dataset besar.
/// - Default sort (nama ASC): `WHERE p.id > ?cursor_id`
/// - Sort lain ASC: `WHERE (sort_col > ?cursor_val OR (sort_col = ?cursor_val AND p.id > ?cursor_id))`
/// - Sort lain DESC: `WHERE (sort_col < ?cursor_val OR (sort_col = ?cursor_val AND p.id < ?cursor_id))`
#[tauri::command]
pub fn list_produk_kasir(
    state: State<DbState>,
    search: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    cursor_id: Option<i64>,
    cursor_val: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<ProdukKasir>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let limit = Some(limit.unwrap_or(50).clamp(1, 50));
    crate::db::ensure_column(&conn, "produk", "kata_kunci", "TEXT");
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    let mut sql = String::from(
        "SELECT p.id, p.nama, p.sku, p.kata_kunci, p.satuan,
                p.harga_jual, p.stok, p.stok_minimum,
                COALESCE(p.harga_diskon,0), p.diskon_berlaku_sampai,
                p.satuan_multi
         FROM produk p WHERE p.is_active = 1"
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 0;

    if let Some(ref s) = search {
        ensure_produk_sku(&conn);
        let term = s.trim().to_string();
        param_idx += 1;
        let p_contains = param_idx;
        sql.push_str(&format!(
            " AND (p.nama LIKE ?{0}
               OR COALESCE(p.sku, '') LIKE ?{0}
               OR COALESCE(p.kata_kunci, '') LIKE ?{0}
               OR COALESCE(p.kode_item, '') LIKE ?{0}
               OR EXISTS (SELECT 1 FROM produk_sku ps WHERE ps.produk_id = p.id AND ps.sku LIKE ?{0}))",
            p_contains
        ));
        param_values.push(Box::new(format!("%{term}%")));
        // Ranking binds (exact + prefix) — dipakai di ORDER BY
        param_idx += 1;
        let _p_exact = param_idx;
        param_values.push(Box::new(term.clone()));
        param_idx += 1;
        let _p_prefix = param_idx;
        param_values.push(Box::new(format!("{term}%")));
    }

    let sort_column = match sort_by.as_deref() {
        Some("nama") => "p.nama",
        Some("harga_jual") => "p.harga_jual",
        Some("stok") => "p.stok",
        _ => "p.nama",
    };
    let direction = match sort_order.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };

    // Cursor condition: lebih efisien dari OFFSET untuk lompatan jauh
    if let (Some(cid), Some(cval)) = (cursor_id, cursor_val) {
        param_idx += 1;
        if sort_column == "p.nama" {
            let value_op = if direction == "DESC" { "<" } else { ">" };
            let id_op = if direction == "DESC" { "<" } else { ">" };
            sql.push_str(&format!(
                " AND (p.nama {0} ?{1} OR (p.nama = ?{1} AND p.id {2} ?{3}))",
                value_op, param_idx, id_op, param_idx + 1
            ));
            param_values.push(Box::new(cval));
            param_idx += 1;
            param_values.push(Box::new(cid));
        } else {
            // Sort lain: composite cursor (sort_value, id)
            param_idx += 1;
            let (op, id_op) = if direction == "DESC" { ("<", "<") } else { (">", ">") };
            sql.push_str(&format!(
                " AND ({0} {1} ?{2} OR ({0} = ?{2} AND p.id {3} ?{4}))",
                sort_column, op, param_idx, id_op, param_idx + 1
            ));
            param_values.push(Box::new(cval));
            param_idx += 1;
            param_values.push(Box::new(cid));
        }
    }

    // Rank search: exact (0) > prefix (1) > contains (2), lalu sort kolom.
    let id_dir = if direction == "DESC" { "DESC" } else { "ASC" };
    if search.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
        // param exact = contains_idx+1, prefix = contains_idx+2  (sudah di-push di atas)
        // Hitung index: last two params are exact & prefix when search set.
        let p_exact = param_idx - 1;
        let p_prefix = param_idx;
        sql.push_str(&format!(
            " ORDER BY (CASE
                WHEN lower(p.nama) = lower(?{0}) OR lower(COALESCE(p.sku,'')) = lower(?{0})
                     OR EXISTS (SELECT 1 FROM produk_sku ps WHERE ps.produk_id = p.id AND lower(ps.sku) = lower(?{0})) THEN 0
                WHEN p.nama LIKE ?{1} OR COALESCE(p.sku,'') LIKE ?{1}
                     OR EXISTS (SELECT 1 FROM produk_sku ps WHERE ps.produk_id = p.id AND ps.sku LIKE ?{1}) THEN 1
                ELSE 2
              END) ASC, {2} {3}, p.id {4}",
            p_exact, p_prefix, sort_column, direction, id_dir
        ));
    } else {
        sql.push_str(&format!(" ORDER BY {} {}, p.id {}", sort_column, direction, id_dir));
    }

    if let Some(l) = limit {
        param_idx += 1;
        sql.push_str(&format!(" LIMIT ?{}", param_idx));
        param_values.push(Box::new(l));
    }
    // OFFSET masih didukung sebagai fallback untuk kasus non-cursor
    if cursor_id.is_none() {
        if let Some(o) = offset {
            param_idx += 1;
            sql.push_str(&format!(" OFFSET ?{}", param_idx));
            param_values.push(Box::new(o));
        }
    }

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(ProdukKasir {
                id: row.get(0)?,
                nama: row.get(1)?,
                sku: row.get(2)?,
                skus: Vec::new(),
                kata_kunci: row.get(3)?,
                satuan: row.get(4)?,
                harga_jual: row.get(5)?,
                stok: row.get(6)?,
                stok_minimum: row.get(7)?,
                harga_diskon: row.get(8)?,
                diskon_berlaku_sampai: row.get(9)?,
                satuan_multi: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    // Lampirkan multi-SKU; kasir tetap tampilkan sku (primary) saja.
    ensure_produk_sku(&conn);
    for p in result.iter_mut() {
        let mut skus = load_produk_skus(&conn, p.id);
        if skus.is_empty() {
            if let Some(ref s) = p.sku {
                if !s.trim().is_empty() {
                    skus.push(s.clone());
                }
            }
        }
        if p.sku.is_none() {
            p.sku = skus.first().cloned();
        }
        p.skus = skus;
    }
    Ok(result)
}

#[tauri::command]
pub fn get_produk(state: State<DbState>, id: i64) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::ensure_column(&conn, "produk", "kata_kunci", "TEXT");
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    let produk = conn
        .query_row(
            &format!("{} WHERE p.id = ?1", PRODUK_SELECT),
            params![id],
            map_produk,
        )
        .map_err(|e| format!("Produk tidak ditemukan: {}", e))?;
    let mut list = vec![produk];
    attach_skus(&conn, &mut list);
    Ok(list.remove(0))
}

#[tauri::command]
pub fn create_produk(state: State<DbState>, input: ProdukInput) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    let skus = normalize_skus(input.sku.as_deref(), input.skus.as_deref());
    let primary_sku = skus.first().cloned();
    conn.execute(
        "INSERT INTO produk (kategori_id, supplier_id, nama, kata_kunci, sku, satuan, harga_beli, harga_jual, stok, stok_minimum, foto_path, satuan_multi, harga_diskon, diskon_berlaku_sampai, merek, tipe_item, rak, kode_item)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            input.kategori_id,
            input.supplier_id,
            input.nama,
            input.kata_kunci,
            primary_sku,
            input.satuan.unwrap_or_else(|| "pcs".to_string()),
            input.harga_beli.unwrap_or(0),
            input.harga_jual,
            input.stok.unwrap_or(0),
            input.stok_minimum.unwrap_or(0),
            input.foto_path,
            input.satuan_multi,
            input.harga_diskon.unwrap_or(0).max(0),
            input.diskon_berlaku_sampai,
            input.merek,
            input.tipe_item,
            input.rak,
            input.kode_item,
        ],
    )
    .map_err(|e| format!("Gagal simpan produk: {}", e))?;
    let id = conn.last_insert_rowid();
    if !skus.is_empty() {
        save_produk_skus(&conn, id, &skus)?;
    }
    get_produk_by_id(&conn, id)
}

/// Ambil produk by id + attach multi-SKU.
fn get_produk_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Produk, String> {
    let produk = conn
        .query_row(
            &format!("{} WHERE p.id = ?1", PRODUK_SELECT),
            params![id],
            map_produk,
        )
        .map_err(|e| format!("Gagal mengambil produk: {}", e))?;
    let mut list = vec![produk];
    attach_skus(conn, &mut list);
    Ok(list.remove(0))
}

#[tauri::command]
pub fn update_produk(state: State<DbState>, id: i64, input: ProdukInput) -> Result<Produk, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::ensure_column(&conn, "produk", "kata_kunci", "TEXT");
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    let skus = normalize_skus(input.sku.as_deref(), input.skus.as_deref());
    let primary_sku = skus.first().cloned();
    conn.execute(
        "UPDATE produk SET kategori_id=?1, supplier_id=?2, nama=?3, kata_kunci=?4, sku=?5, satuan=?6,
         harga_beli=?7, harga_jual=?8, stok_minimum=?9, foto_path=?10,
         satuan_multi=?11, harga_diskon=?12, diskon_berlaku_sampai=?13,
         merek=?14, tipe_item=?15, rak=?16, kode_item=?17, updated_at=datetime('now')
         WHERE id=?18",
        params![
            input.kategori_id,
            input.supplier_id,
            input.nama,
            input.kata_kunci,
            primary_sku,
            input.satuan.unwrap_or_else(|| "pcs".to_string()),
            input.harga_beli.unwrap_or(0),
            input.harga_jual,
            input.stok_minimum.unwrap_or(0),
            input.foto_path,
            input.satuan_multi,
            input.harga_diskon.unwrap_or(0).max(0),
            input.diskon_berlaku_sampai,
            input.merek,
            input.tipe_item,
            input.rak,
            input.kode_item,
            id,
        ],
    )
    .map_err(|e| format!("Gagal update produk: {}", e))?;
    save_produk_skus(&conn, id, &skus)?;
    get_produk_by_id(&conn, id)
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
    crate::db::ensure_column(&conn, "produk", "kata_kunci", "TEXT");
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    let mut stmt = conn
        .prepare(&format!(
            "{} WHERE p.is_active = 1 AND p.stok < p.stok_minimum ORDER BY p.stok ASC",
            PRODUK_SELECT
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_produk).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ============================================================
// Gap KasGo Phase 1: Stock Adjustment + Audit Trail
// ============================================================

/// Satu baris audit trail penyesuaian stok manual.
#[derive(Debug, Serialize)]
pub struct StockAdjustment {
    pub id: i64,
    pub produk_id: i64,
    pub produk_nama: String,
    pub selisih: i64,
    pub stok_sebelum: i64,
    pub stok_sesudah: i64,
    pub alasan: String,
    pub created_at: String,
    pub reverse_of_id: Option<i64>,
    pub is_reversed: bool,
}

/// Input penyesuaian stok: produk target, stok baru hasil opname, dan alasan wajib.
/// Backend menghitung selisih dan mencatat audit trail dalam satu transaksi.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAdjustmentInput {
    pub produk_id: i64,
    pub stok_baru: i64,
    pub alasan: String,
    pub admin_pin: Option<String>,
}

/// Validasi alasan penyesuaian stok: trim, min 5 char, bukan semua karakter sama.
fn validate_alasan_stok(raw: &str) -> Result<String, String> {
    let alasan = raw.trim().to_string();
    if alasan.is_empty() {
        return Err("Alasan penyesuaian stok wajib diisi".into());
    }
    if alasan.chars().count() < 5 {
        return Err("Alasan minimal 5 karakter".into());
    }
    // Tolak "aaaaa", "-----", "11111", dll.
    let mut chars = alasan.chars();
    if let Some(first) = chars.next() {
        if chars.all(|c| c == first) {
            return Err("Alasan tidak boleh memakai karakter yang sama".into());
        }
    }
    Ok(alasan)
}

/// Penyesuaian stok manual (opname/koreksi/rusak/hilang).
/// Mengupdate produk.stok dan mencatat baris audit trail dalam satu transaksi agar
/// selalu dapat ditelusuri kapan dan kenapa stok berubah di luar transaksi penjualan.
#[tauri::command]
pub fn adjust_stock(
    state: State<DbState>,
    auth: State<AuthState>,
    input: StockAdjustmentInput,
) -> Result<StockAdjustment, String> {
    crate::commands::user_cmd::require_stock_audit(auth.inner())?;
    let alasan = validate_alasan_stok(&input.alasan)?;
    if input.stok_baru < 0 {
        return Err("Stok baru tidak boleh negatif".into());
    }
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let has_admin_pin: bool = tx
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM kasir_pin WHERE role IN ('admin', 'supervisor') AND is_active = 1)",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        != 0;
     if has_admin_pin {
        let pin = input.admin_pin.as_deref().unwrap_or("").trim();
        let pin_valid = crate::commands::pin_cmd::verify_pin_hashes(&tx, pin, &["admin", "supervisor"])?;
        if !pin_valid {
            return Err("Penyesuaian stok memerlukan PIN Admin atau Supervisor".into());
        }
    }

    let (stok_sebelum, nama): (i64, String) = tx
        .query_row(
            "SELECT stok, nama FROM produk WHERE id = ?1",
            params![input.produk_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Produk ID {} tidak ditemukan", input.produk_id))?;

    let selisih = input.stok_baru - stok_sebelum;
    tx.execute(
        "UPDATE produk SET stok = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![input.stok_baru, input.produk_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO stock_adjustment (produk_id, selisih, stok_sebelum, stok_sesudah, alasan)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.produk_id,
            selisih,
            stok_sebelum,
            input.stok_baru,
            alasan.clone()
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;

    Ok(StockAdjustment {
        id,
        produk_id: input.produk_id,
        produk_nama: nama,
        selisih,
        stok_sebelum,
        stok_sesudah: input.stok_baru,
        alasan,
        created_at: chrono::Utc::now()
            .naive_utc()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
        reverse_of_id: None,
        is_reversed: false,
    })
}

fn reversal_delta(selisih: i64) -> i64 {
    -selisih
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseStockAdjustmentInput {
    pub adjustment_id: i64,
    pub admin_pin: Option<String>,
}

#[tauri::command]
pub fn reverse_stock_adjustment(
    state: State<DbState>,
    auth: State<AuthState>,
    input: ReverseStockAdjustmentInput,
) -> Result<StockAdjustment, String> {
    crate::commands::user_cmd::require_stock_audit(auth.inner())?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let target: (i64, i64, String, i64, i64, i64, String, Option<i64>) = tx
        .query_row(
            "SELECT sa.produk_id, p.stok, p.nama, sa.selisih, sa.stok_sesudah,
                    sa.stok_sebelum, sa.created_at, sa.reverse_of_id
             FROM stock_adjustment sa JOIN produk p ON p.id = sa.produk_id
             WHERE sa.id = ?1",
            params![input.adjustment_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )
        .map_err(|_| "Audit tidak ditemukan".to_string())?;
    if target.7.is_some() {
        return Err("Baris reversal tidak bisa dibalik".into());
    }
    let already_reversed: bool = tx
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM stock_adjustment WHERE reverse_of_id = ?1)",
            params![input.adjustment_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        != 0;
    if already_reversed {
        return Err("Audit sudah dikembalikan".into());
    }
    let admin_override = if let Some(pin) = input.admin_pin.as_deref() {
        let valid = crate::commands::pin_cmd::verify_pin_hashes(&tx, pin.trim(), &["admin"])?;
        if !valid {
            return Err("PIN Admin salah".into());
        }
        true
    } else {
        false
    };
    if !admin_override {
        let created_at = NaiveDateTime::parse_from_str(&target.6, "%Y-%m-%d %H:%M:%S")
            .map_err(|_| "Waktu audit tidak valid".to_string())?;
        if Utc::now().naive_utc() - created_at > Duration::hours(48) {
            return Err("Melebihi batas 48 jam. Minta Admin atau masukkan PIN Admin.".into());
        }
        if target.1 != target.4 {
            return Err(
                "Stok sudah berubah setelah audit. Minta Admin atau masukkan PIN Admin.".into(),
            );
        }
    }
    let delta = reversal_delta(target.3);
    let stok_sesudah = target.1 + delta;
    if stok_sesudah < 0 {
        return Err("Reversal membuat stok negatif".into());
    }
    tx.execute(
        "UPDATE produk SET stok = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![stok_sesudah, target.0],
    )
    .map_err(|e| e.to_string())?;
    let alasan = format!("Reversal audit #{}", input.adjustment_id);
    tx.execute(
        "INSERT INTO stock_adjustment
         (produk_id, selisih, stok_sebelum, stok_sesudah, alasan, reverse_of_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            target.0,
            delta,
            target.1,
            stok_sesudah,
            alasan,
            input.adjustment_id
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;
    Ok(StockAdjustment {
        id,
        produk_id: target.0,
        produk_nama: target.2,
        selisih: delta,
        stok_sebelum: target.1,
        stok_sesudah,
        alasan,
        created_at: Utc::now()
            .naive_utc()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
        reverse_of_id: Some(input.adjustment_id),
        is_reversed: false,
    })
}

/// Riwayat audit trail penyesuaian stok, diurutkan terbaru di atas.
#[tauri::command]
pub fn list_stock_adjustments(
    state: State<DbState>,
    auth: State<AuthState>,
) -> Result<Vec<StockAdjustment>, String> {
    crate::commands::user_cmd::require_stock_audit(auth.inner())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT sa.id, sa.produk_id, p.nama, sa.selisih, sa.stok_sebelum, sa.stok_sesudah,
                    sa.alasan, sa.created_at, sa.reverse_of_id,
                    EXISTS (SELECT 1 FROM stock_adjustment rev WHERE rev.reverse_of_id = sa.id)
             FROM stock_adjustment sa
             JOIN produk p ON p.id = sa.produk_id
             ORDER BY sa.created_at DESC, sa.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StockAdjustment {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                produk_nama: row.get(2)?,
                selisih: row.get(3)?,
                stok_sebelum: row.get(4)?,
                stok_sesudah: row.get(5)?,
                alasan: row.get(6)?,
                created_at: row.get(7)?,
                reverse_of_id: row.get(8)?,
                is_reversed: row.get::<_, i64>(9)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ============================================================
// Gap KasGo Phase 2: Import Produk CSV
// ============================================================

/// Ringkasan hasil import CSV produk.
/// `dibuat` berarti produk baru; `diupdate` berarti SKU yang sama ditimpa datanya.
#[derive(Debug, Serialize)]
pub struct ImportProdukResult {
    pub dibuat: i64,
    pub diupdate: i64,
    pub dilewati: i64,
    pub errors: Vec<String>,
}

/// Parse satu baris CSV kecil tanpa dependency eksternal.
/// Mendukung koma di dalam quote ganda dan escape quote standar (`""`).
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let mut cell = String::new();
    let mut chars = line.chars().peekable();
    let mut quoted = false;
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cell.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                cells.push(cell.trim().to_string());
                cell.clear();
            }
            _ => cell.push(ch),
        }
    }
    cells.push(cell.trim().to_string());
    cells
}

fn rupiah_int(value: Option<&String>) -> i64 {
    value
        .map(|v| v.chars().filter(|c| c.is_ascii_digit()).collect::<String>())
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0)
}

/// Parse nilai stok/decimal: treat . dan , sebagai pemisah desimal, lalu round ke i64.
/// "716.97" -> 717,  "1187,99" -> 1188,  "5" -> 5
fn stok_int(value: Option<&String>) -> i64 {
    value
        .and_then(|v| v.replace(',', ".").parse::<f64>().ok())
        .map(|v| v.round() as i64)
        .unwrap_or(0)
}

/// Import massal produk dari CSV lokal.
/// Format kolom: nama, sku, kategori, satuan, harga_beli, harga_jual, stok, stok_minimum[, merek, tipe_item, rak, kode_item].
/// Jika SKU sudah ada, data produk diupdate; jika SKU kosong, baris selalu menjadi produk baru.
#[tauri::command]
pub fn import_produk_csv(
    state: State<DbState>,
    csv_text: String,
) -> Result<ImportProdukResult, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    // Pastikan tabel utama ada sebelum dipakai — aman untuk DB fresh/partial.
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kategori (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL UNIQUE);
         CREATE TABLE IF NOT EXISTS produk (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kategori_id INTEGER REFERENCES kategori(id) ON DELETE SET NULL,
            nama TEXT NOT NULL,
            sku TEXT UNIQUE,
            satuan TEXT NOT NULL DEFAULT 'pcs',
            harga_beli INTEGER NOT NULL DEFAULT 0,
            harga_jual INTEGER NOT NULL,
            stok INTEGER NOT NULL DEFAULT 0,
            stok_minimum INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
         );",
    );
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut dibuat = 0;
    let mut diupdate = 0;
    let mut dilewati = 0;
    let mut errors = Vec::new();

    for (idx, raw_line) in csv_text.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim().trim_start_matches('\u{feff}');
        if line.is_empty() { continue; }
        // Skip header row
        if line_no == 1 && (line.to_lowercase().contains("nama") || line.to_lowercase().contains("namaitem")) {
            continue;
        }
        let cells = parse_csv_line(line);
        let nama = cells.get(0).map(|v| v.trim()).unwrap_or("");
        if nama.is_empty() {
            dilewati += 1;
            errors.push(format!("Baris {line_no}: nama produk kosong"));
            continue;
        }
        let harga_jual = rupiah_int(cells.get(5));
        if harga_jual <= 0 {
            dilewati += 1;
            errors.push(format!("Baris {line_no}: harga_jual wajib > 0"));
            continue;
        }
        let sku = cells.get(1).map(|v| v.trim()).filter(|v| !v.is_empty());
        // col2 = kategori (used for lookup), col3 = satuan, col4 = harga_beli, col5 = harga_jual
        let satuan = cells.get(3).map(|v| v.trim()).filter(|v| !v.is_empty()).unwrap_or("pcs");
        let harga_beli = rupiah_int(cells.get(4));
        let stok = stok_int(cells.get(6));
        let stok_minimum = stok_int(cells.get(7));
        // New fields (col8-11)
        let merek = cells.get(8).map(|v| v.trim()).filter(|v| !v.is_empty());
        let tipe_item = cells.get(9).map(|v| v.trim()).filter(|v| !v.is_empty());
        let rak = cells.get(10).map(|v| v.trim()).filter(|v| !v.is_empty());
        let kode_item = cells.get(11).map(|v| v.trim()).filter(|v| !v.is_empty());
        // Lookup or create kategori from col2
        let kategori_nama = cells.get(2).map(|v| v.trim()).filter(|v| !v.is_empty());
        let kategori_id: Option<i64> = if let Some(knama) = kategori_nama {
            let existing: Option<i64> = tx.query_row(
                "SELECT id FROM kategori WHERE lower(nama)=lower(?1)", params![knama], |r| r.get(0)
            ).ok();
            if let Some(kid) = existing {
                Some(kid)
            } else {
                tx.execute("INSERT INTO kategori (nama) VALUES (?1)", params![knama])
                    .ok();
                tx.query_row("SELECT id FROM kategori WHERE lower(nama)=lower(?1)", params![knama], |r| r.get(0)).ok()
            }
        } else { None };

        // Cek duplicate: SKU atau nama yang sama dianggap produk sama
        let existing_id = match sku {
            Some(code) => tx.query_row("SELECT id FROM produk WHERE sku = ?1", params![code], |row| row.get::<_, i64>(0)).ok(),
            None => tx.query_row("SELECT id FROM produk WHERE lower(nama)=lower(?1)", params![nama], |row| row.get::<_, i64>(0)).ok(),
        };
        if let Some(id) = existing_id {
            tx.execute(
                "UPDATE produk SET nama=?1, satuan=?2, harga_beli=?3, harga_jual=?4, stok=?5,
                 stok_minimum=?6, kategori_id=?7, merek=?8, tipe_item=?9, rak=?10, kode_item=?11,
                 is_active=1, updated_at=datetime('now') WHERE id=?12",
                params![nama, satuan, harga_beli, harga_jual, stok, stok_minimum, kategori_id, merek, tipe_item, rak, kode_item, id],
            ).map_err(|e| format!("Baris {line_no}: gagal update produk: {e}"))?;
            diupdate += 1;
        } else {
            tx.execute(
                "INSERT INTO produk (nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum, kategori_id, merek, tipe_item, rak, kode_item)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum, kategori_id, merek, tipe_item, rak, kode_item],
            ).map_err(|e| format!("Baris {line_no}: gagal buat produk: {e}"))?;
            dibuat += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(ImportProdukResult {
        dibuat,
        diupdate,
        dilewati,
        errors,
    })
}

/// Import produk dari file XLSX — parsing di Rust, tidak membebani frontend.
#[tauri::command]
pub fn import_produk_xlsx(
    state: State<DbState>,
    file_bytes: Vec<u8>,
) -> Result<ImportProdukResult, String> {
    let cursor = std::io::Cursor::new(file_bytes);
    let mut workbook: Xlsx<_> =
        open_workbook_from_rs(cursor).map_err(|e| format!("Gagal buka XLSX: {e}"))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or("Sheet tidak ditemukan")?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("Gagal baca sheet: {e}"))?;

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kategori (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL UNIQUE);
         CREATE TABLE IF NOT EXISTS produk (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kategori_id INTEGER REFERENCES kategori(id) ON DELETE SET NULL,
            nama TEXT NOT NULL,
            sku TEXT UNIQUE,
            satuan TEXT NOT NULL DEFAULT 'pcs',
            harga_beli INTEGER NOT NULL DEFAULT 0,
            harga_jual INTEGER NOT NULL,
            stok INTEGER NOT NULL DEFAULT 0,
            stok_minimum INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
         );",
    );
    crate::db::ensure_column(&conn, "produk", "merek", "TEXT");
    crate::db::ensure_column(&conn, "produk", "tipe_item", "TEXT DEFAULT 'BARANG'");
    crate::db::ensure_column(&conn, "produk", "rak", "TEXT");
    crate::db::ensure_column(&conn, "produk", "kode_item", "TEXT");
    ensure_produk_sku(&conn);

    let all_rows: Vec<&[Data]> = range.rows().collect();

    // Cari baris header (Item.xlsx / Item2 / Item 4 - Jumlah)
    let header_idx = all_rows
        .iter()
        .take(5)
        .position(|row| {
            row.iter().any(|cell| {
                let s = cell.to_string().to_uppercase();
                s == "KODEITEM" || s == "NAMAITEM" || s == "KODEBARCODE" || s == "NAMA" || s == "SKU"
            })
        })
        .ok_or("Format XLSX tidak sesuai: header KODEITEM/NAMAITEM tidak ditemukan")?;

    let headers: Vec<String> = all_rows[header_idx]
        .iter()
        .map(|c| c.to_string().trim().to_uppercase())
        .collect();

    let col_idx = |name: &str| headers.iter().position(|h| h == name);
    let col_any = |names: &[&str]| names.iter().find_map(|n| col_idx(n));

    let col_nama = col_any(&["NAMAITEM", "NAMA", "NAME"]).ok_or("Kolom NAMAITEM tidak ditemukan")?;
    let col_harga_jual = col_any(&["HARGAJUAL", "HARGAJUAL1", "HJ1", "HARGA_JUAL"])
        .ok_or("Kolom HARGAJUAL tidak ditemukan")?;
    let col_harga_beli = col_any(&["HARGAPOKOK", "HARGAPOKOK1", "HARGA_BELI", "MODAL"]).unwrap_or(col_harga_jual);
    let col_stok = col_any(&["STOK", "STOKAWAL", "QTY"]).unwrap_or(col_harga_jual);
    let col_stok_min = col_any(&["STOKMIN", "STOK_MINIMUM", "MIN"]).unwrap_or(col_stok);
    let col_kode = col_any(&["KODEITEM", "KODE", "KODE_ITEM"]);
    let col_satuan = col_any(&["SATUAN", "SATUAN1", "UNIT"]).unwrap_or(0);
    let col_kategori = col_any(&["JENIS", "KATEGORI", "CATEGORY"]);
    let col_merek = col_any(&["MEREK", "BRAND"]);
    let col_tipe = col_idx("TIPE").filter(|&i| i != 0); // skip meta col TIPE di col0
    let col_rak = col_idx("RAK");
    // Multi barcode BARCODE1..4 + KODEBARCODE
    let barcode_cols: Vec<usize> = ["KODEBARCODE", "BARCODE1", "BARCODE2", "BARCODE3", "BARCODE4", "SKU", "BARCODE"]
        .iter()
        .filter_map(|n| col_idx(n))
        .collect::<Vec<_>>()
        .into_iter()
        .fold(Vec::new(), |mut acc, i| {
            if !acc.contains(&i) { acc.push(i); }
            acc
        });

    let cell_str = |col: Option<usize>, row: &[Data]| -> String {
        col.and_then(|i| row.get(i))
            .map(|c| match c {
                Data::Float(f) => {
                    // barcode numerik: hindari scientific notation
                    if f.fract() == 0.0 && f.abs() >= 1e11 {
                        format!("{:.0}", f)
                    } else if f.fract() == 0.0 {
                        format!("{:.0}", f)
                    } else {
                        f.to_string()
                    }
                }
                Data::Int(i) => i.to_string(),
                other => other.to_string(),
            })
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    let cell_num = |col: Option<usize>, row: &[Data]| -> i64 {
        let s = cell_str(col, row).replace(',', ".");
        s.parse::<f64>().map(|v| v.round() as i64).unwrap_or(0).max(0)
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut dibuat = 0;
    let mut diupdate = 0;
    let mut dilewati = 0;
    let mut errors = Vec::new();

    for (offset, row) in all_rows.iter().enumerate().skip(header_idx + 1) {
        let line_no = offset + 1;
        let nama = cell_str(Some(col_nama), row);
        if nama.is_empty() || nama.eq_ignore_ascii_case("NAMAITEM") {
            dilewati += 1;
            continue;
        }

        // Kumpulkan multi-SKU/barcode
        let mut skus: Vec<String> = Vec::new();
        for &ci in &barcode_cols {
            let s = cell_str(Some(ci), row);
            if s.is_empty() || s == "0" { continue; }
            if !skus.iter().any(|x| x.eq_ignore_ascii_case(&s)) {
                skus.push(s);
            }
        }
        // Fallback: pakai KODEITEM sebagai SKU jika barcode kosong
        if skus.is_empty() {
            if let Some(k) = col_kode {
                let s = cell_str(Some(k), row);
                if !s.is_empty() { skus.push(s); }
            }
        }
        let primary = skus.first().cloned();
        let kode_item = col_kode.map(|i| cell_str(Some(i), row)).filter(|s| !s.is_empty());
        let satuan_raw = cell_str(Some(col_satuan), row);
        let satuan = if satuan_raw.is_empty() { "pcs".to_string() } else { satuan_raw };
        let harga_beli = cell_num(Some(col_harga_beli), row);
        let harga_jual = cell_num(Some(col_harga_jual), row).max(0);
        let stok = cell_num(Some(col_stok), row);
        let stok_min = cell_num(Some(col_stok_min), row);
        let merek = col_merek.map(|i| cell_str(Some(i), row)).filter(|s| !s.is_empty());
        let tipe = col_tipe.map(|i| cell_str(Some(i), row)).filter(|s| !s.is_empty());
        let rak = col_rak.map(|i| cell_str(Some(i), row)).filter(|s| !s.is_empty());

        let kategori_id = if let Some(ci) = col_kategori {
            let kn = cell_str(Some(ci), row);
            if kn.is_empty() {
                None
            } else {
                match tx.query_row("SELECT id FROM kategori WHERE nama = ?1", params![kn], |r| r.get::<_, i64>(0)) {
                    Ok(id) => Some(id),
                    Err(_) => {
                        let _ = tx.execute("INSERT INTO kategori (nama) VALUES (?1)", params![kn]);
                        Some(tx.last_insert_rowid())
                    }
                }
            }
        } else {
            None
        };

        // Cari existing: by any barcode, lalu by kode_item
        let mut existing_id: Option<i64> = None;
        for s in &skus {
            if let Ok(id) = tx.query_row("SELECT id FROM produk WHERE sku = ?1", params![s], |r| r.get::<_, i64>(0)) {
                existing_id = Some(id);
                break;
            }
            if let Ok(id) = tx.query_row("SELECT produk_id FROM produk_sku WHERE sku = ?1", params![s], |r| r.get::<_, i64>(0)) {
                existing_id = Some(id);
                break;
            }
        }
        if existing_id.is_none() {
            if let Some(ref kode) = kode_item {
                if let Ok(id) = tx.query_row(
                    "SELECT id FROM produk WHERE kode_item = ?1 OR sku = ?1",
                    params![kode],
                    |r| r.get::<_, i64>(0),
                ) {
                    existing_id = Some(id);
                }
            }
        }

        if let Some(id) = existing_id {
            match tx.execute(
                "UPDATE produk SET nama=?1, sku=?2, satuan=?3, harga_beli=?4, harga_jual=?5, stok=?6, stok_minimum=?7,
                 kategori_id=?8, merek=?9, tipe_item=?10, rak=?11, kode_item=?12,
                 is_active=1, updated_at=datetime('now') WHERE id=?13",
                params![nama, primary, satuan, harga_beli, harga_jual, stok, stok_min, kategori_id, merek, tipe, rak, kode_item, id],
            ) {
                Ok(_) => {
                    // multi-SKU
                    let _ = tx.execute("DELETE FROM produk_sku WHERE produk_id = ?1", params![id]);
                    for (i, s) in skus.iter().enumerate() {
                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO produk_sku (produk_id, sku, is_primary) VALUES (?1, ?2, ?3)",
                            params![id, s, if i == 0 { 1 } else { 0 }],
                        );
                    }
                    diupdate += 1;
                }
                Err(e) => errors.push(format!("Baris {line_no}: gagal update {nama}: {e}")),
            }
        } else {
            match tx.execute(
                "INSERT INTO produk (nama, sku, satuan, harga_beli, harga_jual, stok, stok_minimum, kategori_id, merek, tipe_item, rak, kode_item)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![nama, primary, satuan, harga_beli, harga_jual, stok, stok_min, kategori_id, merek, tipe, rak, kode_item],
            ) {
                Ok(_) => {
                    let id = tx.last_insert_rowid();
                    for (i, s) in skus.iter().enumerate() {
                        if let Err(e) = tx.execute(
                            "INSERT OR REPLACE INTO produk_sku (produk_id, sku, is_primary) VALUES (?1, ?2, ?3)",
                            params![id, s, if i == 0 { 1 } else { 0 }],
                        ) {
                            errors.push(format!("Baris {line_no}: SKU '{s}' gagal: {e}"));
                        }
                    }
                    dibuat += 1;
                }
                Err(e) => errors.push(format!("Baris {line_no}: gagal buat {nama}: {e}")),
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(ImportProdukResult { dibuat, diupdate, dilewati, errors })
}

// ============================================================
// Gap KasGo Phase 2: Laporan Inventori & Nilai Stok
// ============================================================

#[derive(Debug, Serialize)]
pub struct RingkasanInventori {
    pub total_sku: i64,
    pub total_stok: i64,
    pub nilai_modal: i64,
    pub nilai_jual: i64,
    pub potensi_margin: i64,
}

#[derive(Debug, Serialize)]
pub struct LaporanInventoriRow {
    pub id: i64,
    pub nama: String,
    pub sku: Option<String>,
    pub satuan: String,
    pub stok: i64,
    pub stok_minimum: i64,
    pub harga_beli: i64,
    pub harga_jual: i64,
    pub nilai_modal: i64,
    pub nilai_jual: i64,
    pub margin: i64,
}

/// Ringkasan nilai stok dan margin potensial untuk seluruh inventori aktif.
#[tauri::command]
pub fn get_ringkasan_inventori(state: State<DbState>) -> Result<RingkasanInventori, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(stok), 0), COALESCE(SUM(harga_beli * stok), 0), COALESCE(SUM(harga_jual * stok), 0)
         FROM produk WHERE is_active = 1",
        [],
        |row| {
            let total_sku: i64 = row.get(0)?;
            let total_stok: i64 = row.get(1)?;
            let nilai_modal: i64 = row.get(2)?;
            let nilai_jual: i64 = row.get(3)?;
            Ok(RingkasanInventori { total_sku, total_stok, nilai_modal, nilai_jual, potensi_margin: nilai_jual - nilai_modal })
        },
    ).map_err(|e| e.to_string())
}

/// Daftar detail inventori beserta nilai modal, nilai jual, dan margin potensial.
#[tauri::command]
pub fn list_laporan_inventori(state: State<DbState>) -> Result<Vec<LaporanInventoriRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nama, sku, satuan, stok, stok_minimum, harga_beli, harga_jual,
                (harga_beli * stok) AS nilai_modal, (harga_jual * stok) AS nilai_jual,
                ((harga_jual - harga_beli) * stok) AS margin
         FROM produk WHERE is_active = 1
         ORDER BY lower(nama) ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LaporanInventoriRow {
                id: row.get(0)?,
                nama: row.get(1)?,
                sku: row.get(2)?,
                satuan: row.get(3)?,
                stok: row.get(4)?,
                stok_minimum: row.get(5)?,
                harga_beli: row.get(6)?,
                harga_jual: row.get(7)?,
                nilai_modal: row.get(8)?,
                nilai_jual: row.get(9)?,
                margin: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ============================================================
// Gap KasGo Phase 2: Foto Produk
// ============================================================

/// Simpan foto produk dari base64 (hasil picker frontend) ke storage app private.
/// Mengembalikan path absolut file gambar yang disimpan, untuk disimpan di produk.foto_path.
/// File disimpan di {app_data_dir}/product_photos/{produk_id}.jpg agar tidak hilang saat restart
/// dan tidak terkena scoped-storage Android.
#[tauri::command]
pub fn save_produk_foto(
    app: tauri::AppHandle,
    state: State<DbState>,
    produk_id: i64,
    foto_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(foto_base64.trim())
        .map_err(|e| format!("Base64 foto tidak valid: {e}"))?;
    if bytes.len() > 2_000_000 {
        return Err("Ukuran foto melebihi 2MB".into());
    }

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal akses app_data_dir: {e}"))?;
    let foto_dir = app_dir.join("product_photos");
    std::fs::create_dir_all(&foto_dir).map_err(|e| format!("Gagal buat dir foto: {e}"))?;
    let file_path = foto_dir.join(format!("{}.jpg", produk_id));
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Gagal simpan foto: {e}"))?;
    let path_str = file_path.to_string_lossy().to_string();

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE produk SET foto_path = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![&path_str, produk_id],
    )
    .map_err(|e| format!("Gagal update foto_path: {e}"))?;

    Ok(path_str)
}

/// Hapus foto produk: hapus file fisik dan set foto_path = NULL di DB.
#[tauri::command]
pub fn delete_produk_foto(state: State<DbState>, produk_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let old: Option<String> = conn
        .query_row(
            "SELECT foto_path FROM produk WHERE id = ?1",
            params![produk_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    if let Some(ref p) = old {
        let _ = std::fs::remove_file(p);
    }
    conn.execute(
        "UPDATE produk SET foto_path = NULL, updated_at = datetime('now') WHERE id = ?1",
        params![produk_id],
    )
    .map_err(|e| format!("Gagal hapus foto: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reversal_delta_is_the_opposite_of_original_delta() {
        assert_eq!(reversal_delta(-5), 5);
        assert_eq!(reversal_delta(7), -7);
        assert_eq!(reversal_delta(0), 0);
    }
}
