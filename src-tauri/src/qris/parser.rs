//! TLV (Tag-Length-Value) parser untuk format EMVCo QRIS
//!
//! Format TLV EMVCo: 2 karakter tag + 2 karakter length (desimal) + value
//! Contoh: "00" "02" "01" → tag=00, length=2, value="01"

use super::QrisError;

#[derive(Debug, Clone)]
pub struct TlvField {
    pub tag: String,
    pub length: usize,
    pub value: String,
}

/// Parse string QRIS menjadi list TLV fields
pub fn parse_tlv(payload: &str) -> Result<Vec<TlvField>, QrisError> {
    let mut fields = Vec::new();
    let chars: Vec<char> = payload.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i + 4 <= len {
        // Tag: 2 karakter
        let tag: String = chars[i..i + 2].iter().collect();
        // Length: 2 karakter desimal
        let len_str: String = chars[i + 2..i + 4].iter().collect();
        let field_len: usize = len_str.parse().map_err(|_| QrisError::InvalidFormat)?;

        let value_start = i + 4;
        let value_end = value_start + field_len;

        if value_end > len {
            return Err(QrisError::InvalidFormat);
        }

        let value: String = chars[value_start..value_end].iter().collect();

        fields.push(TlvField {
            tag,
            length: field_len,
            value,
        });

        i = value_end;
    }

    Ok(fields)
}

/// Serialize list TLV fields kembali menjadi string payload
pub fn serialize_tlv(fields: &[TlvField]) -> String {
    fields
        .iter()
        .map(|f| format!("{}{:02}{}", f.tag, f.value.len(), f.value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple() {
        // tag00 len02 val01 | tag01 len02 val11 | tag58 len02 valID
        let payload = "0002010102115802ID";
        let fields = parse_tlv(payload).unwrap();
        assert_eq!(fields[0].tag, "00");
        assert_eq!(fields[0].value, "01");
        assert_eq!(fields[1].tag, "01");
        assert_eq!(fields[1].value, "11");
    }

    #[test]
    fn test_roundtrip() {
        let payload = "0002010102115802ID";
        let fields = parse_tlv(payload).unwrap();
        let result = serialize_tlv(&fields);
        assert_eq!(result, payload);
    }
}
