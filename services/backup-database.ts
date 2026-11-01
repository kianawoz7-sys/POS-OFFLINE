import { DATABASE_VERSION, type SQLiteDatabase } from '@/services/database';
import type { BackupMetadata } from '@/services/backup-format';
import * as SQLite from 'expo-sqlite';

// These are all persistent tables in schema v4. A schema change must explicitly
// update restore compatibility rather than silently losing an unknown table.
const TABLES = {
  settings: ['key:TEXT', 'value:TEXT'],
  products: ['id:INTEGER', 'name:TEXT', 'price:INTEGER', 'image_path:TEXT', 'created_at:TEXT', 'updated_at:TEXT'],
  transactions: ['id:INTEGER', 'invoice_number:TEXT', 'total:INTEGER', 'payment_method:TEXT', 'payment_amount:INTEGER', 'change:INTEGER', 'created_at:TEXT'],
  transaction_items: ['id:INTEGER', 'transaction_id:INTEGER', 'product_id:INTEGER', 'product_name:TEXT', 'product_price:INTEGER', 'quantity:INTEGER', 'subtotal:INTEGER'],
  invoice_sequences: ['invoice_date:TEXT', 'last_number:INTEGER'],
  sqlite_sequence: ['name:', 'seq:'],
} as const;

export interface BackupSummary {
  productCount: number;
  transactionCount: number;
  imageCount: number;
  storeName: string;
}

export function sqliteFilePath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
}

