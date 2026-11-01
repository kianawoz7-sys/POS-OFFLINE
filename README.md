# POS Offline

Aplikasi kasir (_Point of Sale_) offline berbasis **Expo / React Native**.  
Dirancang untuk UMKM, toko kecil, dan rumah makan yang membutuhkan sistem kasir sederhana tanpa perlu koneksi internet.

Dibangun dengan `create-expo-app`.

---

## Fitur

| Fitur | Status |
|---|---|
| Manajemen produk — tambah, edit, hapus, gambar | ✅ |
| Transaksi penjualan — keranjang, subtotal, bayar | ✅ |
| Metode pembayaran — Tunai & QRIS statis | ✅ |
| Cetak struk — printer thermal Bluetooth 58mm (ESC/POS) | ✅ |
| Riwayat transaksi — detail pesanan selesai | ✅ |
| Laporan penjualan — rekap harian, mingguan, bulanan | ✅ |
| Pengaturan toko — nama toko & jenis usaha | ✅ |
| Nomor invoice — daily reset (`INV-DDMMYY-001`) | ✅ |
| Manajemen stok — update otomatis & notifikasi stok menipis | ⏳ |
| Kategori produk — filter & kelompok | ⏳ |
| Multi-user — kasir & admin login offline | 📅 |
| Backup & restore offline — SQLite, foto dan pengaturan; preview dan backup pengaman | ✅ (uji dua HP masih perlu dilakukan) |

---

## Tech Stack

| Teknologi | Keterangan |
|---|---|
| **Expo SDK 54** | Framework React Native |
| **Expo Router 6** | File-based routing |
| **expo-sqlite** | Database lokal (SQLite) |
| **Zustand** | State management ringan |
| **@vardrz/react-native-bluetooth-escpos-printer** | Cetak struk Bluetooth thermal |
| **expo-symbols** / **@expo/vector-icons** | Ikon (SF Symbols / MaterialIcons) |

---

## Struktur Proyek

```
pos-offline/
├── app/                    # Halaman & navigasi (Expo Router)
│   ├── _layout.tsx         #   Root layout (Stack navigator)
│   ├── (tabs)/
│   │   ├── _layout.tsx     #   Tab navigator (4 tab)
│   │   ├── index.tsx       #   Dashboard
│   │   ├── explore.tsx     #   Produk
│   │   ├── history.tsx     #   Riwayat
│   │   ├── settings.tsx    #   Pengaturan (menu list)
│   │   ├── store-settings.tsx  # Atur Toko
│   │   ├── reports.tsx     #   Laporan
│   │   ├── printer.tsx     #   Printer Bluetooth
│   │   └── backup.tsx      #   Backup & Restore offline
│   ├── transaksi.tsx       # Transaksi penjualan (landscape)
│   └── modal.tsx           # Modal umum
├── stores/                 # Zustand stores
│   ├── productStore.ts     #   Produk
│   ├── transactionStore.ts #   Transaksi & keranjang
│   ├── printerStore.ts     #   Koneksi printer
│   └── settingsStore.ts    #   Pengaturan toko
├── services/
│   ├── database.ts         # Inisialisasi & migrasi SQLite
│   ├── backup.ts           # Snapshot/foto/backup pengaman dan restore
│   ├── backup-format.ts    # ZIP .posbackup, metadata dan hash
│   ├── backup-database.ts  # Validasi dan replace atomik
│   └── print.ts            # Cetak struk ESC/POS
├── components/             # UI components reusable
├── constants/              # Tema, warna (theme.ts)
└── hooks/                  # Custom hooks
```

---

## Cara Menjalankan

### Prasyarat

- Node.js >= 20.19 (Node.js 22.13+ untuk menjalankan tes SQLite lokal)
- Expo CLI melalui `npx expo`
- Android Studio atau perangkat Android fisik dengan USB debugging
- Gunakan build native untuk modul printer Bluetooth; modul ini tidak tersedia di Expo Go

### Install & Jalankan

```bash
# Clone & masuk direktori
cd pos-offline

# Install dependencies
npm install

# Start Expo dev server
npx expo start
```

Setelah server berjalan:

- **`a`** — buka di Android emulator / perangkat USB
- **`w`** — buka di web browser (terbatas)
- **`r`** — reload app

### Build APK

Untuk APK mandiri yang dipasang di HP dan berjalan tanpa Metro, jalankan di PowerShell dari folder proyek:

```powershell
.\scripts\build-apk.ps1
```

Script mencari Java dari `JAVA_HOME` atau Android Studio dan SDK dari `ANDROID_HOME`, `ANDROID_SDK_ROOT`, atau lokasi SDK standar Windows. Lokasi khusus dapat diberikan melalui `-JavaHome` dan `-SdkPath`. Build pertama membutuhkan internet untuk dependensi Java/Android; pemakaian APK setelah instalasi dapat offline.

Hasilnya `artifacts/POS-Offline-Fase1.apk`, berisi arsitektur ARM 64-bit dan 32-bit. Build memakai varian release dengan bundle JavaScript tertanam, serta debug keystore bawaan untuk pengujian lokal. Panduan pemasangan dan checklist ada di [docs/TEST-APK.md](docs/TEST-APK.md).

