//! Model data untuk tabel supplier (pemasok barang)
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Supplier {
    pub id: i64,
    pub nama: String,
    pub telepon: Option<String>,
    pub alamat: Option<String>,
    pub deskripsi_tambahan: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SupplierInput {
    pub nama: String,
    pub telepon: Option<String>,
    pub alamat: Option<String>,
    pub deskripsi_tambahan: Option<String>,
}
