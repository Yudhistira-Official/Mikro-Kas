use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Kas {
    pub id: i64,
    pub tipe: String,
    pub kategori: String,
    pub jumlah: i64,
    pub keterangan: Option<String>,
    pub tanggal: String,
}

#[derive(Debug, Deserialize)]
pub struct KasInput {
    pub tipe: String,
    pub kategori: String,
    pub jumlah: i64,
    pub keterangan: Option<String>,
    pub tanggal: Option<String>,
}
