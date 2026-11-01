# Uji APK di HP — Fase 1

APK uji dibuat dari kode Fase 1. Kode JavaScript dan modul Android, termasuk SQLite dan printer Bluetooth, dibundel di APK. HP tidak membutuhkan Expo Go, Metro, atau komputer untuk membuka aplikasi.

## Pasang

1. Salin APK dari folder `artifacts` ke HP Android 7 atau lebih baru.
2. Buka file APK dan izinkan pemasangan dari aplikasi pengelola file yang digunakan.
3. Pasang dan buka POS Offline.
4. Untuk menguji update, pasang APK di atas aplikasi lama dengan package dan tanda tangan yang sama. Jangan uninstall atau hapus data, karena database tersimpan di aplikasi.

APK ini memakai tanda tangan debug untuk pengujian lokal. Build rilis ke toko aplikasi memerlukan keystore sendiri.

## Isi menu uji

Tambahkan melalui halaman Produk. Menu belum diisi otomatis pada Fase 1.

| Produk | Harga |
| --- | ---: |
| Ayam Geprek | Rp13.000 |
| Ayam Goreng | Rp15.000 |
| Mie Ayam | Rp10.000 |
| Nasi | Rp3.000 |
| Es Teh | Rp3.000 |
| Es Jeruk | Rp5.000 |
| Jus Alpukat | Rp7.000 |
| Jus Mangga | Rp7.000 |
| Air Es | Rp2.000 |

Harga boleh diketik `13000` atau `13.000`; keduanya harus tersimpan sebagai Rp13.000. Nominal pecahan harus ditolak.

## Checklist

Gunakan data transaksi uji. Catat model HP, versi Android, hasil, dan pesan error jika ada.

| Uji | Langkah | Hasil yang diharapkan |
| --- | --- | --- |
| Offline | Matikan Wi-Fi/data seluler sebelum membuka aplikasi; tambahkan produk dan transaksi | Aplikasi terbuka, transaksi tersimpan, riwayat/laporan dapat dibuka |
| Tunai | Ayam Geprek + Es Teh, bayar Rp20.000 | Total Rp16.000, kembalian Rp4.000 |
| Pembayaran kurang | Pesanan Rp16.000, bayar Rp10.000 | Checkout ditolak, keranjang tetap tersedia |
| Double tap | Tekan proses bayar cepat dua kali | Satu transaksi dan satu nomor invoice tersimpan |
| Ganti metode | Ketik Rp20.000 di tunai, pindah QRIS untuk pesanan Rp16.000 | Pembayaran Rp16.000, kembalian Rp0; nominal tunai lama tidak ikut tersimpan |
| Transaksi berikutnya | Selesaikan QRIS lalu mulai pesanan baru | Metode kembali ke tunai dan nominal pembayaran kosong |
| Restart | Simpan transaksi, tutup paksa aplikasi, buka lagi saat offline | Produk, transaksi, invoice, dan tanggal tetap tersimpan |
| Update database lama | Pasang build baru di atas build lama bertanda tangan sama yang berisi transaksi | Data lama tetap ada dan invoice terisi; data lama tidak valid menampilkan error migrasi tanpa menghapus data |
| Printer Bluetooth | Nyalakan Bluetooth, buka Pengaturan → Printer, beri izin, cari dan hubungkan printer, lakukan tes cetak | Printer tersambung dan mencetak |
| Struk transaksi | Cetak setelah pembayaran berhasil | Item, nominal, invoice dan tanggal sama dengan transaksi yang tersimpan |

QRIS pada Fase 1 menguji pencatatan metode pembayaran. Gambar QRIS Mba Nell belum dipasang dan konfirmasi pembayaran masih dilakukan kasir.

Saat memakai mode pesawat untuk tes printer, hidupkan kembali Bluetooth secara manual. Setelah restart, hubungkan ulang printer melalui Pengaturan → Printer.

Backup & Restore sudah diimplementasikan pada APK baru `artifacts/POS-Offline-BackupRestore.apk`; APK Fase 1 lama belum memuat fitur tersebut. Format dan checklist dua HP tersedia di [BACKUP-RESTORE.md](BACKUP-RESTORE.md). Cetak ulang, refund dan tutup kas masih menunggu fase berikutnya. Checklist ini tidak menyatakan pengujian HP/printer sudah lulus.
