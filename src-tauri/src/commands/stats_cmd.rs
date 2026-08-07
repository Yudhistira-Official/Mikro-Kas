//! Aggregate COUNT/SUM for page header stats (full DB, not paginated list length).
use crate::db::DbState;
use serde::Serialize;
use tauri::State;

fn q_i64(conn: &rusqlite::Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

fn q_i64_params(conn: &rusqlite::Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<i64, String> {
    conn.query_row(sql, params, |row| row.get(0))
        .map_err(|e| e.to_string())
}

// ── Produk / inventori ──────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ProdukStats {
    pub total: i64,
    pub aktif: i64,
    pub stok_menipis: i64,
    pub nilai_modal: i64,
    pub total_kategori: i64,
}

/// Statistik master produk (seluruh DB, bukan halaman paginated).
#[tauri::command]
pub fn get_produk_stats(state: State<DbState>) -> Result<ProdukStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(ProdukStats {
        total: q_i64(&conn, "SELECT COUNT(*) FROM produk")?,
        aktif: q_i64(&conn, "SELECT COUNT(*) FROM produk WHERE is_active = 1")?,
        stok_menipis: q_i64(
            &conn,
            "SELECT COUNT(*) FROM produk WHERE is_active = 1 AND stok <= COALESCE(stok_minimum, 0)",
        )?,
        nilai_modal: q_i64(
            &conn,
            "SELECT COALESCE(SUM(harga_beli * stok), 0) FROM produk WHERE is_active = 1",
        )?,
        total_kategori: q_i64(&conn, "SELECT COUNT(*) FROM kategori").unwrap_or(0),
    })
}

// ── Customer ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CustomerStats {
    pub total: i64,
    pub punya_limit: i64,
    pub punya_telepon: i64,
}

#[tauri::command]
pub fn get_customer_stats(state: State<DbState>) -> Result<CustomerStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(CustomerStats {
        total: q_i64(&conn, "SELECT COUNT(*) FROM customer")?,
        punya_limit: q_i64(
            &conn,
            "SELECT COUNT(*) FROM customer WHERE COALESCE(limit_kredit, 0) > 0",
        )?,
        punya_telepon: q_i64(
            &conn,
            "SELECT COUNT(*) FROM customer WHERE telepon IS NOT NULL AND trim(telepon) != ''",
        )?,
    })
}

// ── Supplier ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SupplierStats {
    pub total: i64,
    pub punya_telepon: i64,
    pub punya_alamat: i64,
}

#[tauri::command]
pub fn get_supplier_stats(state: State<DbState>) -> Result<SupplierStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(SupplierStats {
        total: q_i64(&conn, "SELECT COUNT(*) FROM supplier")?,
        punya_telepon: q_i64(
            &conn,
            "SELECT COUNT(*) FROM supplier WHERE telepon IS NOT NULL AND trim(telepon) != ''",
        )?,
        punya_alamat: q_i64(
            &conn,
            "SELECT COUNT(*) FROM supplier WHERE alamat IS NOT NULL AND trim(alamat) != ''",
        )?,
    })
}

// ── Sales ───────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SalesStats {
    pub aktif: i64,
    pub total: i64,
}

#[tauri::command]
pub fn get_sales_stats(state: State<DbState>) -> Result<SalesStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // tabel sales mungkin belum ada di DB lama
    let total = q_i64(&conn, "SELECT COUNT(*) FROM sales").unwrap_or(0);
    let aktif = q_i64(&conn, "SELECT COUNT(*) FROM sales WHERE is_active = 1").unwrap_or(0);
    Ok(SalesStats { aktif, total })
}

// ── Gudang ──────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GudangStats {
    pub total: i64,
    pub default_count: i64,
    pub punya_alamat: i64,
}

#[tauri::command]
pub fn get_gudang_stats(state: State<DbState>) -> Result<GudangStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(GudangStats {
        total: q_i64(&conn, "SELECT COUNT(*) FROM gudang").unwrap_or(0),
        default_count: q_i64(&conn, "SELECT COUNT(*) FROM gudang WHERE is_default = 1").unwrap_or(0),
        punya_alamat: q_i64(
            &conn,
            "SELECT COUNT(*) FROM gudang WHERE alamat IS NOT NULL AND trim(alamat) != ''",
        )
        .unwrap_or(0),
    })
}

// ── Transaksi penjualan (riwayat) ───────────────────────────────

#[derive(Debug, Serialize)]
pub struct TransaksiPenjualanStats {
    pub jumlah: i64,
    pub total_omzet: i64,
}

