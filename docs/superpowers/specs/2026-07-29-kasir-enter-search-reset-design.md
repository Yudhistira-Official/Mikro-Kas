# Kasir Enter Search Reset

## Tujuan
Saat input pencarian kasir berisi SKU atau teks lalu user menekan Enter, kasir memilih hasil pencarian pertama dan menambahkannya ke keranjang. Field pencarian dikosongkan setelah berhasil agar user dapat mencari barang berikutnya.

## Perilaku
- Enter pada field pencarian kosong tidak melakukan apa pun.
- Enter pada pencarian non-kosong memilih hasil teratas dari daftar hasil yang sama dengan UI.
- Hasil ditemukan: gunakan handler penambahan produk yang ada, pertahankan keranjang dan seluruh form customer, sales, diskon, serta pembayaran, lalu reset field pencarian dan kembalikan fokus ke field tersebut.
- Hasil tidak ditemukan: tampilkan notifikasi `Barang tidak ada`; pertahankan teks pencarian agar dapat dikoreksi.
- Klik produk dan scan barcode tetap memakai perilaku yang sudah ada.

## Implementasi
Perubahan dibatasi pada `src/pages/Transaksi.jsx`: simpan ref field pencarian, tangani Enter pada input, gunakan hasil teratas dari data `produk` yang sudah dimuat untuk query aktif. Tidak mengubah state checkout atau keranjang selain memanggil handler tambah produk.

## Verifikasi
- `npm run build`
- Smoke test kasir: Enter kosong, SKU valid, teks valid, pencarian tanpa hasil, serta preservasi customer/sales/diskon/pembayaran/keranjang.
