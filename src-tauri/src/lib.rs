//! MikroKas — Tauri Rust core
//!
//! Semua business logic dan akses SQLite berada di sisi Rust.
//! Frontend React memanggil command melalui Tauri IPC.

mod commands;
mod db;
mod logger;
mod models;
mod pdf_plugin;
mod qris;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(pdf_plugin::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Fallback jika app_data_dir gagal (misal Android environment blm siap)
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("/tmp/mikrokas"));
            logger::init_logger(app_dir.clone());
            logger::log("APP: setup dimulai");
            let conn = db::init_db(app_dir);
            app.manage(db::DbState(std::sync::Mutex::new(conn)));
            logger::log("APP: setup selesai");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Profil toko
            commands::toko_cmd::get_toko,
            commands::toko_cmd::save_toko,
            // Kategori produk
            commands::kategori_cmd::list_kategori,
            commands::kategori_cmd::create_kategori,
            commands::kategori_cmd::update_kategori,
            commands::kategori_cmd::delete_kategori,
            // Produk
            commands::produk_cmd::list_produk,
            commands::produk_cmd::get_produk,
            commands::produk_cmd::create_produk,
            commands::produk_cmd::update_produk,
            commands::produk_cmd::delete_produk,
            commands::produk_cmd::list_produk_low_stock,
            commands::produk_cmd::adjust_stock,
            commands::produk_cmd::list_stock_adjustments,
            commands::produk_cmd::import_produk_csv,
            commands::produk_cmd::save_produk_foto,
            commands::produk_cmd::delete_produk_foto,
            commands::produk_cmd::get_ringkasan_inventori,
            commands::produk_cmd::list_laporan_inventori,
            // Penjualan / pembelian
            commands::transaksi_cmd::buat_transaksi_penjualan,
            commands::transaksi_cmd::buat_transaksi_pembelian,
            commands::transaksi_cmd::list_transaksi,
            commands::transaksi_cmd::list_laporan_produk_terjual,
            commands::transaksi_cmd::list_laporan_pembelian_detail,
            commands::pin_cmd::set_kasir_pin,
            commands::pin_cmd::verify_kasir_pin,
            commands::pin_cmd::list_kasir_pins,
            commands::pin_cmd::delete_kasir_pin,
            commands::shift_cmd::list_shift,
            commands::shift_cmd::buka_shift,
            commands::shift_cmd::tutup_shift,
            commands::dashboard_cmd::get_total_retur,
            commands::transaksi_cmd::get_transaksi_detail,
            commands::transaksi_cmd::edit_transaksi_penjualan,
            commands::transaksi_cmd::delete_transaksi_penjualan,
            // Dashboard
            commands::dashboard_cmd::get_ringkasan,
            commands::dashboard_cmd::get_penjualan_harian,
            commands::dashboard_cmd::get_produk_terlaris,
            commands::dashboard_cmd::get_keuntungan_penjualan,
            commands::dashboard_cmd::list_keuntungan_per_transaksi,
            commands::dashboard_cmd::get_transaksi_count,
            commands::dashboard_cmd::get_recent_transactions,
            // Kas manual
            commands::kas_cmd::list_kas,
            commands::kas_cmd::create_kas,
            commands::kas_cmd::delete_kas,
            commands::kas_cmd::get_ringkasan_kas,
            // QRIS dinamis
            commands::qris_cmd::generate_qris_dinamis,
            commands::qris_cmd::list_qris_log,
            commands::qris_cmd::cek_status_qris,
            commands::qris_cmd::konfirmasi_bayar_qris,
            commands::qris_cmd::expire_qris,
            commands::qris_cmd::prune_old_qris_logs,
            // QRIS profile
            commands::qris_profile_cmd::list_qris_profile,
            commands::qris_profile_cmd::save_qris_profile,
            commands::qris_profile_cmd::set_active_qris_profile,
            commands::qris_profile_cmd::delete_qris_profile,
            commands::qris_profile_cmd::get_active_qris_profile,
            // QRIS utility
            commands::qris_util_cmd::validate_qris_string,
            commands::qris_util_cmd::parse_qris,
            commands::qris_util_cmd::generate_qris_with_fee,
            // File operations: simpan & buka file
            commands::file_cmd::simpan_pdf,
            // Debug log
            commands::log_cmd::read_log,
            commands::log_cmd::write_log,
            commands::log_cmd::copy_log_to_downloads,
            // Customer
            commands::customer_cmd::list_customer,
            commands::customer_cmd::create_customer,
            commands::customer_cmd::import_customer_csv,
            commands::customer_cmd::get_laporan_pelanggan,
            commands::customer_cmd::update_customer,
            commands::customer_cmd::delete_customer,
            commands::customer_cmd::get_customer,
            // Pesanan Customer
            commands::pesanan_cmd::list_pesanan_customer,
            commands::pesanan_cmd::create_pesanan_customer,
            commands::pesanan_cmd::get_pesanan_customer,
            commands::pesanan_cmd::update_status_pesanan_customer,
            commands::pesanan_cmd::delete_pesanan_customer,
            // Supplier
            commands::supplier_cmd::list_supplier,
            commands::supplier_cmd::get_supplier,
            commands::supplier_cmd::create_supplier,
            commands::supplier_cmd::update_supplier,
            commands::supplier_cmd::delete_supplier,
            // Catatan Harga Supplier
            commands::harga_supplier_cmd::list_catatan_harga_supplier,
            commands::harga_supplier_cmd::create_catatan_harga_supplier,
            commands::harga_supplier_cmd::delete_catatan_harga_supplier,
            // Hutang/Piutang
            commands::hutang_piutang_cmd::list_hutang_piutang,
            commands::hutang_piutang_cmd::create_hutang_piutang,
            commands::hutang_piutang_cmd::bayar_hutang_piutang,
            commands::hutang_piutang_cmd::delete_hutang_piutang,
            // Cashbox
            commands::cashbox_cmd::list_cashbox,
            commands::cashbox_cmd::create_cashbox,
            commands::cashbox_cmd::mutasi_cashbox,
            commands::cashbox_cmd::list_cashbox_mutasi,
            // Retur penjualan
            commands::transaksi_cmd::retur_penjualan,
            commands::transaksi_cmd::list_retur,
            commands::transaksi_cmd::get_retur_detail,
            commands::transaksi_cmd::update_retur_penjualan,
            // Backup/Restore
            commands::file_cmd::backup_database,
            commands::file_cmd::backup_database_to,
            commands::file_cmd::export_database_base64,
            commands::file_cmd::restore_database,
            commands::file_cmd::restore_database_base64,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MikroKas");
}