Untuk menghasilkan APK fitur Backup & Restore tanpa menimpa artifact Fase 1:

```powershell
.\scripts\build-apk.ps1 -ApkName POS-Offline-BackupRestore.apk
```

Fitur tersedia di **Pengaturan → Backup & Restore**. Satu `.posbackup` memuat SQLite dan foto produk, bisa dibagikan melalui Android, serta dipulihkan sebagai pengganti seluruh data perangkat tujuan setelah preview dan backup pengaman otomatis. Format, batas kompatibilitas, daftar file perubahan dan langkah uji dua HP ada di [docs/BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md).

Prebuild menjalankan `plugins/with-printer-android.js` untuk menyelaraskan konfigurasi Android library printer 0.1.2 dengan toolchain aplikasi, memakai Google/Maven Central, serta versi React Native yang terpasang. Patch diterapkan kembali setelah `npm ci`; versi library yang berbeda memerlukan peninjauan konfigurasi ini.

`plugins/with-android-toolchain.js` menyelaraskan Android Gradle Plugin pada library dengan versi dari katalog React Native proyek, sehingga library tidak menarik beberapa versi plugin Android sekaligus. Build native aplikasi memakai CMake 3.30.5 untuk mengatasi kegagalan path objek yang panjang pada CMake 3.22.1 di Windows; pasang versi ini melalui SDK Manager jika belum tersedia.

Untuk development di emulator/perangkat USB dengan Metro:

```bash
npx expo run:android
```

Folder `android` yang dihasilkan prebuild dapat dibuka di Android Studio. Pilih varian `release` untuk menghasilkan APK mandiri; varian `debug` digunakan bersama Metro. [Dokumentasi Expo](https://docs.expo.dev/guides/local-app-development/).

---

## Catatan Developer

### Database Migration

Semua migrasi SQLite dikelola di `services/database.ts` menggunakan pola version-based:

```ts
export const DATABASE_VERSION = 4;
// Migrasi dijalankan atomik dan mempertahankan data dari versi 0–3.
```

- Tabel: `products`, `transactions`, `transaction_items`, `settings`, `invoice_sequences`
- Harga, total, pembayaran, kembalian, dan subtotal memakai `INTEGER` dengan validasi Rupiah bulat.
- `invoice_number` dan `created_at` tersimpan bersama transaksi dan dipakai kembali oleh struk.
- Invoice transaksi lama diisi dari tanggal tersimpan dan urutan ID per hari. Nomor struk lama yang tidak pernah disimpan tidak dapat dipulihkan persis.
- Migrasi menolak nominal pecahan atau data tidak valid tanpa membulatkan/menghapus data; perubahan dibatalkan dan versi lama dipertahankan.
- Harga lama yang sudah salah terbaca, misalnya `13.000` menjadi `13`, perlu dikoreksi manual; migrasi tidak menebak harga yang dimaksud.
- Penggunaan `expo-sqlite` dengan `SQLiteProvider` + `useSQLiteContext()`

### Cetak Struk (ESC/POS)

Printer thermal Bluetooth 58mm dengan lebar **32 kolom**.  
Format dan alignment diatur di `services/print.ts`:

- **HEADER** — `printerAlign(CENTER)`: nama toko, invoice, tanggal
- **BODY** — `printerAlign(LEFT)`: item, total, pembayaran  
- **FOOTER** — `printerAlign(CENTER)`: terima kasih

Fungsi format kolom otomatis menangani padding, truncation nama produk (22 karakter max), dan right-alignment harga.

### Orientasi Layar

- **Landscape** — halaman transaksi (`app/transaksi.tsx`) — split panel produk ↔ keranjang
- **Portrait** — semua halaman lainnya (Dashboard, Produk, dll)

### State Management

Semua state dikelola dengan **Zustand** tanpa persist middleware.  
Data persisten disimpan di SQLite dan dimuat ulang setiap kali store diinisialisasi.

### Verifikasi Fase 1

Gunakan Node.js **22.13+** untuk tes SQLite lokal. Tes tidak memerlukan emulator atau dependensi tes tambahan.

```bash
npm test
npx tsc --noEmit
npm run lint
```

Tes menjalankan kode migrasi dan checkout pada SQLite nyata: upgrade versi lama, rollback, Rupiah bulat, double checkout, QRIS, invoice, buka ulang database, dan isi struk. Panggilan printer native dimock; perangkat Android dan printer Bluetooth tetap perlu diuji pada Fase 5.

`npm test` juga menjalankan tes Backup & Restore dengan SQLite nyata: clone dua lokasi penyimpanan, foto lintas path, replace/rollback, file rusak, pembatalan, persistensi setelah buka ulang dan checkout baru. API filesystem/crypto native dimodelkan secara lokal. Pengujian Android Share/file picker dan acceptance dua HP tetap mengikuti panduan Backup & Restore.

Urutan pengembangan berikutnya ada di [docs/ROADMAP.md](docs/ROADMAP.md).

---
