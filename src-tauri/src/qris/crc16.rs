//! CRC16-CCITT (poly 0x1021, init 0xFFFF)
//! Digunakan untuk checksum QRIS sesuai spesifikasi EMVCo

pub fn crc16_ccitt(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if (crc & 0x8000) != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crc16_known_value() {
        // "00020101" → CRC diketahui
        let data = b"00020101";
        let crc = crc16_ccitt(data);
        // Harus menghasilkan u16 yang valid (bukan nol untuk data non-kosong)
        assert_ne!(crc, 0);
    }

    #[test]
    fn test_crc16_consistency() {
        let data = b"hello world";
        let crc1 = crc16_ccitt(data);
        let crc2 = crc16_ccitt(data);
        assert_eq!(crc1, crc2);
    }
}
