use crate::db::DbState;
use crate::models::transaksi::{
    ItemInput, Transaksi, TransaksiDetail, TransaksiItemDetail, TransaksiResult,
    UpdatePenjualanInput,
};
use rusqlite::params;
use serde::Serialize;
use std::collections::BTreeMap;
use tauri::State;

/// Baris laporan PDF: agregasi produk terjual per tanggal dan metode pembayaran.
#[derive(Debug, Serialize)]
pub struct LaporanProdukRow {
    pub tanggal: String,
    pub produk_nama: String,
    pub metode_bayar: String,
    pub total_qty: i64,
    pub total_harga: i64,
}

#[tauri::command]
pub fn buat_transaksi_penjualan(
    state: State<DbState>,
    items: Vec<ItemInput>,
    metode_bayar: String,
    catatan: Option<String>,
) -> Result<TransaksiResult, String> {
    crate::logger::log(&format!(
        "COMMAND: buat_transaksi_penjualan dipanggil; items_count={}, metode_bayar={}",
        items.len(),
        metode_bayar
    ));
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut total: i64 = 0;
    let mut item_rows = Vec::new();

    for item in &items {
        // Ambil harga_jual dan stok dari DB
        let (harga_jual, stok, nama) = tx
            .query_row(
                "SELECT harga_jual, stok, nama FROM produk WHERE id = ?1 AND is_active = 1",
                params![item.produk_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(|_| format!("Produk ID {} tidak ditemukan", item.produk_id))?;

        if stok < item.qty {
            return Err(format!("Stok {} tidak cukup (tersedia: {})", nama, stok));
        }

        let subtotal = harga_jual * item.qty;
        total += subtotal;
        item_rows.push((item.produk_id, item.qty, harga_jual, subtotal));

        // Kurangi stok
        tx.execute(
            "UPDATE produk SET stok = stok - ?1, updated_at = datetime('now') WHERE id = ?2",
            params![item.qty, item.produk_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute(
        "INSERT INTO transaksi (tipe, total, metode_bayar, catatan) VALUES ('penjualan', ?1, ?2, ?3)",
        params![total, metode_bayar, catatan],
    )
    .map_err(|e| e.to_string())?;
    let transaksi_id: i64 = tx.last_insert_rowid();

    for (produk_id, qty, harga, subtotal) in item_rows {
        tx.execute(
            "INSERT INTO transaksi_item (transaksi_id, produk_id, qty, harga_satuan, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![transaksi_id, produk_id, qty, harga, subtotal],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(TransaksiResult {
        transaksi_id,
        total,
    })
}

#[tauri::command]
pub fn buat_transaksi_pembelian(
    state: State<DbState>,
    items: Vec<ItemInput>,
    catatan: Option<String>,
) -> Result<TransaksiResult, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut total: i64 = 0;
    let mut item_rows = Vec::new();

    for item in &items {
        let (harga_beli, _stok, nama) = tx
            .query_row(
                "SELECT harga_beli, stok, nama FROM produk WHERE id = ?1 AND is_active = 1",
                params![item.produk_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(|_| format!("Produk ID {} tidak ditemukan", item.produk_id))?;

        let subtotal = harga_beli * item.qty;
        total += subtotal;
        item_rows.push((item.produk_id, item.qty, harga_beli, subtotal, nama));
    }

    tx.execute(
        "INSERT INTO transaksi (tipe, total, metode_bayar, catatan) VALUES ('pembelian', ?1, 'tunai', ?2)",
        params![total, catatan],
    )
    .map_err(|e| e.to_string())?;
    let transaksi_id: i64 = tx.last_insert_rowid();

    for (produk_id, qty, harga, subtotal, _nama) in item_rows {
        tx.execute(
            "INSERT INTO transaksi_item (transaksi_id, produk_id, qty, harga_satuan, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![transaksi_id, produk_id, qty, harga, subtotal],
        )
        .map_err(|e| e.to_string())?;
        // Tambah stok
        tx.execute(
            "UPDATE produk SET stok = stok + ?1, updated_at = datetime('now') WHERE id = ?2",
            params![qty, produk_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(TransaksiResult {
        transaksi_id,
        total,
    })
}

#[tauri::command]
pub fn list_transaksi(
    state: State<DbState>,
    tipe: Option<String>,
    dari_tanggal: Option<String>,
    sampai_tanggal: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Transaksi>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT id, tipe, total, metode_bayar, catatan, tanggal, created_at FROM transaksi WHERE 1=1",
    );
    let mut params_list: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 0;

    if let Some(ref t) = tipe {
        idx += 1;
        sql.push_str(&format!(" AND tipe = ?{}", idx));
        params_list.push(Box::new(t.clone()));
    }
    if let Some(ref d) = dari_tanggal {
        idx += 1;
        sql.push_str(&format!(" AND tanggal >= ?{}", idx));
        params_list.push(Box::new(d.clone()));
    }
    if let Some(ref d) = sampai_tanggal {
        idx += 1;
        sql.push_str(&format!(" AND tanggal <= ?{}", idx));
        params_list.push(Box::new(format!("{} 23:59:59", d)));
    }

    sql.push_str(" ORDER BY tanggal DESC, id DESC");

    let limit = limit.unwrap_or(50);
    sql.push_str(&format!(" LIMIT {}", limit));
    if let Some(off) = offset {
        sql.push_str(&format!(" OFFSET {}", off));
    }

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        params_list.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(Transaksi {
                id: row.get(0)?,
                tipe: row.get(1)?,
                total: row.get(2)?,
                metode_bayar: row.get(3)?,
                catatan: row.get(4)?,
                tanggal: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Ambil baris laporan PDF: produk diagregasi per tanggal + pembayaran, lalu diurutkan abjad.
#[tauri::command]
pub fn list_laporan_produk_terjual(
    state: State<DbState>,
    dari: String,
    sampai: String,
) -> Result<Vec<LaporanProdukRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);

    // Query langsung ke SQLite menghindari banyak IPC detail transaksi saat cetak PDF.
    let mut stmt = conn
        .prepare(
            "SELECT
                substr(t.tanggal, 1, 10) AS tanggal,
                p.nama AS produk_nama,
                t.metode_bayar AS metode_bayar,
                COALESCE(SUM(ti.qty), 0) AS total_qty,
                COALESCE(SUM(ti.subtotal), 0) AS total_harga
             FROM transaksi_item ti
             JOIN transaksi t ON t.id = ti.transaksi_id
             JOIN produk p ON p.id = ti.produk_id
             WHERE t.tipe = 'penjualan' AND t.tanggal BETWEEN ?1 AND ?2
             GROUP BY substr(t.tanggal, 1, 10), p.nama, t.metode_bayar
             ORDER BY lower(p.nama) ASC, substr(t.tanggal, 1, 10) ASC, lower(t.metode_bayar) ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![dari, sampai_with_time], |row| {
            Ok(LaporanProdukRow {
                tanggal: row.get(0)?,
                produk_nama: row.get(1)?,
                metode_bayar: row.get(2)?,
                total_qty: row.get(3)?,
                total_harga: row.get(4)?,
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
pub fn get_transaksi_detail(state: State<DbState>, id: i64) -> Result<TransaksiDetail, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let header = conn
        .query_row(
            "SELECT id, tipe, total, metode_bayar, catatan, tanggal, created_at
             FROM transaksi WHERE id = ?1",
            params![id],
            |row| {
                Ok(Transaksi {
                    id: row.get(0)?,
                    tipe: row.get(1)?,
                    total: row.get(2)?,
                    metode_bayar: row.get(3)?,
                    catatan: row.get(4)?,
                    tanggal: row.get(5)?,
                    created_at: row.get(6)?,
                })
            },
        )
        .map_err(|_| "Transaksi tidak ditemukan".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT ti.id, ti.produk_id, p.nama, ti.qty, ti.harga_satuan, ti.subtotal
             FROM transaksi_item ti
             JOIN produk p ON p.id = ti.produk_id
             WHERE ti.transaksi_id = ?1
             ORDER BY ti.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id], |row| {
            Ok(TransaksiItemDetail {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                produk_nama: row.get(2)?,
                qty: row.get(3)?,
                harga_satuan: row.get(4)?,
                subtotal: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    Ok(TransaksiDetail { header, items })
}

/// Edit transaksi penjualan secara atomic: kembalikan stok lama, hitung ulang total, terapkan stok baru.
/// Hanya boleh untuk transaksi yang dibuat dalam 2 hari terakhir.
#[tauri::command]
pub fn edit_transaksi_penjualan(
    state: State<DbState>,
    id: i64,
    input: UpdatePenjualanInput,
) -> Result<TransaksiResult, String> {
    if input.items.is_empty() {
        return Err("Transaksi harus memiliki minimal satu produk".into());
    }
    // Trust boundary: cegah qty nol/negatif atau produk sama dikirim dua kali.
    let mut requested_qty: BTreeMap<i64, i64> = BTreeMap::new();
    for item in &input.items {
        if item.qty <= 0 {
            return Err("Jumlah produk harus minimal 1".into());
        }
        if requested_qty.insert(item.produk_id, item.qty).is_some() {
            return Err("Produk yang sama tidak boleh dikirim lebih dari sekali".into());
        }
    }

    let mut conn = state.0.lock().map_err(|e| e.to_string())?;

    // Validasi: hanya penjualan, maksimal 2 hari
    let (tipe, created_at): (String, String) = conn
        .query_row(
            "SELECT tipe, created_at FROM transaksi WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Transaksi tidak ditemukan".to_string())?;
    if tipe != "penjualan" {
        return Err("Hanya transaksi penjualan yang bisa diedit".into());
    }
    // Cek batas 2 hari
    if let Ok(created) = chrono::NaiveDateTime::parse_from_str(&created_at, "%Y-%m-%d %H:%M:%S") {
        if chrono::Utc::now().naive_utc() - created > chrono::Duration::hours(48) {
            return Err("Transaksi sudah lebih dari 2 hari, tidak bisa diedit".into());
        }
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. Kembalikan semua stok dari item lama
    let mut old_items: BTreeMap<i64, i64> = BTreeMap::new();
    {
        let mut stmt = tx
            .prepare("SELECT produk_id, qty FROM transaksi_item WHERE transaksi_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (pid, qty) = row.map_err(|e| e.to_string())?;
            *old_items.entry(pid).or_insert(0) += qty;
        }
    }
    for (pid, qty) in &old_items {
        tx.execute(
            "UPDATE produk SET stok = stok + ?1, updated_at = datetime('now') WHERE id = ?2",
            params![qty, pid],
        )
        .map_err(|e| e.to_string())?;
    }

    // 2. Hapus item lama
    tx.execute(
        "DELETE FROM transaksi_item WHERE transaksi_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    // 3. Insert item baru + kurangi stok + hitung total
    let mut total: i64 = 0;
    let mut new_stoks: BTreeMap<i64, i64> = BTreeMap::new();

    for item in &input.items {
        let (harga_jual, stok, nama): (i64, i64, String) = tx
            .query_row(
                "SELECT harga_jual, stok, nama FROM produk WHERE id = ?1 AND is_active = 1",
                params![item.produk_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|_| format!("Produk '{}' (ID {}) tidak ditemukan", "?", item.produk_id))?;
        if stok < item.qty {
            return Err(format!("Stok {} tidak cukup (tersedia: {})", nama, stok));
        }
        let subtotal = harga_jual * item.qty;
        total += subtotal;
        *new_stoks.entry(item.produk_id).or_insert(0) += item.qty;

        tx.execute(
            "INSERT INTO transaksi_item (transaksi_id, produk_id, qty, harga_satuan, subtotal) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, item.produk_id, item.qty, harga_jual, subtotal],
        )
        .map_err(|e| e.to_string())?;
    }
    for (pid, qty) in &new_stoks {
        tx.execute(
            "UPDATE produk SET stok = stok - ?1, updated_at = datetime('now') WHERE id = ?2",
            params![qty, pid],
        )
        .map_err(|e| e.to_string())?;
    }

    // 4. Update header
    tx.execute(
        "UPDATE transaksi SET total = ?1, metode_bayar = ?2, catatan = ?3 WHERE id = ?4",
        params![total, input.metode_bayar, input.catatan, id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(TransaksiResult {
        transaksi_id: id,
        total,
    })
}

/// Hapus transaksi penjualan & kembalikan stok. Batas 2 hari.
#[tauri::command]
pub fn delete_transaksi_penjualan(state: State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;

    let (tipe, created_at): (String, String) = conn
        .query_row(
            "SELECT tipe, created_at FROM transaksi WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Transaksi tidak ditemukan".to_string())?;
    if tipe != "penjualan" {
        return Err("Hanya transaksi penjualan yang bisa dihapus".into());
    }
    if let Ok(created) = chrono::NaiveDateTime::parse_from_str(&created_at, "%Y-%m-%d %H:%M:%S") {
        if chrono::Utc::now().naive_utc() - created > chrono::Duration::hours(48) {
            return Err("Transaksi sudah lebih dari 2 hari, tidak bisa dihapus".into());
        }
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Kembalikan stok
    {
        let mut stmt = tx
            .prepare("SELECT produk_id, qty FROM transaksi_item WHERE transaksi_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (pid, qty) = row.map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE produk SET stok = stok + ?1, updated_at = datetime('now') WHERE id = ?2",
                params![qty, pid],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // CASCADE menghapus transaksi_item, tapi delete eksplisit lebih aman
    tx.execute(
        "DELETE FROM transaksi_item WHERE transaksi_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM transaksi WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
