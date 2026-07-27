//! Commands pencatatan konsinyasi masuk dan keluar.

use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize)]
pub struct KonsinyasiMasuk {
    pub id: i64,
    pub nomor: String,
    pub tanggal: String,
    pub supplier_id: Option<i64>,
    pub alamat_supplier: Option<String>,
    pub telepon_supplier: Option<String>,
    pub komisi_persen: i64,
    pub batas_waktu: Option<String>,
    pub total_item: i64,
    pub status: String,
    pub catatan: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct KonsinyasiKeluar {
    pub id: i64,
    pub nomor: String,
    pub tanggal: String,
    pub penerima_nama: String,
    pub penerima_telepon: Option<String>,
    pub alamat_tujuan: Option<String>,
    pub penanggung_jawab: Option<String>,
    pub komisi_persen: i64,
    pub jadwal_evaluasi: Option<String>,
    pub total_item: i64,
    pub status: String,
    pub catatan: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct KonsinyasiItemInput {
    pub produk_id: i64,
    pub kode_barang: Option<String>,
    pub qty: i64,
    pub harga_kesepakatan: i64,
    pub harga_pembanding: i64,
    pub kondisi: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KonsinyasiMasukInput {
    pub nomor: String,
    pub tanggal: String,
    pub supplier_id: Option<i64>,
    pub alamat_supplier: Option<String>,
    pub telepon_supplier: Option<String>,
    pub komisi_persen: Option<i64>,
    pub batas_waktu: Option<String>,
    #[serde(default)]
    pub items: Vec<KonsinyasiItemInput>,
    pub total_item: Option<i64>,
    pub catatan: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KonsinyasiKeluarInput {
    pub nomor: String,
    pub tanggal: String,
    pub penerima_nama: String,
    pub penerima_telepon: Option<String>,
    pub alamat_tujuan: Option<String>,
    pub penanggung_jawab: Option<String>,
    pub komisi_persen: Option<i64>,
    pub jadwal_evaluasi: Option<String>,
    #[serde(default)]
    pub items: Vec<KonsinyasiItemInput>,
    pub total_item: Option<i64>,
    pub catatan: Option<String>,
}

fn validate_items(items: &[KonsinyasiItemInput]) -> Result<i64, String> {
    if items.is_empty() {
        return Err("Minimal satu barang wajib ditambahkan".to_string());
    }
    let mut total = 0_i64;
    for item in items {
        if item.produk_id <= 0 || item.qty <= 0 {
            return Err("Produk dan jumlah barang harus valid".to_string());
        }
        if item.harga_kesepakatan < 0 || item.harga_pembanding < 0 {
            return Err("Harga barang tidak boleh negatif".to_string());
        }
        total = total
            .checked_add(item.qty)
            .ok_or_else(|| "Total jumlah terlalu besar".to_string())?;
    }
    Ok(total)
}

#[tauri::command]
pub fn create_konsinyasi_masuk(
    state: State<DbState>,
    input: KonsinyasiMasukInput,
) -> Result<i64, String> {
    if input.nomor.trim().is_empty() || input.tanggal.trim().is_empty() {
        return Err("Nomor dan tanggal wajib diisi".to_string());
    }
    let total = validate_items(&input.items)?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO konsinyasi_masuk (nomor, tanggal, supplier_id, alamat_supplier, telepon_supplier, komisi_persen, batas_waktu, total_item, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![input.nomor.trim(), input.tanggal.trim(), input.supplier_id, input.alamat_supplier, input.telepon_supplier, input.komisi_persen.unwrap_or(15), input.batas_waktu, total, input.catatan],
    ).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    for item in &input.items {
        tx.execute(
            "INSERT INTO konsinyasi_masuk_item (konsinyasi_masuk_id, produk_id, kode_barang, qty_masuk, qty_sisa, harga_beli_kesepakatan, harga_jual_disarankan, kondisi)
             VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7)",
            params![id, item.produk_id, item.kode_barang, item.qty, item.harga_kesepakatan, item.harga_pembanding, item.kondisi],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn list_konsinyasi_masuk(state: State<DbState>) -> Result<Vec<KonsinyasiMasuk>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, nomor, tanggal, supplier_id, alamat_supplier, telepon_supplier, komisi_persen, batas_waktu, total_item, status, catatan, created_at FROM konsinyasi_masuk ORDER BY id DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(KonsinyasiMasuk {
                id: row.get(0)?,
                nomor: row.get(1)?,
                tanggal: row.get(2)?,
                supplier_id: row.get(3)?,
                alamat_supplier: row.get(4)?,
                telepon_supplier: row.get(5)?,
                komisi_persen: row.get(6)?,
                batas_waktu: row.get(7)?,
                total_item: row.get(8)?,
                status: row.get(9)?,
                catatan: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn create_konsinyasi_keluar(
    state: State<DbState>,
    input: KonsinyasiKeluarInput,
) -> Result<i64, String> {
    if input.nomor.trim().is_empty()
        || input.tanggal.trim().is_empty()
        || input.penerima_nama.trim().is_empty()
    {
        return Err("Nomor, tanggal, dan penerima wajib diisi".to_string());
    }
    let total = validate_items(&input.items)?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO konsinyasi_keluar (nomor, tanggal, penerima_nama, penerima_telepon, alamat_tujuan, penanggung_jawab, komisi_persen, jadwal_evaluasi, total_item, catatan)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![input.nomor.trim(), input.tanggal.trim(), input.penerima_nama.trim(), input.penerima_telepon, input.alamat_tujuan, input.penanggung_jawab, input.komisi_persen.unwrap_or(20), input.jadwal_evaluasi, total, input.catatan],
    ).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    for item in &input.items {
        tx.execute(
            "INSERT INTO konsinyasi_keluar_item (konsinyasi_keluar_id, produk_id, kode_barang, qty_keluar, harga_jual_kesepakatan, harga_modal, kondisi)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, item.produk_id, item.kode_barang, item.qty, item.harga_kesepakatan, item.harga_pembanding, item.kondisi],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn list_konsinyasi_keluar(state: State<DbState>) -> Result<Vec<KonsinyasiKeluar>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, nomor, tanggal, penerima_nama, penerima_telepon, alamat_tujuan, penanggung_jawab, komisi_persen, jadwal_evaluasi, total_item, status, catatan, created_at FROM konsinyasi_keluar ORDER BY id DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(KonsinyasiKeluar {
                id: row.get(0)?,
                nomor: row.get(1)?,
                tanggal: row.get(2)?,
                penerima_nama: row.get(3)?,
                penerima_telepon: row.get(4)?,
                alamat_tujuan: row.get(5)?,
                penanggung_jawab: row.get(6)?,
                komisi_persen: row.get(7)?,
                jadwal_evaluasi: row.get(8)?,
                total_item: row.get(9)?,
                status: row.get(10)?,
                catatan: row.get(11)?,
                created_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Debug, Serialize)]
pub struct KonsinyasiItem {
    pub id: i64,
    pub produk_id: i64,
    pub nama_produk: String,
    pub kode_barang: Option<String>,
    pub qty: i64,
    pub qty_terjual: i64,
    pub qty_kembali: i64,
    pub harga_kesepakatan: i64,
    pub kondisi: Option<String>,
}

#[tauri::command]
pub fn list_konsinyasi_masuk_item(
    state: State<DbState>,
    konsinyasi_masuk_id: i64,
) -> Result<Vec<KonsinyasiItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT i.id, i.produk_id, COALESCE(p.nama, '?'), i.kode_barang, i.qty_masuk, i.qty_terjual, 0, i.harga_beli_kesepakatan, i.kondisi FROM konsinyasi_masuk_item i LEFT JOIN produk p ON p.id = i.produk_id WHERE i.konsinyasi_masuk_id = ?1 ORDER BY i.id").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![konsinyasi_masuk_id], |row| {
            Ok(KonsinyasiItem {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                nama_produk: row.get(2)?,
                kode_barang: row.get(3)?,
                qty: row.get(4)?,
                qty_terjual: row.get(5)?,
                qty_kembali: row.get(6)?,
                harga_kesepakatan: row.get(7)?,
                kondisi: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn list_konsinyasi_keluar_item(
    state: State<DbState>,
    konsinyasi_keluar_id: i64,
) -> Result<Vec<KonsinyasiItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT i.id, i.produk_id, COALESCE(p.nama, '?'), i.kode_barang, i.qty_keluar, i.qty_terjual, i.qty_kembali, i.harga_jual_kesepakatan, i.kondisi FROM konsinyasi_keluar_item i LEFT JOIN produk p ON p.id = i.produk_id WHERE i.konsinyasi_keluar_id = ?1 ORDER BY i.id").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![konsinyasi_keluar_id], |row| {
            Ok(KonsinyasiItem {
                id: row.get(0)?,
                produk_id: row.get(1)?,
                nama_produk: row.get(2)?,
                kode_barang: row.get(3)?,
                qty: row.get(4)?,
                qty_terjual: row.get(5)?,
                qty_kembali: row.get(6)?,
                harga_kesepakatan: row.get(7)?,
                kondisi: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}
