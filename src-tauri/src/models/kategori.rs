use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Kategori {
    pub id: i64,
    pub nama: String,
}

/// Input untuk membuat / update kategori
#[derive(Debug, Deserialize)]
pub struct KategoriInput {
    pub nama: String,
}
