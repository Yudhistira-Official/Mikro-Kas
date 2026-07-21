use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Produk {
    pub id: i64,
    pub kategori_id: Option<i64>,
    pub kategori_nama: Option<String>,
    pub supplier_id: Option<i64>,
    pub supplier_nama: Option<String>,
    pub nama: String,
    pub sku: Option<String>,
    pub satuan: String,
    pub harga_beli: i64,
    pub harga_jual: i64,
    pub stok: i64,
    pub stok_minimum: i64,
    pub foto_path: Option<String>,
    pub harga_diskon: i64,
    pub diskon_berlaku_sampai: Option<String>,
    pub is_active: bool,
    pub satuan_multi: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ProdukInput {
    pub kategori_id: Option<i64>,
    pub supplier_id: Option<i64>,
    pub nama: String,
    pub sku: Option<String>,
    pub satuan: Option<String>,
    pub harga_beli: Option<i64>,
    pub harga_jual: i64,
    pub stok: Option<i64>,
    pub stok_minimum: Option<i64>,
    pub foto_path: Option<String>,
    pub satuan_multi: Option<String>,
    pub harga_diskon: Option<i64>,
    pub diskon_berlaku_sampai: Option<String>,
}
