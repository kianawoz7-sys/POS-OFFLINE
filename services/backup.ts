import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from '@/services/database';
import { DATABASE_VERSION } from '@/services/database';
import { BACKUP_APP_ID, BACKUP_VERSION, MAX_BACKUP_BYTES, MAX_IMAGE_BYTES, decodeBackup, encodeBackup, sha256, type BackupAsset, type BackupMetadata } from '@/services/backup-format';
import { inspectBackupDatabase, replaceDatabaseContents, validateProductImages, type BackupSummary } from '@/services/backup-database';

export type BackupProgress = (message: string) => void;
export interface SavedBackup { uri: string; name: string; size: number; modifiedAt: number }
interface DatabaseRevision { dataVersion: number; changes: number }
export interface PreparedBackup {
  metadata: BackupMetadata;
  summary: BackupSummary;
  directory: Directory;
  database: File;
  images: { asset: BackupAsset; file: File }[];
  disposed: boolean;
}

let operating = false;
async function exclusive<T>(task: () => Promise<T>): Promise<T> {
  if (operating) throw new Error('Backup/restore lain masih berjalan. Tunggu sampai selesai.');
  operating = true;
  try { return await task(); } finally { operating = false; }
}

function stagingDirectory(): Directory {
  const directory = new Directory(Paths.cache, `posbackup-${Crypto.randomUUID()}`);
  directory.create({ intermediates: true });
  return directory;
}

function removeTemporary(item: Directory | File | undefined): void {
  try { if (item?.exists) item.delete(); } catch (error) { console.warn('cleanup backup:', error); }
}

async function usingDatabase<T>(file: File, task: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await SQLite.openDatabaseAsync(file.name, { useNewConnection: true }, file.parentDirectory.uri);
  try { return await task(db); } finally { await db.closeAsync(); }
}

function describe(file: File): SavedBackup {
  return { uri: file.uri, name: file.name, size: file.size, modifiedAt: file.modificationTime ?? 0 };
}

async function databaseRevision(db: SQLiteDatabase): Promise<DatabaseRevision> {
  const revision = await db.getFirstAsync<DatabaseRevision>('SELECT (SELECT data_version FROM pragma_data_version) AS dataVersion, total_changes() AS changes');
  if (!revision) throw new Error('Status database tidak dapat dibaca.');
  return revision;
}

function assertSameRevision(before: DatabaseRevision, after: DatabaseRevision): void {
  if (before.dataVersion !== after.dataVersion || before.changes !== after.changes) throw new Error('Data POS berubah saat backup/restore berjalan. Tunggu operasi POS selesai lalu coba lagi.');
}

export function listSavedBackups(): SavedBackup[] {
  const directory = new Directory(Paths.document, 'backups');
  if (!directory.exists) return [];
  return directory.list().filter((item): item is File => item instanceof File && item.name.endsWith('.posbackup')).map(describe).sort((a, b) => b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name));
}

export function deleteSavedBackup(backup: SavedBackup): Promise<void> {
  return exclusive(async () => {
    const directory = new Directory(Paths.document, 'backups');
    // Select one actual file from this directory; never delete a caller-supplied
    // path or a Directory, even if a directory has a .posbackup name.
    const file = directory.exists ? directory.list().find((item): item is File =>
      item instanceof File && item.name.endsWith('.posbackup') && item.uri === backup.uri && item.name === backup.name
    ) : undefined;
    if (!file) throw new Error('File backup lokal tidak ditemukan. Tidak ada file yang dihapus.');
    file.delete();
  });
}

export function disposePreparedBackup(prepared: PreparedBackup | null): void {
  if (!prepared || prepared.disposed) return;
  prepared.disposed = true;
  removeTemporary(prepared.directory);
}

async function prepareFile(uri: string, progress: BackupProgress): Promise<PreparedBackup> {
  progress('Memvalidasi file backup...');
  const input = new File(uri);
  if (!input.exists || input.size <= 0 || input.size > MAX_BACKUP_BYTES) throw new Error('File tidak dapat dibaca atau melebihi batas 64 MiB.');
  const { metadata, files } = await decodeBackup(await input.bytes());
  const directory = stagingDirectory();
  try {
    const database = new File(directory, 'database.sqlite');
    database.create();
    database.write(files['database.sqlite']);
    const images = metadata.images.map((asset, index) => {
      const file = new File(directory, `image-${index}.${asset.file.split('.').pop()}`);
      file.create();
      file.write(files[asset.file]);
      return { asset, file };
    });
    const summary = await usingDatabase(database, async (db) => {
      await db.execAsync('PRAGMA query_only = ON; PRAGMA foreign_keys = ON;');
      const summary = await inspectBackupDatabase(db);
      await validateProductImages(db, metadata);
      if (summary.storeName !== metadata.storeName) throw new Error('Nama toko metadata tidak sesuai database.');
      return summary;
    });
    return { metadata, summary, directory, database, images, disposed: false };
  } catch (error) {
    removeTemporary(directory);
    throw error;
  }
}

