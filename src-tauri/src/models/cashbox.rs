//! Model data untuk tabel cashbox dan cashbox_mutasi
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Cashbox {
    pub id: i64,
    pub nama: String,
    pub saldo: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CashboxMutasi {
    pub id: i64,
    pub cashbox_id: i64,
    pub tipe: String,
    pub jumlah: i64,
    pub dari_cashbox_id: Option<i64>,
    pub keterangan: Option<String>,
    pub tanggal: String,
}

#[derive(Debug, Deserialize)]
pub struct MutasiInput {
    pub cashbox_id: i64,
    pub tipe: String,
    pub jumlah: i64,
    pub dari_cashbox_id: Option<i64>,
    pub keterangan: Option<String>,
}
