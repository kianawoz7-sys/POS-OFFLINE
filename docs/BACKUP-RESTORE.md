# Backup & Restore offline

Implementasi melanjutkan arsitektur Expo SDK 54, SQLiteProvider, Zustand, serta komponen UI yang sudah ada. Pengaturan mendapatkan satu menu **Backup & Restore**. Tidak ada backend atau sinkronisasi otomatis. Checkout, printer, schema database, dan halaman POS yang sudah ada tidak diubah.

## Hasil audit data

Database aktif adalah `pos.db`, schema versi 4. Semua data berikut dibawa dalam backup:

| Sumber | Isi yang dipertahankan |
| --- | --- |
| `products` | ID, nama, harga integer Rupiah, referensi foto, tanggal dibuat dan diperbarui |
| `transactions` | ID, invoice, total, metode dan nominal pembayaran, kembalian, waktu transaksi |
| `transaction_items` | Seluruh item dan snapshot nama/harga/jumlah/subtotal transaksi |
| `settings` | Semua key/value, termasuk nama toko dan jenis usaha; key tambahan juga ikut |
| `invoice_sequences` | Urutan invoice setiap tanggal, termasuk setelah transaksi dihapus |
| `sqlite_sequence` | Urutan AUTOINCREMENT agar ID baru tidak mengulang ID yang pernah digunakan |
| Foto produk lokal | Binary seluruh file yang masih direferensikan produk; referensi ke file yang sama dikemas satu kali |

Riwayat dan laporan dihitung dari tabel transaksi, sehingga ikut pulih. Source saat ini tidak menggunakan AsyncStorage, SecureStore, atau Zustand persist. Keranjang belum dibayar dan koneksi printer hanya ada di RAM. Pairing Bluetooth milik Android tidak disalin. Tidak ada status stok/kategori/SKU dalam schema saat ini; tidak ditambahkan melalui task ini.

Foto produk normal berada dalam direktori privat aplikasi `document/products`. Backup mengambil file melalui `image_path`, bukan menganggap seluruh path selalu sama. File foto yang sudah tidak direferensikan produk tidak dibawa karena tidak lagi menjadi data operasional.

## Menggunakan fitur

1. Buka **Pengaturan → Backup & Restore → Buat Backup**.
2. Aplikasi membuat snapshot SQLite dan menyalin foto, mengemas satu file, lalu membaca ulang hasilnya untuk validasi penuh.
3. Android Share terbuka untuk membagikan atau menyimpan file melalui aplikasi yang tersedia. Backup tetap tersimpan dalam daftar **Backup di perangkat ini**, termasuk bila berbagi dibatalkan. File bisa dibagikan lagi.
4. Pada perangkat tujuan, pilih **Pulihkan Backup** dan pilih `.posbackup` melalui Android file picker.
5. Setelah validasi, preview menampilkan tanggal, nama toko, jumlah produk, transaksi, dan produk dengan foto dari database asli dalam backup. **Batal** tidak mengubah database.
6. Tekan **Pulihkan**. Aplikasi membuat backup pengaman kondisi perangkat tujuan sebelum menimpa data, lalu memulihkan secara replace.

File manual diberi nama seperti `POS_MbaNell_2026-10-06_1130_a1b2c3d4.posbackup`. Sufiks acak mencegah dua backup pada menit yang sama menimpa satu sama lain. Backup pengaman ditandai `_sebelum_restore_` dan bisa **Bagikan** atau **Pulihkan** langsung dari daftar lokal untuk rollback.

Setiap card backup lokal juga menyediakan **Hapus**, sejajar dengan Bagikan dan Pulihkan. Konfirmasi menampilkan nama file; Batal tidak menjalankan penghapusan. Hapus hanya memilih satu instance File `.posbackup` di direktori backup lokal dengan URI dan nama yang sama, lalu menghapus file itu. Folder, file di luar direktori, serta backup lain tidak ikut dihapus. Daftar dibaca ulang setelah penghapusan berhasil; bila gagal, pesan error ditampilkan tanpa menghilangkan item secara optimistis. Tidak ada retention policy atau auto-delete.