#[tauri::command]
pub fn get_transaksi_penjualan_stats(
    state: State<DbState>,
    dari: Option<String>,
    sampai: Option<String>,
) -> Result<TransaksiPenjualanStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let (sql_count, sql_sum, params): (String, String, Vec<String>) =
        match (dari.filter(|s| !s.is_empty()), sampai.filter(|s| !s.is_empty())) {
            (Some(d), Some(s)) => (
                "SELECT COUNT(*) FROM transaksi WHERE tipe='penjualan' AND date(tanggal) BETWEEN date(?1) AND date(?2)".into(),
                "SELECT COALESCE(SUM(total),0) FROM transaksi WHERE tipe='penjualan' AND date(tanggal) BETWEEN date(?1) AND date(?2)".into(),
                vec![d, s],
            ),
            _ => (
                "SELECT COUNT(*) FROM transaksi WHERE tipe='penjualan'".into(),
                "SELECT COALESCE(SUM(total),0) FROM transaksi WHERE tipe='penjualan'".into(),
                vec![],
            ),
        };
    let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let jumlah = if refs.is_empty() {
        q_i64(&conn, &sql_count)?
    } else {
        q_i64_params(&conn, &sql_count, &refs)?
    };
    let total_omzet = if refs.is_empty() {
        q_i64(&conn, &sql_sum)?
    } else {
        q_i64_params(&conn, &sql_sum, &refs)?
    };
    Ok(TransaksiPenjualanStats { jumlah, total_omzet })
}

// ── Pesanan customer ────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct PesananStats {
    pub jumlah: i64,
    pub total: i64,
    pub total_dp: i64,
    pub total_sisa: i64,
}

#[tauri::command]
pub fn get_pesanan_stats(
    state: State<DbState>,
    status: Option<String>,
) -> Result<PesananStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let st = status.unwrap_or_else(|| "open".to_string());
    let (where_sql, use_status) = if st == "semua" {
        ("", false)
    } else {
        (" WHERE status = ?1", true)
    };
    let sql = format!(
        "SELECT COUNT(*), COALESCE(SUM(total),0), COALESCE(SUM(dp),0), COALESCE(SUM(total - dp),0)
         FROM pesanan_customer{where_sql}"
    );
    let row = if use_status {
        conn.query_row(&sql, rusqlite::params![st], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
    } else {
        conn.query_row(&sql, [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
    };
    let (jumlah, total, total_dp, total_sisa) = row.unwrap_or((0, 0, 0, 0));
    Ok(PesananStats {
        jumlah,
        total,
        total_dp,
        total_sisa,
    })
}

// ── Pengiriman ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct PengirimanStats {
    pub total: i64,
    pub diproses: i64,
    pub dikirim: i64,
    pub diterima: i64,
}

#[tauri::command]
pub fn get_pengiriman_stats(state: State<DbState>) -> Result<PengirimanStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(PengirimanStats {
        total: q_i64(&conn, "SELECT COUNT(*) FROM pengiriman").unwrap_or(0),
        diproses: q_i64(&conn, "SELECT COUNT(*) FROM pengiriman WHERE status = 'diproses'").unwrap_or(0),
        dikirim: q_i64(&conn, "SELECT COUNT(*) FROM pengiriman WHERE status = 'dikirim'").unwrap_or(0),
        diterima: q_i64(&conn, "SELECT COUNT(*) FROM pengiriman WHERE status = 'diterima'").unwrap_or(0),
    })
}

// ── Stock opname ────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct StockOpnameStats {
    pub total_opname: i64,
    pub total_produk_aktif: i64,
}

#[tauri::command]
pub fn get_stock_opname_stats(state: State<DbState>) -> Result<StockOpnameStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(StockOpnameStats {
        total_opname: q_i64(&conn, "SELECT COUNT(*) FROM stock_opname").unwrap_or(0),
        total_produk_aktif: q_i64(&conn, "SELECT COUNT(*) FROM produk WHERE is_active = 1")
            .unwrap_or(0),
    })
}

// ── Pembelian restock page (produk aktif + supplier) ────────────

#[derive(Debug, Serialize)]
pub struct PembelianPageStats {
    pub produk_aktif: i64,
    pub supplier: i64,
}

#[tauri::command]
pub fn get_pembelian_page_stats(state: State<DbState>) -> Result<PembelianPageStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(PembelianPageStats {
        produk_aktif: q_i64(&conn, "SELECT COUNT(*) FROM produk WHERE is_active = 1")?,
        supplier: q_i64(&conn, "SELECT COUNT(*) FROM supplier")?,
    })
}


// ── Konsinyasi ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct KonsinyasiStats {
    pub masuk: i64,
    pub keluar: i64,
    pub total_item: i64,
}

#[tauri::command]
pub fn get_konsinyasi_stats(state: State<DbState>) -> Result<KonsinyasiStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let masuk = q_i64(&conn, "SELECT COUNT(*) FROM konsinyasi_masuk").unwrap_or(0);
    let keluar = q_i64(&conn, "SELECT COUNT(*) FROM konsinyasi_keluar").unwrap_or(0);
    let item_masuk = q_i64(&conn, "SELECT COALESCE(SUM(total_item),0) FROM konsinyasi_masuk").unwrap_or(0);
    let item_keluar = q_i64(&conn, "SELECT COALESCE(SUM(total_item),0) FROM konsinyasi_keluar").unwrap_or(0);
    Ok(KonsinyasiStats {
        masuk,
        keluar,
        total_item: item_masuk + item_keluar,
    })
}
