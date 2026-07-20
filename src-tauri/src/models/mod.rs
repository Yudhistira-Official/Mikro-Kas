//! Data model structs untuk semua tabel MikroKas
//!
//! Setiap struct memiliki serde Serialize (response ke frontend)
//! dan Deserialize (input dari frontend) dengan Rust-style naming.
//! Tauri akan mengonversi snake_case ↔ camelCase otomatis.

pub mod cashbox;
pub mod customer;
pub mod hutang_piutang;
pub mod kas;
pub mod kategori;
pub mod produk;
pub mod qris_profile;
pub mod supplier;
pub mod toko;
pub mod transaksi;