Pembuatan dan pemulihan backup berjalan offline. Mengirim lewat Google Drive atau WhatsApp mengikuti kebutuhan koneksi aplikasi tersebut. Untuk perpindahan sepenuhnya offline, gunakan USB, media penyimpanan, atau transfer file lokal yang didukung HP.

## Format `.posbackup`, versi 1

Satu file ZIP standar, ditulis tanpa kompresi agar pengemasan foto tidak membebani CPU. Ekstensinya `.posbackup`:

```text
manifest.json
manifest.sha256
database.sqlite
images/000001.jpg
images/000002.png
...
```

`database.sqlite` adalah snapshot SQLite binary mandiri, bukan salinan mentah `pos.db` yang sedang aktif. SQLite online backup menyertakan halaman WAL yang sudah commit. Snapshot sementara disetel ke journal mode DELETE dan koneksinya ditutup sebelum file dikemas, sehingga tidak membutuhkan file `-wal` atau `-shm` dari perangkat asal.

Contoh bentuk metadata berikut memakai placeholder hash untuk penjelasan; file yang dibuat aplikasi berisi SHA-256 64 karakter sebenarnya:

```json
{
  "appId": "com.rumahmakan.posoffline",
  "backupVersion": 1,
  "appVersion": "1.0.0",
  "createdAt": "2026-10-06T04:30:00.000Z",
  "storeName": "Mba Nell",
  "databaseVersion": 4,
  "purpose": "manual",
  "database": {
    "file": "database.sqlite",
    "size": 32768,
    "sha256": "<SHA-256 database>"
  },
  "images": [
    { "file": "images/000001.jpg", "size": 120000, "sha256": "<SHA-256 foto>" }
  ],
  "productImages": [
    { "productId": 1, "file": "images/000001.jpg" }
  ]
}
```

`manifest.sha256` berisi SHA-256 byte persis `manifest.json`. `purpose` bernilai `manual` atau `pre-restore`. `createdAt` disimpan sebagai ISO UTC dan ditampilkan memakai waktu lokal HP. Jumlah produk/transaksi tidak dipercayai dari metadata: dihitung dengan query SQLite setelah database diekstrak dan diperiksa.

Batas saat ini: file/total isi arsip maksimum **64 MiB**, satu foto maksimum **20 MiB**, manifest maksimum **128 KiB**, dan maksimum 5.000 foto/referensi produk. Batas manifest dapat tercapai lebih dulu. Ukuran dan nama entri diperiksa sebelum dekompresi. Entri duplikat, path traversal, file tambahan yang tidak dikenal, serta kompresi yang tidak didukung ditolak. Pengemas memakai `fflate` 0.8.3.

Backup tidak dienkripsi. Hash mendeteksi kerusakan; `appId` menandai format aplikasi, bukan tanda tangan kriptografis yang membuktikan pemilik pembuat file. Perlakukan file sebagai salinan seluruh data usaha.

## Validasi dan proses Restore

