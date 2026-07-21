// harga_supplier.rs — Model data untuk tabel catatan_harga_supplier.
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CatatanHargaSupplier {
    pub id: i64,
    pub supplier_id: i64,
    pub produk_id: i64,
    pub produk_nama: String,
    pub harga: i64,
    pub satuan: String,
    pub catatan: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct HargaSupplierInput {
    pub supplier_id: i64,
    pub produk_id: i64,
    pub harga: i64,
    pub satuan: String,
    pub catatan: Option<String>,
}
