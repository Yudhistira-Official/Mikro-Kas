//! Model data untuk tabel hutang_piutang
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HutangPiutang {
    pub id: i64,
    pub tipe: String,
    pub kontak_id: i64,
    pub kontak_tipe: String,
    pub jumlah: i64,
    pub jumlah_bayar: i64,
    pub keterangan: Option<String>,
    pub status: String,
    pub tanggal: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct HutangPiutangInput {
    pub tipe: String,
    pub kontak_id: i64,
    pub kontak_tipe: String,
    pub jumlah: i64,
    pub keterangan: Option<String>,
    pub tanggal: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BayarHutangPiutangInput {
    pub id: i64,
    pub jumlah_bayar: i64,
}