1. File picker membuat salinan dalam cache. Aplikasi memeriksa ZIP, metadata wajib, identitas aplikasi, versi format, dan versi database. Saat ini hanya format 1 dengan schema 4 diterima; backup dari versi lain ditolak dengan pesan kompatibilitas.
2. Semua ukuran/hash diverifikasi. Header SQLite harus merupakan snapshot mandiri. Database dibuka di direktori staging terpisah, bukan di lokasi database aktif.
3. Aplikasi memeriksa `user_version`, bentuk seluruh tabel, primary key, foreign key, `integrity_check`, `foreign_key_check`, integer Rupiah, ID, invoice unik, dan urutan ID/invoice. Tabel/schema tambahan yang belum didukung ditolak agar tidak kehilangan data secara diam-diam. Nama toko dan referensi foto harus sesuai isi database.
4. Koneksi staging ditutup, kemudian preview diberikan. Batal hanya membersihkan staging/cache dan tidak membuat backup pengaman.
5. Saat dikonfirmasi, isi staging diperiksa ulang. Backup pengaman dibuat dari database aktif dan seluruh foto yang direferensikannya. Hasil file dibaca ulang dan divalidasi sebelum dianggap selesai. File ditulis sebagai `.partial`, baru diubah menjadi `.posbackup` setelah valid. Gagal membuat backup pengaman membatalkan restore sebelum perubahan data aktif.
6. Foto disalin dan diverifikasi dalam `document/products/restore-<UUID>` pada HP tujuan. `products.image_path` pada database staging diperbarui ke URI baru. ID produk dan timestamp tidak berubah. Foto lama perangkat tujuan tetap tersedia untuk pemulihan.
7. Restore membuka koneksi SQLite khusus, mengaktifkan foreign keys dan busy timeout **sebelum** `BEGIN IMMEDIATE`. Kunci tulis diperoleh sebelum memeriksa apakah database masih sama dengan snapshot pengaman. Pemeriksaan menggunakan `data_version` dan `total_changes()` untuk mendeteksi perubahan dari koneksi lain maupun koneksi aplikasi.
8. Database staging yang koneksinya sudah ditutup di-ATTACH. Semua tabel data aktif diganti menggunakan DELETE/INSERT SELECT dalam **satu transaksi**. `sqlite_sequence` dan `invoice_sequences` dipertahankan dari sumber. Foreign keys diperiksa sebelum COMMIT. Bila operasi gagal sebelum commit, SQLite melakukan rollback; data dan foto lama tetap tersedia.
9. Koneksi khusus ditutup dan attachment ikut dilepas. Database aktif tidak pernah dihapus atau ditukar filenya; SQLiteProvider tetap memakai database yang sama. Setelah commit, cache Zustand/keranjang dikosongkan dan halaman dimuat ulang lewat loader yang sudah ada. Error pembersihan koneksi setelah commit tidak dianggap rollback dan tidak menghapus foto hasil restore.

UI menahan navigasi dan input selama proses, tombol ganda ditolak, dan operasi POS yang masih terdeteksi berjalan membuat proses ditunda dengan pesan error. Jika ada write yang sudah berjalan sebelum layar terkunci, pemeriksaan revisi membatalkan restore agar transaksi baru tersebut tidak hilang dari backup pengaman.

Contoh replace: bila backup memiliki 300 transaksi, HP tujuan menjadi 300 transaksi. Transaksi sebelumnya hanya tersedia dalam backup pengaman, bukan digabungkan.

## Batas dan edge case

- Foto hilang, URI bukan file lokal, backup rusak, schema tidak sesuai, atau ruang penyimpanan habis menghasilkan error. Foto yang hilang harus dipilih ulang sebelum membuat backup. Restore juga berhenti bila foto kondisi sekarang tidak dapat dibackup untuk pengaman.
- Pengemasan/pembacaan menggunakan buffer memori. HP dengan RAM kecil dan backup mendekati 64 MiB perlu diuji langsung; jangan menganggap batas ukuran sebagai jaminan kapasitas semua HP.
- Restore membutuhkan ruang untuk backup pengaman, staging, foto baru, dan transaksi SQLite. Proses tidak menebak kebutuhan ruang tersisa; kegagalan tulis sebelum commit mempertahankan data lama.
- Backup lokal dan foto lama tidak dihapus otomatis. Banyak backup/restore dapat menambah pemakaian storage. Penghapusan otomatis sengaja tidak ditambahkan agar salinan rollback tidak hilang.
- Jika Android mematikan proses sebelum COMMIT, SQLite membatalkan perubahan yang belum commit. Cache, `.partial`, atau direktori foto baru yang belum direferensikan dapat tertinggal; tidak dipakai sebagai backup selesai. Jika proses berhenti setelah COMMIT, data baru tetap ada ketika aplikasi dibuka kembali. Skenario penghentian proses nyata belum diuji pada HP.
- Menghapus aplikasi atau clear data juga menghapus backup dalam storage privatnya. Gunakan **Bagikan** untuk menyimpan salinan di luar aplikasi sebelum itu.
- Dukungan schema/format baru harus ditambahkan secara eksplisit. `appVersion` dicatat untuk diagnosis, sedangkan keputusan kompatibilitas mengikuti format dan database version.
- Keranjang belum dibayar dikosongkan setelah restore. Hubungkan printer kembali sesuai kebutuhan Android; konfigurasi pairing OS tidak termasuk backup.

