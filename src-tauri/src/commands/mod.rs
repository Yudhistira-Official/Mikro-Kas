//! Tauri commands — semua fungsi yang bisa dipanggil dari frontend React.
//!
//! Setiap module berisi command yang berkaitan dengan satu domain bisnis.
//! Tanda tangan fungsi: ambil State<DbState>, return Result<T, String>.

pub mod cashbox_cmd;
pub mod customer_cmd;
pub mod dashboard_cmd;
/// File operations exposed to frontend: simpan & buka file PDF
pub mod file_cmd;
pub mod hutang_piutang_cmd;
pub mod harga_supplier_cmd;
pub mod kas_cmd;
pub mod kategori_cmd;
/// Debug log operations
pub mod log_cmd;
pub mod pesanan_cmd;
pub mod shift_cmd;
pub mod produk_cmd;
pub mod pin_cmd;
pub mod qris_cmd;
pub mod qris_profile_cmd;
/// QRIS utilities exposed to frontend: validasi, metadata, konversi fee
pub mod qris_util_cmd;
pub mod supplier_cmd;
pub mod toko_cmd;
pub mod transaksi_cmd;
