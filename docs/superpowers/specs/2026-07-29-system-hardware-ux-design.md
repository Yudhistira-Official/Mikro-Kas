# Simplify System Settings and Hardware POS UX

## Tujuan
Hapus pengaturan tema aplikasi. Pertahankan fullscreen/windowed per user. Buat Hardware POS mudah dipahami, dengan deteksi perangkat otomatis yang mengisi form tanpa menyimpan sampai user mengonfirmasi.

## Perilaku Hardware POS
- Deteksi printer, scanner, dan customer display saat halaman Sistem dibuka.
- Hasil deteksi mengisi form secara otomatis.
- Lebar kertas mengikuti printer yang terdeteksi jika informasinya tersedia; fallback 48 karakter.
- Deteksi ulang hanya memperbarui draft form dan tidak langsung menyimpan.
- User mengonfirmasi lewat satu tombol Simpan Pengaturan Hardware.
- Test print tetap tersedia setelah konfigurasi disimpan.
- Scanner serial fields hanya ditampilkan saat port serial dipakai.
- Customer display fields hanya ditampilkan saat mode window atau serial dipilih.
- Error deteksi ditampilkan sebagai state/feedback yang ramah, bukan raw error.

## UI
- Hapus kartu Tema Aplikasi.
- Hardware dibagi menjadi kartu Printer, Scanner, dan Customer Display.
- Tampilkan status deteksi dan tombol Deteksi Ulang.
- Pertahankan fullscreen/windowed per-user.

## Batasan
- Tidak mengubah command backend atau perilaku transaksi.
- Tidak menambah dependency.
- Tidak menghapus dukungan dark token legacy dari CSS bila masih dipakai runtime; hanya UI tema yang dihapus.

## Verifikasi
- `npm run build`
- `cargo test --lib`
- `cargo build`
- Smoke test: deteksi awal, deteksi ulang, draft tidak tersimpan otomatis, konfirmasi simpan, test print, mode scanner/display conditional.
