//! Modul QRIS — TLV parser, CRC16, konversi statis → dinamis
//!
//! Referensi: spesifikasi EMVCo QR Code (standar publik).
//! Konversi: ubah tag 01 (statis "11" → dinamis "12"),
//! sisipkan tag 54 (nominal), hitung ulang CRC16-CCITT.

pub mod crc16;
pub mod parser;
pub use parser::{parse_tlv, serialize_tlv, TlvField};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum QrisError {
    #[error("Format QRIS tidak valid")]
    InvalidFormat,
    #[error("CRC QRIS tidak valid")]
    InvalidCrc,
    #[error("Tag {0} tidak ditemukan dalam QRIS")]
    MissingTag(String),
    #[error("Gagal generate QR image: {0}")]
    QrGenError(String),
}

/// Konversi QRIS statis → QRIS dinamis dengan nominal tertentu
///
/// Langkah:
/// 1. Parse TLV dari payload statis
/// 2. Validasi tag 00 ada
/// 3. Ubah tag 01: "11" → "12" (statis → dinamis)
/// 4. Sisipkan tag 54 (amount) sebelum tag 58 (country code)
/// 5. Hapus tag 63 (CRC lama)
/// 6. Hitung CRC16 baru, append ke payload
pub fn konversi_ke_dinamis(qris_statis: &str, nominal: u64) -> Result<String, QrisError> {
    let mut fields = parse_tlv(qris_statis)?;

    // Validasi: harus ada tag "00" (Payload Format Indicator)
    if !fields.iter().any(|f| f.tag == "00") {
        return Err(QrisError::MissingTag("00".to_string()));
    }

    // Ubah tag 01 menjadi "12" (dynamic)
    for field in fields.iter_mut() {
        if field.tag == "01" {
            field.value = "12".to_string();
            field.length = 2;
        }
    }

    // Hapus tag fee, nominal, dan CRC lama (kalau ada sebelumnya)
    fields.retain(|f| !matches!(f.tag.as_str(), "54" | "55" | "56" | "57" | "63"));

    // Sisipkan tag 54 (nominal) sebelum tag 58
    let nominal_str = format!("{}", nominal);
    let tag54 = TlvField {
        tag: "54".to_string(),
        length: nominal_str.len(),
        value: nominal_str,
    };

    // Cari posisi tag 58 untuk sisipkan tag 54 sebelumnya
    let pos = fields.iter().position(|f| f.tag == "58");
    match pos {
        Some(i) => fields.insert(i, tag54),
        None => fields.push(tag54), // fallback: append sebelum CRC
    }

    // Serialize tanpa CRC, lalu append "6304"
    let payload_no_crc = serialize_tlv(&fields);
    let payload_with_marker = format!("{}6304", payload_no_crc);

    // Hitung CRC16
    let crc = crc16::crc16_ccitt(payload_with_marker.as_bytes());
    let hasil = format!("{}{:04X}", payload_with_marker, crc);

    Ok(hasil)
}

/// Generate QR code image sebagai base64-encoded PNG
pub fn generate_qr_image_base64(data: &str) -> Result<String, QrisError> {
    use base64::Engine as _;
    use image::Luma;
    use qrcode::QrCode;

    let code = QrCode::new(data.as_bytes()).map_err(|e| QrisError::QrGenError(e.to_string()))?;

    let img = code.render::<Luma<u8>>().quiet_zone(true).build();
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| QrisError::QrGenError(e.to_string()))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(b64)
}

/// Data hasil parsing metadata dari string QRIS
#[derive(Debug, Serialize)]
pub struct QrisMetadata {
    pub method: String,
    pub merchant_name: String,
    pub merchant_city: String,
    pub currency: String,
    pub country_code: String,
    pub amount: Option<String>,
    pub merchant_category_code: String,
    pub tip_indicator: Option<String>,
    pub tip_fixed: Option<String>,
    pub tip_percentage: Option<String>,
    pub crc: String,
}

