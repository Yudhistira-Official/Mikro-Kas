use serde::{Deserialize, Serialize};

/// Data profil toko (single-row, id=1)
#[derive(Debug, Serialize, Deserialize)]
pub struct Toko {
    pub id: i64,
    pub nama_toko: String,
    pub qris_statis: Option<String>,
    pub created_at: String,
}

/// Input untuk menyimpan profil toko
#[derive(Debug, Deserialize)]
pub struct TokoInput {
    pub nama_toko: String,
    pub qris_statis: Option<String>,
}
