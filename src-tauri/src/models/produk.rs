use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Produk {
    pub id: i64,
    pub kategori_id: Option<i64>,
    pub kategori_nama: Option<String>,
    pub supplier_id: Option<i64>,
    pub supplier_nama: Option<String>,
    pub nama: String,
    pub kata_kunci: Option<String>,
    pub sku: Option<String>,
    /// Semua barcode/SKU produk (SKU pertama = utama, tampil di kasir).
    #[serde(default)]
    pub skus: Vec<String>,
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
    // New fields from Item2.xlsx format
    pub merek: Option<String>,
    pub tipe_item: Option<String>,
    pub rak: Option<String>,
    pub kode_item: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProdukKasir {
    pub id: i64,
    pub nama: String,
    /// SKU utama (pertama) — yang ditampilkan di kasir.
    pub sku: Option<String>,
    /// Semua barcode/SKU; scan cocok ke salah satu.
    #[serde(default)]
    pub skus: Vec<String>,
    pub kata_kunci: Option<String>,
    pub satuan: String,
    pub harga_jual: i64,
    pub stok: i64,
    pub stok_minimum: i64,
    pub harga_diskon: i64,
    pub diskon_berlaku_sampai: Option<String>,
    pub satuan_multi: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProdukInput {
    pub kategori_id: Option<i64>,
    pub supplier_id: Option<i64>,
    pub nama: String,
    pub kata_kunci: Option<String>,
    pub sku: Option<String>,
    /// Multi-SKU/barcode; jika diisi, override `sku` tunggal.
    #[serde(default)]
    pub skus: Option<Vec<String>>,
    pub satuan: Option<String>,
    pub harga_beli: Option<i64>,
    pub harga_jual: i64,
    pub stok: Option<i64>,
    pub stok_minimum: Option<i64>,
    pub foto_path: Option<String>,
    pub satuan_multi: Option<String>,
    pub harga_diskon: Option<i64>,
    pub diskon_berlaku_sampai: Option<String>,
    // New fields from Item2.xlsx format
    pub merek: Option<String>,
    pub tipe_item: Option<String>,
    pub rak: Option<String>,
    pub kode_item: Option<String>,
}
