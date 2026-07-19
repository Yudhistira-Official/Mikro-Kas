use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QrisProfile {
    pub id: i64,
    pub nama: String,
    pub merchant_name: Option<String>,
    pub qris_statis: String,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct QrisProfileInput {
    pub nama: String,
    pub merchant_name: Option<String>,
    pub qris_statis: String,
}
