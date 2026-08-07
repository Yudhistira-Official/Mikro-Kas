//! Tauri commands — semua fungsi yang bisa dipanggil dari frontend React.
//!
//! Setiap module berisi command yang berkaitan dengan satu domain bisnis.
//! Tanda tangan fungsi: ambil State<DbState>, return Result<T, String>.

/// Phase 4-5: Akuntansi double-entry (COA + jurnal)
pub mod akuntansi_cmd;
pub mod cashbox_cmd;
pub mod customer_cmd;
/// Phase 1-2: Customer display data
pub mod customer_display_cmd;
pub mod dashboard_cmd;
/// Phase 4-5: Deposit customer prabayar
pub mod deposit_cmd;
/// File operations exposed to frontend: simpan & buka file PDF
pub mod file_cmd;
pub mod gudang_cmd;
pub mod hardware_cmd;
pub mod harga_supplier_cmd;
/// Phase 4-5: HPP tracking per batch (FIFO/LIFO)
pub mod hpp_cmd;
pub mod hutang_piutang_cmd;
/// Phase 1-2: Import/export CSV
pub mod import_export_cmd;
pub mod kas_cmd;
pub mod kategori_cmd;
/// Phase 4-5: Konsinyasi masuk dan keluar
pub mod konsinyasi_cmd;
/// Debug log operations
pub mod log_cmd;
/// Phase 4-5: Maintenance database
pub mod maintenance_cmd;
pub mod master_cmd;
pub mod nomor_cmd;
pub mod pajak_cmd;
/// Phase 1-2: Pengiriman & resi
pub mod pengiriman_cmd;
/// Phase 4-5: Perakitan produk dan BOM
pub mod perakitan_cmd;
pub mod pesanan_cmd;
pub mod pin_cmd;
/// Phase 4-5: Point loyalty system
pub mod point_cmd;
/// Phase 1-2: Pricing & multi-tier discount
pub mod pricing_cmd;
/// Phase 1-2: Printer & struk text
pub mod printer_cmd;
pub mod produk_cmd;
pub mod qris_cmd;
pub mod qris_profile_cmd;
/// QRIS utilities exposed to frontend: validasi, metadata, konversi fee
pub mod qris_util_cmd;
/// Phase 4-5: Sales representative dan komisi
pub mod sales_cmd;
pub mod serial_cmd;
pub mod shift_cmd;
/// Stock opname (stok fisik vs stok sistem)
pub mod stats_cmd;
pub mod stock_opname_cmd;
pub mod supplier_cmd;
pub mod toko_cmd;
pub mod transaksi_cmd;
/// Phase 4-5: Tukar tambah barang
pub mod tukar_tambah_cmd;
pub mod user_cmd;
pub mod factory_reset_cmd;
