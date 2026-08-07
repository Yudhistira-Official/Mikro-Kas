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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Fallback jika app_data_dir gagal (misal Android environment blm siap)
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("/tmp/mikrokas"));
            logger::init_logger(app_dir.clone());
            logger::log("APP: setup dimulai");
            let conn = db::init_db(app_dir).map_err(anyhow::Error::msg)?;
            app.manage(db::DbState(std::sync::Mutex::new(conn)));
            app.manage(commands::user_cmd::AuthState(std::sync::Mutex::new(None)));
            logger::log("APP: setup selesai");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Profil toko
            commands::toko_cmd::get_toko,
            commands::toko_cmd::save_toko,
            commands::toko_cmd::save_toko_foto,
            commands::toko_cmd::save_toko_logo,
            commands::toko_cmd::clear_toko_logo,
            // Kategori produk
            commands::kategori_cmd::list_kategori,
            commands::kategori_cmd::create_kategori,
            commands::kategori_cmd::update_kategori,
            commands::kategori_cmd::delete_kategori,
            // Produk
            commands::produk_cmd::list_produk,
            commands::produk_cmd::list_produk_kasir,
            commands::produk_cmd::get_produk,
            commands::produk_cmd::create_produk,
            commands::produk_cmd::update_produk,
            commands::produk_cmd::delete_produk,
            commands::produk_cmd::list_produk_low_stock,
            commands::produk_cmd::adjust_stock,
            commands::produk_cmd::list_stock_adjustments,
            commands::produk_cmd::reverse_stock_adjustment,
            commands::produk_cmd::import_produk_csv,
            commands::produk_cmd::import_produk_xlsx,
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
            commands::shift_cmd::get_shift_cash_count,
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
            // Daftar Penjualan Sales
            commands::transaksi_cmd::list_penjualan_sales,
            commands::transaksi_cmd::summary_penjualan_sales,
            // Backup/Restore
            commands::file_cmd::backup_database,
            commands::file_cmd::backup_database_to,
            commands::file_cmd::export_database_base64,
            commands::file_cmd::restore_database,
            commands::file_cmd::restore_database_base64,
            // Multi User & Role
            commands::user_cmd::create_user,
            commands::user_cmd::login_user,
            commands::user_cmd::get_current_user,
            commands::user_cmd::logout_user,
            commands::user_cmd::list_users,
            commands::user_cmd::deactivate_user,
            commands::user_cmd::reset_password,
            commands::user_cmd::update_user,
            commands::user_cmd::log_user_action,
            // Security questions (lupa password)
            commands::user_cmd::set_security_questions,
            commands::user_cmd::get_security_questions_admin,
            commands::user_cmd::get_security_questions_public,
            commands::user_cmd::verify_security_answers,
            // Transaction numbering
            commands::nomor_cmd::list_nomor_settings,
            commands::nomor_cmd::update_nomor_setting,
            commands::nomor_cmd::generate_nomor,
            // PPN settings
            commands::pajak_cmd::get_pajak_setting,
            commands::pajak_cmd::update_pajak_setting,
            commands::pajak_cmd::hitung_ppn,
            // Phase 2: Master data
            commands::master_cmd::list_master_bank,
            commands::master_cmd::list_master_ekspedisi,
            commands::master_cmd::list_master_merek,
            commands::master_cmd::create_master_bank,
            commands::master_cmd::create_master_ekspedisi,
            commands::master_cmd::create_master_merek,
            // Phase 3: Multi gudang
            commands::gudang_cmd::list_gudang,
            commands::gudang_cmd::create_gudang,
            commands::gudang_cmd::update_gudang,
            commands::gudang_cmd::delete_gudang,
            commands::gudang_cmd::hapus_gudang_permanen,
            commands::gudang_cmd::get_stok_per_gudang,
            commands::gudang_cmd::transfer_stok,
            commands::gudang_cmd::list_transfer_stok,
            // Phase 3: Serial number
            commands::serial_cmd::list_serial,
            commands::serial_cmd::check_serial_number,
            commands::serial_cmd::add_serial,
            commands::serial_cmd::update_serial_status,
            commands::serial_cmd::delete_serial,
            commands::serial_cmd::finalize_serial_transaction,
            // Phase 4-5: Akuntansi double-entry
            commands::akuntansi_cmd::list_coa,
            commands::akuntansi_cmd::create_coa,
            commands::akuntansi_cmd::create_jurnal_manual,
            commands::akuntansi_cmd::get_neraca_saldo,
            commands::akuntansi_cmd::cek_jurnal_tidak_seimbang,
            // Phase 4-5: Sales & komisi
            commands::sales_cmd::list_sales,
            commands::sales_cmd::create_sales,
            commands::sales_cmd::update_sales,
            commands::sales_cmd::delete_sales,
            commands::sales_cmd::list_komisi_terutang,
            commands::sales_cmd::bayar_komisi,
            // Phase 4-5: Point loyalty
            commands::point_cmd::get_point_setting,
            commands::point_cmd::update_point_setting,
            commands::point_cmd::get_saldo_point,
            commands::point_cmd::tukar_point,
            // Phase 4-5: Deposit
            commands::deposit_cmd::get_or_create_deposit,
            commands::deposit_cmd::top_up_deposit,
            commands::deposit_cmd::gunakan_deposit,
            commands::deposit_cmd::list_deposit_log,
            // Phase 4-5: Tukar tambah
            commands::tukar_tambah_cmd::create_tukar_tambah,
            commands::tukar_tambah_cmd::list_tukar_tambah,
            // Phase 4-5: Konsinyasi
            commands::konsinyasi_cmd::create_konsinyasi_masuk,
            commands::konsinyasi_cmd::list_konsinyasi_masuk,
            commands::konsinyasi_cmd::list_konsinyasi_masuk_item,
            commands::konsinyasi_cmd::create_konsinyasi_keluar,
            commands::konsinyasi_cmd::list_konsinyasi_keluar,
            commands::konsinyasi_cmd::list_konsinyasi_keluar_item,
            // Phase 4-5: Perakitan & BOM
            commands::perakitan_cmd::create_bom,
            commands::perakitan_cmd::list_bom,
            commands::perakitan_cmd::proses_perakitan,
            // Phase 4-5: HPP batch FIFO/LIFO
            commands::hpp_cmd::add_stok_batch,
            commands::hpp_cmd::hitung_hpp_fifo,
            commands::hpp_cmd::hitung_hpp_lifo,
            // Phase 4-5: Maintenance
            commands::maintenance_cmd::maintenance_database,
            // Phase 1-2: Printer, display, pricing, export, pengiriman
            commands::printer_cmd::build_struk_text,
            commands::printer_cmd::print_struk,
             commands::hardware_cmd::get_hardware_settings,
             commands::hardware_cmd::set_hardware_settings,
             commands::hardware_cmd::test_print_struk,
             commands::hardware_cmd::list_serial_scanner_ports,
             commands::hardware_cmd::read_serial_barcode,
            commands::printer_cmd::list_printer_candidates,
            commands::customer_display_cmd::get_customer_display_data,
            commands::pricing_cmd::hitung_diskon_bertingkat,
            commands::pricing_cmd::get_harga_jual,
            commands::import_export_cmd::export_produk_csv,
            commands::import_export_cmd::export_customer_csv,
            commands::import_export_cmd::export_supplier_csv,
            commands::pengiriman_cmd::create_pengiriman,
            commands::pengiriman_cmd::update_pengiriman_status,
            commands::pengiriman_cmd::list_pengiriman,
            // Stock opname
            commands::stock_opname_cmd::create_stock_opname,
            commands::stock_opname_cmd::list_stock_opname,
            commands::stock_opname_cmd::get_stock_opname,
            commands::stock_opname_cmd::export_stock_opname_docx,
            // Page header stats (full DB counts, not paginated length)
            commands::stats_cmd::get_produk_stats,
            commands::stats_cmd::get_customer_stats,
            commands::stats_cmd::get_supplier_stats,
            commands::stats_cmd::get_sales_stats,
            commands::stats_cmd::get_gudang_stats,
            commands::stats_cmd::get_transaksi_penjualan_stats,
            commands::stats_cmd::get_pesanan_stats,
            commands::stats_cmd::get_pengiriman_stats,
            commands::stats_cmd::get_stock_opname_stats,
            commands::stats_cmd::get_pembelian_page_stats,
            commands::stats_cmd::get_konsinyasi_stats,
            // Factory reset command (admin only)
            commands::factory_reset_cmd::factory_reset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MikroKas");
}
