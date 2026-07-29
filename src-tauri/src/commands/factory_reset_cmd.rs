//! Factory Reset — hapus semua data transaksi, produk, customer, supplier, dll.
//! Kecuali data user (semua user tetap ada). HANYA ADMIN yang bisa akses.
use crate::commands::user_cmd::{require_admin, AuthState};
use crate::db::DbState;
use tauri::State;

/// Reset pabrik: drop semua tabel kecuali `user`.
#[tauri::command]
pub fn factory_reset(state: State<DbState>, auth: State<AuthState>) -> Result<String, String> {
    require_admin(&auth)?;
    // Get mutable connection from the Arc<Mutex<Connection>> in DbState
    let conn = state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    
    // Disable foreign key checks temporarily
    if let Err(e) = conn.execute("PRAGMA foreign_keys = OFF", []) {
        return Err(format!("Gagal disable FK: {}", e));
    }
    
    // Drop semua tabel satu per satu (kecuali user)
    let tables_to_drop = vec![
        "tukar_tambah_header", "tukar_tambah_item",
        "transfer_stok", "transfer_stok_item",
        "stock_opname",
        "adjustment_stock", "stock_adjustment", "stock_adjustment_audit",
        "serial", "stok_gudang",
        "perakitan_item", "bom", "perakitan",
        "point_log",
        "deposit_log", "deposit",
        "pembelian_item", "pembelian",
        "pengiriman_item", "pengiriman",
        "penjualan_harian",
        "retur_jual_item", "retur_jual",
        "retur_beli_item", "retur_beli",
        "komisi_sales", "sales",
        "customer", "supplier", "harga_supplier",
        "produk", "kategori",
        "level_pelanggan", "harga_pelanggan", "multi_harga",
        "promo_rule", "promocategory_product_mapping",
        "hpp_batch",
        "cojurnals", "coa",
        "transaksi", "transaksi_item",
        "hutang_piutang",
        // kasir_pin dipertahankan agar akses admin/supervisor tidak terkunci setelah reset
        "pinjaman",
        "shift",
        "cashbox_pecahan", "cashbox_transaction",
        "log_activity",
        "backup_restore_log",
        "qris_profile",
        "printer_settings", "window_mode_settings", "theme_settings",
        "nomor_settings", "pajak_setting", "user_role",
        "kampanye_promo", "rekening_pembayaran", "bank_account",
    ];
    
    let mut reset_error = None;
    for table in &tables_to_drop {
        let sql = format!("DROP TABLE IF EXISTS {}", table);
        if let Err(e) = conn.execute(&sql, []) {
            reset_error = Some(format!("Gagal drop table {}: {}", table, e));
            break;
        }
    }
    if reset_error.is_none() {
        if let Err(e) = conn.execute("DROP TABLE IF EXISTS gudang", []) {
            reset_error = Some(format!("Gagal drop table gudang: {e}"));
        }
    }
    if reset_error.is_none() {
        if let Err(e) = conn.execute("DROP TABLE IF EXISTS hardware_settings", []) {
            reset_error = Some(format!("Gagal drop table hardware_settings: {e}"));
        }
    }

    // Re-enable foreign keys even when an individual drop fails.
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Gagal enable FK: {e}"))?;
    if let Some(error) = reset_error {
        return Err(error);
    }
    Ok("Reset pabrik berhasil! Semua data sudah direset. Silakan login ulang.".to_string())
}