## Verifikasi otomatis

```bash
npm test
npx tsc --noEmit
npm run lint
```

Hasil implementasi: **46 tes lulus**: 25 Backup & Restore dan 21 regresi Fase 1. Tes backup mengeksekusi service produksi pada file SQLite nyata dan dua lokasi penyimpanan terpisah. API native Expo FileSystem/Crypto dimodelkan memakai filesystem/hash lokal; online backup memakai API SQLite nyata. Tes penghapusan memeriksa hanya file terpilih yang hilang, folder/file lain ditolak, dan file/daftar tetap utuh bila penghapusan gagal.

Tes mencakup clone, replace tanpa merge, foto berpindah path, pengaturan tambahan, urutan invoice/ID, checkout berikutnya, restart database, pembatalan, file rusak/tidak cocok, referensi tidak valid, perubahan staging, double action, batas ukuran, kegagalan di tengah DELETE/salin foto/backup pengaman, write yang masih berjalan, kunci tulis, foreign keys koneksi restore, dan error cleanup setelah commit.

Tes ini **belum menggantikan acceptance pada dua HP Android**. File picker, Android Share, tampilan UI native, kapasitas RAM/storage, serta penghentian proses oleh Android perlu diuji dengan APK.

## Uji pada dua HP Android

Gunakan APK baru `artifacts/POS-Offline-BackupRestore.apk`, Android 7 atau lebih baru. APK mandiri memuat JavaScript dan modul native picker/sharing/crypto, sehingga tidak membutuhkan Metro atau Expo Go. APK Fase 1 lama belum memuat fitur ini.

Build lokal:

```powershell
.\scripts\build-apk.ps1 -ApkName POS-Offline-BackupRestore.apk
```

Build masih memakai debug keystore untuk pengujian. Untuk mempertahankan data HP A, pasang sebagai update di atas APK sebelumnya dengan package dan tanda tangan sama; jangan uninstall. HP B boleh instalasi bersih. Pengujian bersih berarti aplikasi belum berisi data operasional lain, bukan mewajibkan penghapusan data usaha.

APK hasil build sudah diperiksa: signature v2 valid dan sertifikat sama dengan build Fase 1, package `com.rumahmakan.posoffline`, minimum Android API 24, arsitektur ARM 64-bit/32-bit, CRC arsip valid, bundle Hermes tertanam, modul picker/sharing/crypto tersedia, serta kode restore dan Hapus backup terakhir ikut dalam bundle. Ukuran 44,76 MiB. SHA-256 artifact: `291b8064f16a2c929a66fe34952394d21a215f41581c9fbf8d65a536eaa093c7`; file `.apk.sha256` juga tersedia di folder `artifacts`.

