use crate::db::DbState;
use crate::models::transaksi::{
    ItemInput, Transaksi, TransaksiDetail, TransaksiItemDetail, TransaksiResult,
    UpdatePenjualanInput,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::State;

/// Aturan satuan majemuk dari kolom produk.satuan_multi (JSON).
#[derive(Debug, Deserialize)]
struct SatuanRule {
    satuan: String,
    konversi: i64,
    harga_jual: i64,
}

/// Baris laporan PDF: agregasi produk terjual per metode pembayaran dalam periode.
/// ponytail: modal dihitung dari harga_beli produk SAAT INI, bukan historical snapshot.
#[derive(Debug, Serialize)]
pub struct LaporanProdukRow {
    pub produk_nama: String,
    pub metode_bayar: String,
    pub total_qty: i64,
    pub total_modal: i64,
    pub total_harga: i64,
}

/// Baris laporan pembelian detail: restock supplier per item dan transaksi.
/// Data ini dipakai UI/CSV agar owner bisa audit pembelian tanpa membuka satu-satu riwayat.
#[derive(Debug, Serialize)]
pub struct LaporanPembelianRow {
    pub tanggal: String,
    pub transaksi_id: i64,
    pub supplier_nama: Option<String>,
    pub produk_nama: String,
    pub qty: i64,
    pub harga_satuan: i64,
    pub subtotal: i64,
    pub catatan: Option<String>,
}

#[tauri::command]
pub fn buat_transaksi_penjualan(
    state: State<DbState>,
    items: Vec<ItemInput>,
    metode_bayar: String,
    catatan: Option<String>,
    diskon_nominal: Option<i64>,
    customer_id: Option<i64>,
    pajak_nominal: Option<i64>,
    biaya_layanan: Option<i64>,
    ongkir: Option<i64>,
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
        // Ambil harga aktif dari DB. Jika satuan pilihan dipakai, backend validasi dari JSON produk.
        let (harga_base, stok, nama, satuan_multi): (i64, i64, String, Option<String>) = tx
            .query_row(
                "SELECT CASE
                    WHEN COALESCE(harga_diskon,0) > 0
                     AND (diskon_berlaku_sampai IS NULL OR diskon_berlaku_sampai >= date('now'))
                    THEN harga_diskon ELSE harga_jual END,
                    stok, nama, satuan_multi
                 FROM produk WHERE id = ?1 AND is_active = 1",
                params![item.produk_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|_| format!("Produk ID {} tidak ditemukan", item.produk_id))?;

        let mut harga_jual = harga_base;
        let mut qty_stok = item.qty;
        if let Some(unit) = item.satuan_pilihan.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            let rules: Vec<SatuanRule> = satuan_multi
                .as_deref()
                .and_then(|raw| serde_json::from_str(raw).ok())
                .unwrap_or_default();
            let rule = rules
                .into_iter()
                .find(|r| r.satuan.eq_ignore_ascii_case(unit))
                .ok_or_else(|| format!("Satuan {unit} tidak valid untuk {nama}"))?;
            if rule.konversi <= 0 || rule.harga_jual <= 0 {
                return Err(format!("Aturan satuan {unit} tidak valid"));
            }
            harga_jual = rule.harga_jual;
            qty_stok = item.qty * rule.konversi;
        }

        if stok < qty_stok {
            return Err(format!("Stok {} tidak cukup (tersedia: {})", nama, stok));
        }

        let subtotal = harga_jual * item.qty;
        total += subtotal;
        item_rows.push((item.produk_id, item.qty, harga_jual, subtotal));

        // Kurangi stok dasar: satuan besar dikonversi ke stok dasar produk.
        tx.execute(
            "UPDATE produk SET stok = stok - ?1, updated_at = datetime('now') WHERE id = ?2",
            params![qty_stok, item.produk_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Diskon dan customer disimpan di catatan agar tidak mengubah skema transaksi lama.
    // ponytail: pindah ke kolom terpisah jika laporan per-customer/diskon jadi kebutuhan wajib.
    let diskon = diskon_nominal.unwrap_or(0).max(0).min(total);
    // Biaya tambahan KasGo Phase 1: pajak, service charge, ongkir ditambahkan ke total final.
    let pajak = pajak_nominal.unwrap_or(0).max(0);
    let biaya = biaya_layanan.unwrap_or(0).max(0);
    let ongkir_val = ongkir.unwrap_or(0).max(0);
    let total_final = total - diskon + pajak + biaya + ongkir_val;
    let catatan_final = match (catatan, customer_id, diskon > 0) {
        (Some(c), Some(cid), true) => Some(format!("{c} | customer_id={cid} | diskon={diskon}")),
        (Some(c), Some(cid), false) => Some(format!("{c} | customer_id={cid}")),
        (Some(c), None, true) => Some(format!("{c} | diskon={diskon}")),
        (Some(c), None, false) => Some(c),
        (None, Some(cid), true) => Some(format!("customer_id={cid} | diskon={diskon}")),
        (None, Some(cid), false) => Some(format!("customer_id={cid}")),
        (None, None, true) => Some(format!("diskon={diskon}")),
        (None, None, false) => None,
    };

    tx.execute(
        "INSERT INTO transaksi (tipe, total, metode_bayar, catatan, pajak_nominal, biaya_layanan, ongkir)
         VALUES ('penjualan', ?1, ?2, ?3, ?4, ?5, ?6)",
        params![total_final, metode_bayar, catatan_final, pajak, biaya, ongkir_val],
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
        total: total_final,
    })
}

#[tauri::command]
pub fn buat_transaksi_pembelian(
    state: State<DbState>,
    items: Vec<ItemInput>,
    catatan: Option<String>,
    supplier_id: Option<i64>,
    dp_nominal: Option<i64>,
    jatuh_tempo: Option<String>,
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

    // Pembelian supplier mendukung DP. Sisa otomatis menjadi hutang supplier.
    let dp = dp_nominal.unwrap_or(total).max(0).min(total);
    let sisa_hutang = total - dp;
    let catatan_final = match (catatan, supplier_id, sisa_hutang > 0) {
        (Some(c), Some(sid), true) => Some(format!("{c} | supplier_id={sid} | dp={dp} | hutang={sisa_hutang}")),
        (Some(c), Some(sid), false) => Some(format!("{c} | supplier_id={sid} | dp={dp}")),
        (Some(c), None, true) => Some(format!("{c} | dp={dp} | hutang={sisa_hutang}")),
        (Some(c), None, false) => Some(c),
        (None, Some(sid), true) => Some(format!("supplier_id={sid} | dp={dp} | hutang={sisa_hutang}")),
        (None, Some(sid), false) => Some(format!("supplier_id={sid} | dp={dp}")),
        (None, None, true) => Some(format!("dp={dp} | hutang={sisa_hutang}")),
        (None, None, false) => None,
    };

    tx.execute(
        "INSERT INTO transaksi (tipe, total, metode_bayar, catatan, supplier_id)
         VALUES ('pembelian', ?1, 'tunai', ?2, ?3)",
        params![total, catatan_final, supplier_id],
    )
    .map_err(|e| e.to_string())?;
    let transaksi_id: i64 = tx.last_insert_rowid();

    if let Some(sid) = supplier_id {
        if sisa_hutang > 0 {
            // Auto-hutang memakai tabel existing agar pembayaran supplier tetap di halaman Hutang & Piutang.
            tx.execute(
                "INSERT INTO hutang_piutang (tipe, kontak_id, kontak_tipe, jumlah, jumlah_bayar, keterangan, tanggal, jatuh_tempo)
                 VALUES ('hutang', ?1, 'supplier', ?2, 0, ?3, datetime('now'), ?4)",
                params![sid, sisa_hutang, format!("Sisa pembelian #{transaksi_id}"), jatuh_tempo],
            )
            .map_err(|e| e.to_string())?;
        }
    }

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
        "WITH RankedTransaksi AS ( \
           SELECT id, ROW_NUMBER() OVER (PARTITION BY strftime('%Y-%m', tanggal) ORDER BY id ASC) as no_nota \
           FROM transaksi \
         ) \
         SELECT t.id, t.tipe, t.total, t.metode_bayar, t.catatan, t.tanggal, t.created_at, \
         COALESCE(t.pajak_nominal,0), COALESCE(t.biaya_layanan,0), COALESCE(t.ongkir,0), \
         t.supplier_id, s.nama, r.no_nota \
         FROM transaksi t \
         LEFT JOIN supplier s ON s.id = t.supplier_id \
         JOIN RankedTransaksi r ON r.id = t.id \
         WHERE 1=1",
    );
    let mut params_list: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 0;

    if let Some(ref t) = tipe {
        idx += 1;
        sql.push_str(&format!(" AND t.tipe = ?{}", idx));
        params_list.push(Box::new(t.clone()));
    }
    if let Some(ref d) = dari_tanggal {
        idx += 1;
        sql.push_str(&format!(" AND t.tanggal >= ?{}", idx));
        params_list.push(Box::new(d.clone()));
    }
    if let Some(ref d) = sampai_tanggal {
        idx += 1;
        sql.push_str(&format!(" AND t.tanggal <= ?{}", idx));
        params_list.push(Box::new(format!("{} 23:59:59", d)));
    }

    sql.push_str(" ORDER BY t.tanggal DESC, t.id DESC");

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
                pajak_nominal: row.get(7).unwrap_or(0),
                biaya_layanan: row.get(8).unwrap_or(0),
                ongkir: row.get(9).unwrap_or(0),
                supplier_id: row.get(10)?,
                supplier_nama: row.get(11)?,
                no_nota: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Ambil baris laporan PDF: produk diagregasi per nama produk + metode pembayaran.
#[tauri::command]
pub fn list_laporan_produk_terjual(
    state: State<DbState>,
    dari: String,
    sampai: String,
) -> Result<Vec<LaporanProdukRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);

    // Query langsung ke SQLite; agregasi lintas tanggal dalam periode sesuai permintaan PDF.
    let mut stmt = conn
        .prepare(
            "SELECT
                p.nama AS produk_nama,
                t.metode_bayar AS metode_bayar,
                COALESCE(SUM(ti.qty), 0) AS total_qty,
                COALESCE(SUM(ti.qty * p.harga_beli), 0) AS total_modal,
                COALESCE(SUM(ti.subtotal), 0) AS total_harga
             FROM transaksi_item ti
             JOIN transaksi t ON t.id = ti.transaksi_id
             JOIN produk p ON p.id = ti.produk_id
             WHERE t.tipe = 'penjualan' AND t.tanggal BETWEEN ?1 AND ?2
             GROUP BY p.nama, t.metode_bayar
             ORDER BY lower(p.nama) ASC, lower(t.metode_bayar) ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![dari, sampai_with_time], |row| {
            Ok(LaporanProdukRow {
                produk_nama: row.get(0)?,
                metode_bayar: row.get(1)?,
                total_qty: row.get(2)?,
                total_modal: row.get(3)?,
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
            "WITH RankedTransaksi AS ( \
               SELECT id, ROW_NUMBER() OVER (PARTITION BY strftime('%Y-%m', tanggal) ORDER BY id ASC) as no_nota \
               FROM transaksi \
             ) \
             SELECT t.id, t.tipe, t.total, t.metode_bayar, t.catatan, t.tanggal, t.created_at, \
             COALESCE(t.pajak_nominal,0), COALESCE(t.biaya_layanan,0), COALESCE(t.ongkir,0), \
             t.supplier_id, s.nama, r.no_nota \
             FROM transaksi t \
             LEFT JOIN supplier s ON s.id = t.supplier_id \
             JOIN RankedTransaksi r ON r.id = t.id \
             WHERE t.id = ?1",
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
                    pajak_nominal: row.get(7).unwrap_or(0),
                    biaya_layanan: row.get(8).unwrap_or(0),
                    ongkir: row.get(9).unwrap_or(0),
                    supplier_id: row.get(10)?,
                    supplier_nama: row.get(11)?,
                    no_nota: row.get(12)?,
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

#[derive(Debug, Serialize)]
pub struct ReturListItem {
    pub id: i64,
    pub transaksi_id: i64,
    pub total_refund: i64,
    pub alasan: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ReturItemDetail {
    pub produk_id: i64,
    pub produk_nama: String,
    pub qty: i64,
    pub harga_satuan: i64,
    pub subtotal: i64,
}

#[derive(Debug, Serialize)]
pub struct ReturDetail {
    pub header: ReturListItem,
    pub items: Vec<ReturItemDetail>,
}

/// Retur penjualan: stok kembali, total penjualan dikurangi, refund masuk kas.
/// Data retur disimpan terpisah agar riwayat bisa diedit dari halaman Retur Penjualan.
#[tauri::command]
pub fn retur_penjualan(
    state: State<DbState>,
    transaksi_id: i64,
    items: Vec<ItemInput>,
    alasan: Option<String>,
) -> Result<TransaksiResult, String> {
    if items.is_empty() {
        return Err("Item retur wajib diisi".into());
    }
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let refund_note = alasan.unwrap_or_else(|| format!("Retur transaksi #{transaksi_id}"));
    let refund_total = apply_retur_forward(&tx, transaksi_id, &items)?;

    tx.execute(
        "UPDATE transaksi SET total = CASE WHEN total - ?1 < 0 THEN 0 ELSE total - ?1 END,
         catatan = COALESCE(catatan, '') || CASE WHEN COALESCE(catatan, '') = '' THEN '' ELSE ' | ' END || ?2
         WHERE id = ?3",
        params![refund_total, refund_note, transaksi_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO kas (tipe, kategori, jumlah, keterangan) VALUES ('pengeluaran', 'Retur Penjualan', ?1, ?2)",
        params![refund_total, refund_note],
    )
    .map_err(|e| e.to_string())?;
    let kas_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO retur (transaksi_id, kas_id, total_refund, alasan) VALUES (?1, ?2, ?3, ?4)",
        params![transaksi_id, kas_id, refund_total, refund_note],
    )
    .map_err(|e| e.to_string())?;
    let retur_id = tx.last_insert_rowid();
    insert_retur_items(&tx, retur_id, &items)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(TransaksiResult { transaksi_id, total: refund_total })
}

#[tauri::command]
pub fn list_retur(state: State<DbState>) -> Result<Vec<ReturListItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, transaksi_id, total_refund, alasan, created_at FROM retur ORDER BY created_at DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(ReturListItem {
        id: row.get(0)?, transaksi_id: row.get(1)?, total_refund: row.get(2)?, alasan: row.get(3)?, created_at: row.get(4)?,
    })).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn get_retur_detail(state: State<DbState>, id: i64) -> Result<ReturDetail, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let header = conn.query_row(
        "SELECT id, transaksi_id, total_refund, alasan, created_at FROM retur WHERE id=?1",
        params![id],
        |row| Ok(ReturListItem { id: row.get(0)?, transaksi_id: row.get(1)?, total_refund: row.get(2)?, alasan: row.get(3)?, created_at: row.get(4)? }),
    ).map_err(|_| "Retur tidak ditemukan".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT ri.produk_id, p.nama, ri.qty, ri.harga_satuan, ri.subtotal
         FROM retur_item ri JOIN produk p ON p.id = ri.produk_id WHERE ri.retur_id=?1 ORDER BY p.nama ASC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![id], |row| Ok(ReturItemDetail {
        produk_id: row.get(0)?, produk_nama: row.get(1)?, qty: row.get(2)?, harga_satuan: row.get(3)?, subtotal: row.get(4)?,
    })).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows { items.push(row.map_err(|e| e.to_string())?); }
    Ok(ReturDetail { header, items })
}

#[tauri::command]
pub fn update_retur_penjualan(
    state: State<DbState>,
    retur_id: i64,
    items: Vec<ItemInput>,
    alasan: Option<String>,
) -> Result<TransaksiResult, String> {
    if items.is_empty() {
        return Err("Item retur wajib diisi".into());
    }
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let (transaksi_id, kas_id, old_total): (i64, Option<i64>, i64) = tx.query_row(
        "SELECT transaksi_id, kas_id, total_refund FROM retur WHERE id=?1",
        params![retur_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Retur tidak ditemukan".to_string())?;

    reverse_retur(&tx, retur_id, transaksi_id, old_total)?;
    let refund_total = apply_retur_forward(&tx, transaksi_id, &items)?;
    let refund_note = alasan.unwrap_or_else(|| format!("Retur transaksi #{transaksi_id}"));

    tx.execute(
        "UPDATE transaksi SET total = CASE WHEN total - ?1 < 0 THEN 0 ELSE total - ?1 END,
         catatan = COALESCE(catatan, '') || ' | edit_retur=' || ?2 WHERE id=?3",
        params![refund_total, retur_id, transaksi_id],
    ).map_err(|e| e.to_string())?;
    if let Some(kid) = kas_id {
        tx.execute("UPDATE kas SET jumlah=?1, keterangan=?2 WHERE id=?3", params![refund_total, refund_note, kid]).map_err(|e| e.to_string())?;
    }
    tx.execute(
        "UPDATE retur SET total_refund=?1, alasan=?2, updated_at=datetime('now') WHERE id=?3",
        params![refund_total, refund_note, retur_id],
    ).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM retur_item WHERE retur_id=?1", params![retur_id]).map_err(|e| e.to_string())?;
    insert_retur_items(&tx, retur_id, &items)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(TransaksiResult { transaksi_id, total: refund_total })
}

fn apply_retur_forward(tx: &rusqlite::Transaction<'_>, transaksi_id: i64, items: &[ItemInput]) -> Result<i64, String> {
    let tipe: String = tx.query_row("SELECT tipe FROM transaksi WHERE id=?1", params![transaksi_id], |row| row.get(0))
        .map_err(|_| "Transaksi asal tidak ditemukan".to_string())?;
    if tipe != "penjualan" { return Err("Retur hanya untuk transaksi penjualan".into()); }
    let mut refund_total = 0;
    for item in items {
        if item.qty <= 0 { return Err("Qty retur harus minimal 1".into()); }
        let (sold_qty, harga): (i64, i64) = tx.query_row(
            "SELECT qty, harga_satuan FROM transaksi_item WHERE transaksi_id=?1 AND produk_id=?2",
            params![transaksi_id, item.produk_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| format!("Produk ID {} tidak ada di transaksi asal", item.produk_id))?;
        if item.qty > sold_qty { return Err(format!("Qty retur melebihi qty jual ({sold_qty})")); }
        refund_total += item.qty * harga;
        tx.execute("UPDATE produk SET stok = stok + ?1, updated_at=datetime('now') WHERE id=?2", params![item.qty, item.produk_id]).map_err(|e| e.to_string())?;
        let sisa = sold_qty - item.qty;
        if sisa > 0 {
            tx.execute("UPDATE transaksi_item SET qty=?1, subtotal=?1 * harga_satuan WHERE transaksi_id=?2 AND produk_id=?3", params![sisa, transaksi_id, item.produk_id]).map_err(|e| e.to_string())?;
        } else {
            tx.execute("DELETE FROM transaksi_item WHERE transaksi_id=?1 AND produk_id=?2", params![transaksi_id, item.produk_id]).map_err(|e| e.to_string())?;
        }
    }
    Ok(refund_total)
}

fn reverse_retur(tx: &rusqlite::Transaction<'_>, retur_id: i64, transaksi_id: i64, old_total: i64) -> Result<(), String> {
    let mut stmt = tx.prepare("SELECT produk_id, qty, harga_satuan FROM retur_item WHERE retur_id=?1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![retur_id], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))).map_err(|e| e.to_string())?;
    for row in rows {
        let (produk_id, qty, harga) = row.map_err(|e| e.to_string())?;
        tx.execute("UPDATE produk SET stok = CASE WHEN stok - ?1 < 0 THEN 0 ELSE stok - ?1 END, updated_at=datetime('now') WHERE id=?2", params![qty, produk_id]).map_err(|e| e.to_string())?;
        let exists: i64 = tx.query_row("SELECT COUNT(*) FROM transaksi_item WHERE transaksi_id=?1 AND produk_id=?2", params![transaksi_id, produk_id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if exists > 0 {
            tx.execute("UPDATE transaksi_item SET qty=qty+?1, subtotal=(qty+?1)*harga_satuan WHERE transaksi_id=?2 AND produk_id=?3", params![qty, transaksi_id, produk_id]).map_err(|e| e.to_string())?;
        } else {
            tx.execute("INSERT INTO transaksi_item (transaksi_id, produk_id, qty, harga_satuan, subtotal) VALUES (?1, ?2, ?3, ?4, ?5)", params![transaksi_id, produk_id, qty, harga, qty * harga]).map_err(|e| e.to_string())?;
        }
    }
    drop(stmt);
    tx.execute("UPDATE transaksi SET total=total+?1 WHERE id=?2", params![old_total, transaksi_id]).map_err(|e| e.to_string())?;
    Ok(())
}

fn insert_retur_items(tx: &rusqlite::Transaction<'_>, retur_id: i64, items: &[ItemInput]) -> Result<(), String> {
    for item in items {
        let harga: i64 = tx.query_row("SELECT harga_jual FROM produk WHERE id=?1", params![item.produk_id], |row| row.get(0)).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO retur_item (retur_id, produk_id, qty, harga_satuan, subtotal) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![retur_id, item.produk_id, item.qty, harga, item.qty * harga],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Laporan pembelian detail per item untuk audit restock supplier dan export CSV.
#[tauri::command]
pub fn list_laporan_pembelian_detail(
    state: State<DbState>,
    dari: String,
    sampai: String,
) -> Result<Vec<LaporanPembelianRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sampai_with_time = format!("{} 23:59:59", sampai);
    let mut stmt = conn
        .prepare(
            "SELECT t.tanggal, t.id, s.nama, p.nama, ti.qty, ti.harga_satuan, ti.subtotal, t.catatan
             FROM transaksi_item ti
             JOIN transaksi t ON t.id = ti.transaksi_id
             JOIN produk p ON p.id = ti.produk_id
             LEFT JOIN supplier s ON s.id = t.supplier_id
             WHERE t.tipe = 'pembelian' AND t.tanggal BETWEEN ?1 AND ?2
             ORDER BY t.tanggal DESC, ti.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![dari, sampai_with_time], |row| {
            Ok(LaporanPembelianRow {
                tanggal: row.get(0)?,
                transaksi_id: row.get(1)?,
                supplier_nama: row.get(2)?,
                produk_nama: row.get(3)?,
                qty: row.get(4)?,
                harga_satuan: row.get(5)?,
                subtotal: row.get(6)?,
                catatan: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
