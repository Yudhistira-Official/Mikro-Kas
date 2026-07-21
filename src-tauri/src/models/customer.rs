//! Model data untuk tabel customer (pelanggan)
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Customer {
    pub id: i64,
    pub nama: String,
    pub telepon: Option<String>,
    pub alamat: Option<String>,
    pub deskripsi_tambahan: Option<String>,
    pub limit_kredit: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CustomerInput {
    pub nama: String,
    pub telepon: Option<String>,
    pub alamat: Option<String>,
    pub deskripsi_tambahan: Option<String>,
    pub limit_kredit: Option<i64>,
}