/// Parse metadata merchant dari string QRIS (validasi TAG 00, 01)
pub fn parse_metadata(qris: &str) -> Result<QrisMetadata, QrisError> {
    let fields = parse_tlv(qris)?;
    let find = |tag: &str| {
        fields
            .iter()
            .find(|f| f.tag == tag)
            .map(|f| f.value.clone())
    };
    let method_val = find("01").unwrap_or_default();
    Ok(QrisMetadata {
        method: if method_val == "12" {
            "dynamic".into()
        } else {
            "static".into()
        },
        merchant_name: find("59").unwrap_or_default(),
        merchant_city: find("60").unwrap_or_default(),
        currency: find("53").unwrap_or_else(|| "360".into()),
        country_code: find("58").unwrap_or_else(|| "ID".into()),
        amount: find("54"),
        merchant_category_code: find("52").unwrap_or_default(),
        tip_indicator: find("55"),
        tip_fixed: find("56"),
        tip_percentage: find("57"),
        crc: find("63").unwrap_or_default(),
    })
}

/// Validasi string QRIS: struktur TLV, required tags, CRC16
pub fn validasi_qris(qris: &str) -> Result<(), QrisError> {
    if qris.len() < 20 {
        return Err(QrisError::InvalidFormat);
    }
    // Ambil 4 karakter terakhir sebagai CRC
    let crc_str = &qris[qris.len() - 4..];
    let data_without_crc = &qris[..qris.len() - 4];
    // Verify CRC
    let calculated = crc16::crc16_ccitt(data_without_crc.as_bytes());
    let declared = u16::from_str_radix(crc_str, 16).map_err(|_| QrisError::InvalidCrc)?;
    if calculated != declared {
        return Err(QrisError::InvalidCrc);
    }
    // Parse untuk validasi struktur
    let fields = parse_tlv(qris)?;
    // Cek required tags: 00, 01, 52, 53, 58, 59, 60, 63
    let tags: std::collections::HashSet<String> = fields.iter().map(|f| f.tag.clone()).collect();
    for required in &["00", "01", "52", "53", "58", "59", "60", "63"] {
        if !tags.contains(*required) {
            return Err(QrisError::MissingTag((*required).to_string()));
        }
    }
    // Cek method value 01
    let method = fields
        .iter()
        .find(|f| f.tag == "01")
        .map(|f| f.value.as_str());
    if method != Some("11") && method != Some("12") {
        return Err(QrisError::InvalidFormat);
    }
    // Cek minimal satu merchant account info (tag 26-51)
    let has_merchant = fields.iter().any(|f| {
        f.tag.len() == 2 && {
            if let Ok(n) = f.tag.parse::<u8>() {
                n >= 26 && n <= 51
            } else {
                false
            }
        }
    });
    if !has_merchant {
        return Err(QrisError::MissingTag("Merchant Account".to_string()));
    }
    Ok(())
}

