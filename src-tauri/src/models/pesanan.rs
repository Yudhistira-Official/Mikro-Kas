//! Model pesanan customer + DP.
//!
//! Pesanan sengaja disimpan sebagai header ringkas: nama pemesan, total, DP,
//! status, catatan item bebas. Ini menghindari reservasi stok otomatis yang
//! bisa berisiko mengganggu stok nyata.
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PesananCustomer {
    pub id: i64,
    pub customer_id: Option<i64>,
    pub customer_nama: Option<String>,
    pub nama_pemesan: String,
    pub total: i64,
    pub dp: i64,
    pub sisa: i64,
    pub status: String,
    pub catatan: Option<String>,
    pub jatuh_tempo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PesananCustomerInput {
    pub customer_id: Option<i64>,
    pub nama_pemesan: String,
    pub total: i64,
    pub dp: Option<i64>,
    pub catatan: Option<String>,
    pub jatuh_tempo: Option<String>,
}