export async function inspectBackupDatabase(db: SQLiteDatabase): Promise<BackupSummary> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version !== DATABASE_VERSION) throw new Error('Versi database SQLite backup tidak cocok.');
  const objects = await db.getAllAsync<{ type: string; name: string; sql: string | null }>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_autoindex_%'");
  if (objects.length !== Object.keys(TABLES).length || objects.some((object) => object.type !== 'table' || !Object.prototype.hasOwnProperty.call(TABLES, object.name) || /\bVIRTUAL\b/i.test(object.sql ?? ''))) throw new Error('Struktur database bukan schema POS Offline yang didukung.');
  for (const [table, expected] of Object.entries(TABLES)) {
    const columns = await db.getAllAsync<{ name: string; type: string; pk: number }>(`PRAGMA table_info(${table})`);
    if (JSON.stringify(columns.map((column) => `${column.name}:${column.type.toUpperCase()}`)) !== JSON.stringify(expected)) throw new Error(`Struktur tabel ${table} tidak cocok.`);
    if (table !== 'sqlite_sequence' && columns[0].pk !== 1) throw new Error(`Primary key tabel ${table} tidak cocok.`);
  }
  const integrity = await db.getAllAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('Database backup rusak atau mempunyai data tidak valid.');
  if ((await db.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Relasi transaksi backup tidak valid.');
  const foreignKeys = await db.getAllAsync<{ table: string; from: string; to: string; on_delete: string }>('PRAGMA foreign_key_list(transaction_items)');
  if (foreignKeys.length !== 1 || foreignKeys[0].table !== 'transactions' || foreignKeys[0].from !== 'transaction_id' || foreignKeys[0].to !== 'id' || foreignKeys[0].on_delete !== 'CASCADE') throw new Error('Struktur relasi transaksi tidak cocok.');
  for (const [table, fields] of [['products', ['price']], ['transactions', ['total', 'payment_amount', 'change']], ['transaction_items', ['product_price', 'subtotal']]] as const) {
    const invalid = await db.getFirstAsync(`SELECT id FROM ${table} WHERE ${fields.map((field) => `(typeof(${field}) != 'integer' OR ${field} < 0 OR ${field} > 9007199254740991)`).join(' OR ')} LIMIT 1`);
    if (invalid) throw new Error('Nominal Rupiah backup tidak valid.');
  }
  if (await db.getFirstAsync("SELECT id FROM transaction_items WHERE typeof(quantity) != 'integer' OR quantity < 1 OR quantity > 9007199254740991 LIMIT 1")) throw new Error('Jumlah produk transaksi tidak valid.');
  if (await db.getFirstAsync('SELECT invoice_number FROM transactions GROUP BY invoice_number HAVING COUNT(*) > 1 LIMIT 1')) throw new Error('Invoice duplikat dalam backup.');
  const invalidSequence = await db.getFirstAsync(`SELECT name FROM sqlite_sequence WHERE name NOT IN ('products','transactions','transaction_items') OR typeof(seq) != 'integer' OR seq < 0 OR seq > 9007199254740991 LIMIT 1`);
  if (invalidSequence || await db.getFirstAsync('SELECT name FROM sqlite_sequence GROUP BY name HAVING COUNT(*) > 1 LIMIT 1')) throw new Error('Urutan ID database tidak valid.');
  for (const table of ['products', 'transactions', 'transaction_items']) {
    const invalid = await db.getFirstAsync(`SELECT id FROM ${table} WHERE typeof(id) != 'integer' OR id < 1 OR id > 9007199254740991 LIMIT 1`);
    if (invalid) throw new Error('ID database tidak valid.');
    const sequence = await db.getFirstAsync(`SELECT 1 FROM sqlite_sequence WHERE name = ? AND seq < (SELECT COALESCE(MAX(id),0) FROM ${table})`, table);
    if (sequence) throw new Error('Urutan ID database lebih kecil dari ID yang tersimpan.');
  }
  const invalidInvoice = await db.getFirstAsync(`SELECT id FROM transactions WHERE date(created_at) IS NULL OR length(invoice_number) = 0 LIMIT 1`);
  if (invalidInvoice) throw new Error('Tanggal/nomor invoice backup tidak valid.');
  const sequenceRows = await db.getAllAsync<{ invoice_date: string; last_number: number }>('SELECT * FROM invoice_sequences');
  const usedInvoices = await db.getAllAsync<{ invoice_number: string; invoice_date: string }>('SELECT invoice_number, date(created_at) AS invoice_date FROM transactions');
  const sequenceMap = new Map(sequenceRows.map((row) => [row.invoice_date, row.last_number]));
  if (sequenceRows.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.invoice_date) || !Number.isSafeInteger(row.last_number) || row.last_number < 1)) throw new Error('Urutan invoice backup tidak valid.');
  for (const invoice of usedInvoices) {
    const number = Number(invoice.invoice_number.match(/^INV-\d{6}-(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(number) || number < 1 || number > (sequenceMap.get(invoice.invoice_date) ?? 0)) throw new Error('Urutan invoice backup tidak sesuai transaksi.');
  }
  const store = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'store_name'");
  if (typeof store?.value !== 'string' || !store.value.trim()) throw new Error('Nama toko dalam database tidak valid.');
  const products = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM products');
  const transactions = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM transactions');
  const images = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM products WHERE image_path != ''");
  return { productCount: products!.count, transactionCount: transactions!.count, imageCount: images!.count, storeName: store.value };
}

export async function validateProductImages(db: SQLiteDatabase, metadata: BackupMetadata): Promise<void> {
  const rows = await db.getAllAsync<{ id: number }>("SELECT id FROM products WHERE image_path != '' ORDER BY id");
  const manifestIds = metadata.productImages.map((image) => image.productId).sort((a, b) => a - b);
  if (JSON.stringify(rows.map((row) => row.id)) !== JSON.stringify(manifestIds)) throw new Error('Daftar foto tidak sesuai produk dalam database.');
}

export async function replaceDatabaseContents(active: SQLiteDatabase, stagedDatabaseUri: string, beforeReplace?: () => Promise<void>): Promise<void> {
  // Expo's exclusive helper starts a deferred BEGIN on another connection.
  // Open our own so foreign keys are enabled before BEGIN, and the write lock
  // is acquired before checking whether the safety snapshot is still current.
  const path = sqliteFilePath(active.databasePath).replace(/\\/g, '/');
  const separator = path.lastIndexOf('/');
  const txn = await SQLite.openDatabaseAsync(path.slice(separator + 1), { useNewConnection: true }, path.slice(0, separator));
  let started = false;
  let committed = false;
  try {
    await txn.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
    started = true;
    await txn.runAsync('ATTACH DATABASE ? AS pos_restore', sqliteFilePath(stagedDatabaseUri));
    // The write lock is now held. A caller can check that its safety snapshot
    // still represents the live device before the first DELETE is performed.
    await beforeReplace?.();
    const version = await txn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (version?.user_version !== DATABASE_VERSION) throw new Error('Database perangkat belum menggunakan versi yang didukung.');
    await txn.execAsync(`
      DELETE FROM transaction_items;
      DELETE FROM transactions;
      DELETE FROM products;
      DELETE FROM settings;
      DELETE FROM invoice_sequences;
      INSERT INTO settings SELECT * FROM pos_restore.settings;
      INSERT INTO products SELECT * FROM pos_restore.products;
      INSERT INTO transactions SELECT * FROM pos_restore.transactions;
      INSERT INTO transaction_items SELECT * FROM pos_restore.transaction_items;
      INSERT INTO invoice_sequences SELECT * FROM pos_restore.invoice_sequences;
      DELETE FROM sqlite_sequence;
      INSERT INTO sqlite_sequence SELECT * FROM pos_restore.sqlite_sequence;
    `);
    if ((await txn.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Relasi database hasil restore tidak valid.');
    await txn.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    await txn.execAsync('COMMIT');
    started = false;
    committed = true;
  } catch (error) {
    if (started) await txn.execAsync('ROLLBACK');
    throw error;
  } finally {
    // Closing also detaches the staging database. The provider stays open.
    try { await txn.closeAsync(); } catch (error) {
      // A committed restore owns its new photos. Do not report a cleanup error
      // as a rollback and cause the caller to remove those referenced files.
      if (!committed) throw error;
      console.warn('cleanup committed restore connection:', error);
    }
  }
}