/// Konversi QRIS statis → dinamis + dukungan service fee / tip
///
/// - `fee_fixed` → tag 56, dipasang dengan tag 55 = "02" (fixed)
/// - `fee_persen` → tag 57, dipasang dengan tag 55 = "03" (%)
pub fn konversi_ke_dinamis_dengan_fee(
    qris_statis: &str,
    nominal: u64,
    fee_fixed: Option<u64>,
    fee_persen: Option<u64>,
) -> Result<String, QrisError> {
    let mut fields = parse_tlv(qris_statis)?;

    if !fields.iter().any(|f| f.tag == "00") {
        return Err(QrisError::MissingTag("00".to_string()));
    }

    // Ubah tag 01 menjadi "12" (dynamic)
    for field in fields.iter_mut() {
        if field.tag == "01" {
            field.value = "12".to_string();
            field.length = 2;
        }
    }

    // Hapus tag 54, 55, 56, 57, 63 (kalau ada sebelumnya)
    fields.retain(|f| !matches!(f.tag.as_str(), "54" | "55" | "56" | "57" | "63"));

    // Sisipkan tag 54 (nominal) sebelum tag 58
    let nominal_str = format!("{}", nominal);
    let tag54 = TlvField {
        tag: "54".into(),
        length: nominal_str.len(),
        value: nominal_str,
    };

    let pos = fields
        .iter()
        .position(|f| f.tag == "58")
        .unwrap_or(fields.len());
    fields.insert(pos, tag54);

    // Sisipkan fee tags setelah tag 54
    let after_amount_pos = pos + 1;
    if let Some(fixed) = fee_fixed {
        let fv = format!("{fixed}");
        fields.insert(
            after_amount_pos,
            TlvField {
                tag: "55".into(),
                length: 2,
                value: "02".into(),
            },
        );
        fields.insert(
            after_amount_pos + 1,
            TlvField {
                tag: "56".into(),
                length: fv.len(),
                value: fv,
            },
        );
    } else if let Some(persen) = fee_persen {
        let pv = format!("{persen}");
        fields.insert(
            after_amount_pos,
            TlvField {
                tag: "55".into(),
                length: 2,
                value: "03".into(),
            },
        );
        fields.insert(
            after_amount_pos + 1,
            TlvField {
                tag: "57".into(),
                length: pv.len(),
                value: pv,
            },
        );
    }

    let payload_no_crc = serialize_tlv(&fields);
    let payload_with_marker = format!("{}6304", payload_no_crc);
    let crc = crc16::crc16_ccitt(payload_with_marker.as_bytes());
    Ok(format!("{}{:04X}", payload_with_marker, crc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_konversi_changes_tag_01() {
        // Minimal valid QRIS payload format:
        // tag00 len02 val01 | tag01 len02 val11 | tag58 len02 valID
        let payload = "0002010102115802ID";
        // Append "6304" marker then compute CRC
        let without_crc = format!("{}6304", payload);
        let crc = crc16::crc16_ccitt(without_crc.as_bytes());
        let qris_statis = format!("{}{:04X}", without_crc, crc);

        let result = konversi_ke_dinamis(&qris_statis, 50000).unwrap();

        // Tag 01 harus jadi "12"
        let fields = parse_tlv(&result).unwrap();
        let tag01 = fields.iter().find(|f| f.tag == "01").unwrap();
        assert_eq!(tag01.value, "12");

        // Tag 54 harus ada dengan nominal 50000
        let tag54 = fields.iter().find(|f| f.tag == "54").unwrap();
        assert_eq!(tag54.value, "50000");
    }

    #[test]
    fn test_qr_image_base64() {
        let b64 = generate_qr_image_base64("test data").unwrap();
        assert!(!b64.is_empty());
        // base64 PNG starts with iVBOR...
        assert!(b64.starts_with("iVBOR"));
    }

    #[test]
    fn test_validate_rejects_invalid_crc() {
        let payload = "00020101021126120008NOBUBANK5204000053033605802ID5904TOKO6004KOTA6304";
        let crc = crc16::crc16_ccitt(payload.as_bytes());
        let valid = format!("{payload}{crc:04X}");
        assert!(validasi_qris(&valid).is_ok());

        let invalid = format!("{payload}0000");
        assert!(matches!(
            validasi_qris(&invalid),
            Err(QrisError::InvalidCrc)
        ));
    }

    #[test]
    fn test_convert_adds_fixed_service_fee() {
        let payload = "00020101021126120008NOBUBANK5204000053033605802ID5904TOKO6004KOTA6304";
        let crc = crc16::crc16_ccitt(payload.as_bytes());
        let source = format!("{payload}{crc:04X}");
        let converted = konversi_ke_dinamis_dengan_fee(&source, 15_000, Some(500), None).unwrap();
        let fields = parse_tlv(&converted).unwrap();
        assert_eq!(
            fields.iter().find(|f| f.tag == "54").unwrap().value,
            "15000"
        );
        assert_eq!(fields.iter().find(|f| f.tag == "55").unwrap().value, "02");
        assert_eq!(fields.iter().find(|f| f.tag == "56").unwrap().value, "500");
    }

    #[test]
    fn test_parse_metadata_extracts_merchant_identity() {
        let payload = "00020101021126120008NOBUBANK5204000053033605802ID5904TOKO6004KOTA6304";
        let crc = crc16::crc16_ccitt(payload.as_bytes());
        let metadata = parse_metadata(&format!("{payload}{crc:04X}")).unwrap();
        assert_eq!(metadata.merchant_name, "TOKO");
        assert_eq!(metadata.merchant_city, "KOTA");
        assert_eq!(metadata.currency, "360");
        assert_eq!(metadata.country_code, "ID");
        assert_eq!(metadata.method, "static");
    }
}