export function prepareBackup(uri: string, progress: BackupProgress = () => {}): Promise<PreparedBackup> {
  return exclusive(() => prepareFile(uri, progress));
}

function backupName(storeName: string, createdAt: Date, purpose: BackupMetadata['purpose']): string {
  const name = storeName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 60) || 'Toko';
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())}_${pad(createdAt.getHours())}${pad(createdAt.getMinutes())}`;
  return `POS_${name}_${date}${purpose === 'pre-restore' ? '_sebelum_restore' : ''}_${Crypto.randomUUID().slice(0, 8)}.posbackup`;
}

async function createBackupFile(db: SQLiteDatabase, purpose: BackupMetadata['purpose'], progress: BackupProgress): Promise<SavedBackup & { revision: DatabaseRevision }> {
  const directory = stagingDirectory();
  let output: File | undefined;
  let complete = false;
  try {
    progress(purpose === 'pre-restore' ? 'Membuat backup pengaman data sekarang...' : 'Membuat snapshot database...');
    const revision = await databaseRevision(db);
    const snapshot = new File(directory, 'database.sqlite');
    const { summary, products } = await usingDatabase(snapshot, async (copy) => {
      // SQLite's backup API includes committed WAL pages. Never copy pos.db
      // directly while its active connection is using WAL.
      await SQLite.backupDatabaseAsync({ sourceDatabase: db, destDatabase: copy });
      await copy.execAsync('PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;');
      const summary = await inspectBackupDatabase(copy); // also detects incomplete native copies
      const products = await copy.getAllAsync<{ id: number; name: string; image_path: string }>("SELECT id, name, image_path FROM products WHERE image_path != '' ORDER BY id");
      return { summary, products };
    });
    assertSameRevision(revision, await databaseRevision(db));
    const createdAt = new Date();
    if (snapshot.size > MAX_BACKUP_BYTES) throw new Error('Database melebihi batas backup 64 MiB.');
    const bytes = await snapshot.bytes();
    const payloads: Record<string, Uint8Array> = { 'database.sqlite': bytes };
    const images: BackupAsset[] = [];
    const productImages: BackupMetadata['productImages'] = [];
    const byUri = new Map<string, string>();
    let size = bytes.length;
    for (const product of products) {
      let entry = byUri.get(product.image_path);
      if (!entry) {
        progress(`Menyalin foto ${images.length + 1}...`);
        const uri = product.image_path.startsWith('/') ? `file://${product.image_path}` : product.image_path;
        if (!uri.startsWith('file://')) throw new Error(`Foto "${product.name}" bukan file lokal. Pilih ulang fotonya sebelum backup.`);
        const image = new File(uri);
        if (!image.exists || image.size <= 0) throw new Error(`Foto "${product.name}" hilang/tidak dapat dibaca. Pilih ulang fotonya sebelum backup.`);
        if (image.size > MAX_IMAGE_BYTES) throw new Error(`Foto "${product.name}" melebihi 20 MiB.`);
        size += image.size;
        if (size > MAX_BACKUP_BYTES) throw new Error('Database dan foto melebihi batas backup 64 MiB.');
        const content = await image.bytes();
        const extension = image.extension.slice(1).toLowerCase();
        entry = `images/${String(images.length + 1).padStart(6, '0')}.${/^(jpe?g|png|webp|gif|heic|heif|bmp)$/.test(extension) ? extension : 'img'}`;
        images.push({ file: entry, size: content.length, sha256: await sha256(content) });
        payloads[entry] = content;
        byUri.set(product.image_path, entry);
      }
      productImages.push({ productId: product.id, file: entry });
    }
    const metadata: BackupMetadata = {
      appId: BACKUP_APP_ID, backupVersion: BACKUP_VERSION,
      appVersion: Constants.expoConfig?.version ?? '1.0.0', createdAt: createdAt.toISOString(),
      storeName: summary.storeName, databaseVersion: DATABASE_VERSION, purpose,
      database: { file: 'database.sqlite', size: bytes.length, sha256: await sha256(bytes) }, images, productImages,
    };
    progress('Mengemas database dan foto...');
    const archive = await encodeBackup(metadata, payloads);
    const backups = new Directory(Paths.document, 'backups');
    backups.create({ intermediates: true, idempotent: true });
    const name = backupName(summary.storeName, createdAt, purpose);
    output = new File(backups, `${name}.partial`);
    output.create();
    output.write(archive);
    // Re-read the saved file, hashes, actual SQLite and image references before
    // considering it complete, especially when it is a pre-restore safety copy.
    const verified = await prepareFile(output.uri, progress);
    disposePreparedBackup(verified);
    output.rename(name);
    complete = true;
    return { ...describe(output), revision };
  } finally {
    if (!complete) removeTemporary(output);
    removeTemporary(directory);
  }
}