| Test | Langkah | Hasil yang diharapkan |
| --- | --- | --- |
| A: clone | Di HP A, isi produk dengan beberapa foto, nama/jenis toko, transaksi tunai/QRIS. Catat jumlah, nominal laporan, invoice terakhir dan foto. Mode pesawat, buat backup, bagikan/simpan dan pindahkan ke HP B. Buka di HP B lalu pulihkan. | Preview sesuai data A. Produk, harga, foto, detail riwayat, laporan dan pengaturan B sesuai A. Tidak membutuhkan internet untuk membuat atau restore backup. |
| B: file salah/rusak | Catat data B. Pilih JPEG/text yang diganti namanya menjadi `.posbackup`; coba juga salinan backup yang dipotong/diubah byte melalui komputer. Jangan merusak satu-satunya backup asli. | Restore ditolak sebelum preview/penimpaan. Data B tetap sama setelah restart. |
| C: batal | Pada B yang berisi data, pilih backup valid; periksa preview lalu tekan Batal. Coba juga batalkan file picker. | Semua data B tetap sama. Tidak ada backup pengaman baru hanya karena preview dibatalkan. |
| D: restart | Setelah restore berhasil, force stop aplikasi dan buka kembali dalam mode pesawat. | Data, invoice, pengaturan dan foto hasil restore tetap ada. |
| E: foto lintas HP | Pakai foto yang ditambahkan ke A melalui galeri. Pindahkan hanya `.posbackup`, tanpa menyalin folder foto A. Cek Produk dan layar transaksi B. | Semua foto tampil di B walaupun path aplikasi kedua HP berbeda. |
| F: transaksi baru | Setelah restore dan restart B, lakukan pembayaran tunai dan QRIS baru. Periksa riwayat/laporan dan invoice. | Transaksi baru berhasil, ID/invoice tidak bentrok, transaksi lama tetap ada. Jika tanggal berbeda, urutan mengikuti tanggal transaksi baru. |
| Replace dan rollback | Sebelum restore, B isi satu produk/transaksi berbeda. Restore backup A. Buka daftar backup pengaman `_sebelum_restore_`, periksa preview, lalu pulihkan. | Setelah restore A, hanya data A aktif. Setelah rollback, data B sebelum restore kembali, termasuk foto; bukan gabungan. |
| Share dibatalkan | Buat backup lalu batalkan Android Share. | Backup selesai tetap berada di daftar dan dapat dibagikan kembali. |
| Tap ganda | Tekan Buat Backup/Pulihkan cepat dua kali. | Satu operasi berjalan; tidak membuat restore bersamaan. |
| Hapus backup lokal | Siapkan dua backup. Tekan Hapus di salah satu card, periksa nama file, lalu Batal. Ulangi dan konfirmasi Hapus. | Batal mempertahankan kedua file. Hapus menghilangkan hanya file terpilih dan daftar langsung diperbarui. |

Catat model HP A/B, versi Android, nama file, jumlah produk/transaksi, hasil foto, hasil restart, hasil checkout baru dan pesan error. Acceptance A–F pada perangkat fisik masih perlu diisi dari hasil uji tersebut.

## Daftar file implementasi

| File | Perubahan |
| --- | --- |
| `services/backup-format.ts` | Format ZIP, metadata, SHA-256, validasi arsip dan batas ukuran |
| `services/backup-database.ts` | Validasi schema/data SQLite serta transaksi replace atomik |
| `services/backup.ts` | Snapshot, file/foto, staging, backup pengaman, restore dan daftar backup |
| `components/backup-runtime.tsx` | Pengunci UI selama operasi dan muat ulang cache setelah restore |
| `app/(tabs)/backup.tsx` | Halaman backup/restore, picker/share, preview dan akses backup pengaman |
| `app/(tabs)/settings.tsx` | Menambah satu item menu Pengaturan |
| `app/(tabs)/_layout.tsx` | Registrasi route backup tanpa tab tambahan |
| `app/_layout.tsx` | Memasang provider operasi backup di dalam SQLiteProvider |
| `package.json`, `package-lock.json` | Expo SDK 54 picker/sharing/crypto, fflate 0.8.3, script tes |
| `tests/backup-native-mocks.cjs`, `tests/backup.test.cjs` | Adapter native lokal, SQLite nyata dan skenario keselamatan/clone |
| `scripts/build-apk.ps1` | Parameter nama output APK agar APK Fase 1 tidak ditimpa |
| `README.md`, `docs/ROADMAP.md`, `docs/TEST-APK.md`, dokumen ini | Status implementasi, cara build dan panduan acceptance |

Folder `android` diregenerasi melalui Expo prebuild dan APK/hash baru berada dalam `artifacts`; hasil tersebut merupakan output build. File checkout, migration, business store dan printer tidak diedit untuk task Backup & Restore.

Referensi API mengikuti dokumentasi [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/), [SQLite](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/), [FileSystem](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/), [DocumentPicker](https://docs.expo.dev/versions/v54.0.0/sdk/document-picker/), [Sharing](https://docs.expo.dev/versions/v54.0.0/sdk/sharing/), dan [Crypto](https://docs.expo.dev/versions/v54.0.0/sdk/crypto/).
