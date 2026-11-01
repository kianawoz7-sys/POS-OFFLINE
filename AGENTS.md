# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# POS Offline — Rencana Pengembangan

## Konfigurasi
- Orientation: landscape (lock)
- Database: SQLite (`expo-sqlite`)
- State management: Zustand

## Fase 1 — MVP
1. Manajemen Produk — CRUD (nama, harga, stok, kategori, SKU)
2. Transaksi Penjualan — Keranjang, pilih produk, hitung total, proses bayar
3. Metode Pembayaran — Tunai & QRIS statis
4. Riwayat Transaksi — Detail pesanan selesai
5. Laporan Sederhana — Rekap penjualan per hari/minggu/bulan
6. Manajemen Stok — Update otomatis saat transaksi, notifikasi stok menipis

## Fase 2 — Pelengkap
7. Cetak Struk — Printer thermal Bluetooth
8. Manajemen Pelanggan — Data & riwayat belanja
9. Multi-User — Kasir & admin (login offline)
10. Backup & Restore — Ekspor/impor database (JSON/CSV)

## Layout
- Landscape-first: split panel untuk transaksi (produk kiri, keranjang kanan)
- Navigasi: Expo Router (tabs + stack)
