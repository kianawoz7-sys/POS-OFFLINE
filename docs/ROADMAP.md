# POS Mba Nell — urutan pengembangan

## Fase 1 — perbaikan fondasi

- [x] Migrasi atomik yang mempertahankan produk, transaksi, item, foto/path, pengaturan, ID dan waktu lama.
- [x] Rupiah integer; input `13000` dan `13.000` menghasilkan 13000. Nominal pecahan/negatif/tidak aman ditolak.
- [x] Pengunci checkout di store dan layar pembayaran; perubahan keranjang diblokir selama proses simpan.
- [x] QRIS memakai total transaksi dan kembalian nol; mengganti metode serta menyelesaikan transaksi membersihkan input tunai.
- [x] Gagal simpan mempertahankan keranjang; hasil sukses memakai transaksi yang sudah commit, tanpa bergantung pada reload riwayat.
- [x] Invoice unik dan `created_at` disimpan dalam transaksi database yang sama; struk memakai data tersimpan.
- [x] Regresi otomatis dengan SQLite nyata, TypeScript dan lint.

Fase ini tidak menambah menu, jenis pesanan, stok, backup, refund, atau fitur kas baru. Pengujian APK/perangkat tetap masuk Fase 5.

## Fase 2 — data safety

- [x] Backup offline SQLite, pengaturan dan foto menjadi satu `.posbackup` dengan Android Share.
- [x] Restore replace atomik dengan path foto baru pada perangkat tujuan.
- [x] Validasi metadata, hash dan database sebelum preview/perubahan data.
- [x] Backup otomatis yang diverifikasi sebelum restore, tersedia untuk rollback.

Implementasi dan tes otomatis selesai. Acceptance A–F pada dua HP fisik masih perlu dilakukan menggunakan APK baru; lihat [BACKUP-RESTORE.md](BACKUP-RESTORE.md). Task ini tidak menambah fitur Fase 3–4.

## Fase 3 — Mba Nell

- [ ] Sembilan menu sesuai poster, menggunakan pengelolaan produk yang sudah ada.
- [ ] Makan di tempat / bungkus.
- [ ] Catatan pesanan.
- [ ] Habis / tersedia.
- [ ] Nama toko.
- [ ] QRIS Mba Nell.

## Fase 4 — operasional

- [ ] Verifikasi cetak struk pada printer yang dipakai.
- [ ] Cetak ulang dari riwayat.
- [ ] Refund dengan riwayat/alasan.
- [ ] Saldo awal.
- [ ] Kas masuk / keluar.
- [ ] Tutup kas.

## Fase 5 — tes APK

- [ ] Offline.
- [ ] Restart aplikasi.
- [ ] Double tap.
- [ ] Update database lama.
- [ ] Backup rusak.
- [ ] Restore.
- [ ] Printer Bluetooth fisik.
