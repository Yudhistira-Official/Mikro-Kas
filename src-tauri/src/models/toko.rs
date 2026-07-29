use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Toko {
    pub id: i64,
    pub nama_toko: String,
    pub qris_statis: Option<String>,
    pub qris_foto_path: Option<String>,
    /// Path absolut logo perusahaan (tampil di login & identitas toko).
    #[serde(default)]
    pub logo_path: Option<String>,
    pub created_at: String,
    pub alamat: Option<String>,
    pub telepon: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    pub npwp: Option<String>,
    pub deskripsi: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TokoInput {
    pub nama_toko: String,
    pub qris_statis: Option<String>,
    pub qris_foto_path: Option<String>,
    #[serde(default)]
    pub logo_path: Option<String>,
    pub alamat: Option<String>,
    pub telepon: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    pub npwp: Option<String>,
    pub deskripsi: Option<String>,
}
