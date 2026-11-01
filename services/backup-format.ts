import * as Crypto from 'expo-crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DATABASE_VERSION } from '@/services/database';

export const BACKUP_APP_ID = 'com.rumahmakan.posoffline';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 128 * 1024;
const IMAGE_ENTRY = /^images\/[0-9]{6}\.(jpg|jpeg|png|webp|gif|heic|heif|bmp|img)$/;

export interface BackupAsset {
  file: string;
  size: number;
  sha256: string;
}

export interface BackupMetadata {
  appId: string;
  backupVersion: number;
  appVersion: string;
  createdAt: string;
  storeName: string;
  databaseVersion: number;
  purpose: 'manual' | 'pre-restore';
  database: BackupAsset;
  images: BackupAsset[];
  productImages: { productId: number; file: string }[];
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  // FileSystem and fflate return ArrayBuffer-backed arrays, never shared views.
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function invalid(message: string): never {
  throw new Error(`Backup tidak valid: ${message}`);
}

export function validateMetadata(value: unknown): asserts value is BackupMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('metadata tidak ditemukan.');
  const data = value as BackupMetadata;
  if (data.appId !== BACKUP_APP_ID) invalid('file bukan backup POS Offline ini.');
  if (data.backupVersion !== BACKUP_VERSION) invalid('versi format backup belum didukung.');
  if (data.databaseVersion !== DATABASE_VERSION) {
    invalid('versi database berbeda. Gunakan aplikasi yang mendukung versi database backup ini.');
  }
  if (typeof data.appVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(data.appVersion)) invalid('versi aplikasi tidak valid.');
  if (typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) || new Date(data.createdAt).toISOString() !== data.createdAt) invalid('tanggal tidak valid.');
  if (typeof data.storeName !== 'string' || !data.storeName.trim()) invalid('nama toko tidak valid.');
  if (data.purpose !== 'manual' && data.purpose !== 'pre-restore') invalid('jenis backup tidak valid.');
  if (!Array.isArray(data.images) || !Array.isArray(data.productImages) || data.images.length > 5000 || data.productImages.length > 5000) invalid('daftar gambar tidak valid.');
  const names = new Set<string>();
  let total = 0;
  for (const [index, asset] of [data.database, ...data.images].entries()) {
    if (!asset || typeof asset !== 'object' || typeof asset.file !== 'string' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) invalid('informasi file tidak valid.');
    if (index === 0 ? asset.file !== 'database.sqlite' : !IMAGE_ENTRY.test(asset.file) || asset.size > MAX_IMAGE_BYTES) invalid('nama/ukuran file tidak didukung.');
    if (names.has(asset.file)) invalid('file duplikat.');
    names.add(asset.file);
    total += asset.size;
  }
  if (total > MAX_BACKUP_BYTES) invalid('isi backup melebihi 64 MiB.');
  const ids = new Set<number>();
  const referenced = new Set<string>();
  for (const image of data.productImages) {
    if (!image || !Number.isSafeInteger(image.productId) || image.productId <= 0 || ids.has(image.productId) || !IMAGE_ENTRY.test(image.file) || !names.has(image.file)) invalid('referensi foto produk tidak valid.');
    ids.add(image.productId);
    referenced.add(image.file);
  }
  if (referenced.size !== data.images.length) invalid('ada gambar tanpa referensi produk.');
}

export async function encodeBackup(metadata: BackupMetadata, payloads: Record<string, Uint8Array>): Promise<Uint8Array> {
  validateMetadata(metadata);
  const manifest = strToU8(JSON.stringify(metadata));
  if (manifest.length > MAX_MANIFEST_BYTES) invalid('metadata terlalu besar.');
  const bytes = zipSync({ ...payloads, 'manifest.json': manifest, 'manifest.sha256': strToU8(await sha256(manifest)) }, { level: 0 });
  if (bytes.length > MAX_BACKUP_BYTES) invalid('file backup melebihi 64 MiB.');
  return bytes;
}

export async function decodeBackup(bytes: Uint8Array): Promise<{ metadata: BackupMetadata; files: Record<string, Uint8Array> }> {
  if (bytes.length > MAX_BACKUP_BYTES || bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) invalid('format/ukuran file salah. Pilih file .posbackup.');
  let files: Record<string, Uint8Array>;
  const names = new Set<string>();
  let total = 0;
  try {
    files = unzipSync(bytes, { filter: (entry) => {
      const { name, originalSize, compression } = entry;
      if (names.has(name) || names.size >= 5003 || !['manifest.json', 'manifest.sha256', 'database.sqlite'].includes(name) && !IMAGE_ENTRY.test(name)) invalid('entri arsip tidak didukung/duplikat.');
      if (compression !== 0 && compression !== 8) invalid('kompresi tidak didukung.');
      if (!Number.isSafeInteger(originalSize) || originalSize <= 0 || originalSize > (IMAGE_ENTRY.test(name) ? MAX_IMAGE_BYTES : name.startsWith('manifest.') ? MAX_MANIFEST_BYTES : MAX_BACKUP_BYTES)) invalid('ukuran entri terlalu besar.');
      total += originalSize;
      if (total > MAX_BACKUP_BYTES) invalid('isi arsip melebihi 64 MiB.');
      names.add(name);
      return true;
    } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Backup tidak valid:')) throw error;
    invalid('arsip rusak atau tidak dapat dibaca.');
  }
  if (!files['manifest.json'] || !files['manifest.sha256'] || !files['database.sqlite']) invalid('komponen wajib tidak lengkap.');
  if (strFromU8(files['manifest.sha256']) !== await sha256(files['manifest.json'])) invalid('metadata rusak.');
  let metadata: unknown;
  try { metadata = JSON.parse(strFromU8(files['manifest.json'])); } catch { invalid('metadata tidak dapat dibaca.'); }
  validateMetadata(metadata);
  if (Object.keys(files).length !== metadata.images.length + 3) invalid('jumlah file tidak cocok.');
  for (const asset of [metadata.database, ...metadata.images]) {
    const content = files[asset.file];
    if (!content || content.length !== asset.size || await sha256(content) !== asset.sha256) invalid(`isi ${asset.file} rusak/tidak lengkap.`);
  }
  const database = files['database.sqlite'];
  if (database.length < 100 || strFromU8(database.subarray(0, 16)) !== 'SQLite format 3\0' || database[18] !== 1 || database[19] !== 1) invalid('database SQLite bukan snapshot mandiri.');
  return { metadata, files };
}
