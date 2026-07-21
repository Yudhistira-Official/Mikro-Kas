use serde::{Deserialize, Serialize};

/// Item input untuk membuat transaksi
#[derive(Debug, Deserialize)]
pub struct ItemInput {
    pub produk_id: i64,
    pub qty: i64,
    /// Satuan pilihan di kasir, misalnya dus/slop. Kosong berarti satuan dasar produk.
    pub satuan_pilihan: Option<String>,
}

/// Payload edit penjualan. Server selalu menghitung ulang harga dan stok.
#[derive(Debug, Deserialize)]
pub struct UpdatePenjualanInput {
    pub items: Vec<ItemInput>,
    pub metode_bayar: String,
    pub catatan: Option<String>,
}

/// Header transaksi (penjualan / pembelian)
/// ponytail: pajak_nominal, biaya_layanan, ongkir ditambahkan untuk gap KasGo Phase 1.
///   total_final = subtotal - diskon + pajak + biaya_layanan + ongkir.
///   Kolom lama tetap nullable saat select agar query lama tidak pecah.
#[derive(Debug, Serialize, Deserialize)]
pub struct Transaksi {
    pub id: i64,
    pub tipe: String,
    pub total: i64,
    pub metode_bayar: String,
    pub catatan: Option<String>,
    pub tanggal: String,
    pub created_at: String,
    #[serde(default)]
    pub pajak_nominal: i64,
    #[serde(default)]
    pub biaya_layanan: i64,
    #[serde(default)]
    pub ongkir: i64,
    pub supplier_id: Option<i64>,
    #[serde(default)]
    pub supplier_nama: Option<String>,
    #[serde(default)]
    pub no_nota: Option<i64>,
}

/// Detail transaksi + item-itemnya
#[derive(Debug, Serialize)]
pub struct TransaksiDetail {
    pub header: Transaksi,
    pub items: Vec<TransaksiItemDetail>,
}

/// Baris item dalam transaksi. produk_id diperlukan untuk edit aman di riwayat.
#[derive(Debug, Serialize)]
pub struct TransaksiItemDetail {
    pub id: i64,
    pub produk_id: i64,
    pub produk_nama: String,
    pub qty: i64,
    pub harga_satuan: i64,
    pub subtotal: i64,
}

/// Hasil setelah membuat transaksi
#[derive(Debug, Serialize)]
pub struct TransaksiResult {
    pub transaksi_id: i64,
    pub total: i64,
}