export function createBackup(db: SQLiteDatabase, progress: BackupProgress = () => {}): Promise<SavedBackup> {
  return exclusive(() => createBackupFile(db, 'manual', progress));
}

export function restoreBackup(db: SQLiteDatabase, prepared: PreparedBackup, progress: BackupProgress = () => {}): Promise<{ safetyBackup: SavedBackup; summary: BackupSummary }> {
  return exclusive(async () => {
    let imagesDirectory: Directory | undefined;
    let committed = false;
    let safetyBackup: (SavedBackup & { revision: DatabaseRevision }) | undefined;
    try {
      if (prepared.disposed) throw new Error('Preview backup sudah ditutup. Pilih kembali file backup.');
      progress('Memeriksa ulang backup sebelum restore...');
      if (await sha256(await prepared.database.bytes()) !== prepared.metadata.database.sha256) throw new Error('Database sementara berubah/rusak. Pilih kembali backup.');
      for (const image of prepared.images) {
        if (await sha256(await image.file.bytes()) !== image.asset.sha256) throw new Error('Foto backup sementara berubah/rusak. Pilih kembali backup.');
      }
      await usingDatabase(prepared.database, async (stage) => {
        const summary = await inspectBackupDatabase(stage);
        await validateProductImages(stage, prepared.metadata);
        if (summary.storeName !== prepared.metadata.storeName) throw new Error('Metadata tidak cocok dengan database.');
      });
      // A failed safety backup aborts here, before any active POS data changes.
      safetyBackup = await createBackupFile(db, 'pre-restore', progress);
      progress('Menyiapkan foto di perangkat ini...');
      imagesDirectory = new Directory(Paths.document, 'products', `restore-${Crypto.randomUUID()}`);
      imagesDirectory.create({ intermediates: true });
      const paths = new Map<string, string>();
      for (const [index, image] of prepared.images.entries()) {
        const target = new File(imagesDirectory, `image-${index}.${image.file.extension.slice(1)}`);
        image.file.copy(target);
        if (await sha256(await target.bytes()) !== image.asset.sha256) throw new Error('Foto hasil salin tidak lengkap. Restore dibatalkan.');
        paths.set(image.asset.file, target.uri);
      }
      await usingDatabase(prepared.database, async (stage) => {
        await stage.withExclusiveTransactionAsync(async (txn) => {
          for (const image of prepared.metadata.productImages) {
            const result = await txn.runAsync('UPDATE products SET image_path = ? WHERE id = ?', paths.get(image.file)!, image.productId);
            if (result.changes !== 1) throw new Error('Referensi foto produk tidak ditemukan.');
          }
        });
      }); // close staging connection before ATTACH in the active transaction
      progress('Memulihkan data POS...');
      await replaceDatabaseContents(db, prepared.database.uri, async () => {
        assertSameRevision(safetyBackup!.revision, await databaseRevision(db));
      });
      committed = true;
      return { safetyBackup, summary: prepared.summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'File tidak dapat dipulihkan.';
      throw new Error(`Restore dibatalkan. Data POS sebelumnya tetap tersimpan. ${message}${safetyBackup ? ` Backup pengaman: ${safetyBackup.name}` : ''}`);
    } finally {
      if (!committed) removeTemporary(imagesDirectory);
      disposePreparedBackup(prepared);
    }
  });
}
