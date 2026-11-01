import type { SQLiteDatabase as ExpoSQLiteDatabase } from 'expo-sqlite';

export type SQLiteDatabase = ExpoSQLiteDatabase;
export const DATABASE_VERSION = 4;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Connection settings must also run when an already migrated DB is reopened.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentDbVersion = versionRow?.user_version ?? 0;
  if (currentDbVersion > DATABASE_VERSION) {
    throw new Error('Database dibuat oleh versi aplikasi yang lebih baru. Gunakan versi aplikasi tersebut.');
  }
  if (currentDbVersion === DATABASE_VERSION) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    // The former v1 -> v2 DROP is intentionally replaced by a preserving copy.
    await txn.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings VALUES ('store_name', 'POS Offline');
      INSERT OR IGNORE INTO settings VALUES ('business_type', 'Toko');
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL,
        image_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'tunai', payment_amount REAL NOT NULL,
        change REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL, product_name TEXT NOT NULL, product_price REAL NOT NULL,
        quantity INTEGER NOT NULL, subtotal REAL NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
      );
    `);

    const columns = await txn.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
    if (!columns.some((column) => column.name === 'image_path')) {
      await txn.execAsync("ALTER TABLE products ADD COLUMN image_path TEXT NOT NULL DEFAULT ''");
    }

    // Do not guess or round historical monetary values. A failed migration rolls
    // back, including its version, so the original data remains available.
    for (const [table, fields] of [
      ['products', ['price']],
      ['transactions', ['total', 'payment_amount', 'change']],
      ['transaction_items', ['product_price', 'subtotal']],
    ] as const) {
      const invalid = await txn.getFirstAsync<{ id: number }>(
        `SELECT id FROM ${table} WHERE ${fields.map((field) =>
          `(typeof(${field}) NOT IN ('integer','real') OR ${field} < 0 OR ${field} > 9007199254740991 OR ${field} != CAST(${field} AS INTEGER))`
        ).join(' OR ')} LIMIT 1`
      );
      if (invalid) {
        throw new Error(`Data lama ${table} #${invalid.id} memiliki nominal Rupiah tidak valid. Migrasi dibatalkan tanpa mengubah data.`);
      }
    }
    const invalidDate = await txn.getFirstAsync<{ id: number }>(
      'SELECT id FROM transactions WHERE date(created_at) IS NULL LIMIT 1'
    );
    if (invalidDate) throw new Error(`Tanggal transaksi #${invalidDate.id} tidak valid. Data lama tetap disimpan.`);

    const sequences = await txn.getAllAsync<{ name: string; seq: number }>(
      "SELECT name, seq FROM sqlite_sequence WHERE name IN ('products','transactions','transaction_items')"
    );
    await txn.execAsync(`
      CREATE TABLE products_v4 (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        price INTEGER NOT NULL CHECK(typeof(price) = 'integer' AND price BETWEEN 0 AND 9007199254740991),
        image_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE transactions_v4 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE CHECK(length(invoice_number) > 0),
        total INTEGER NOT NULL CHECK(typeof(total) = 'integer' AND total BETWEEN 0 AND 9007199254740991),
        payment_method TEXT NOT NULL DEFAULT 'tunai',
        payment_amount INTEGER NOT NULL CHECK(typeof(payment_amount) = 'integer' AND payment_amount BETWEEN 0 AND 9007199254740991),
        change INTEGER NOT NULL DEFAULT 0 CHECK(typeof(change) = 'integer' AND change BETWEEN 0 AND 9007199254740991),
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE transaction_items_v4 (
        id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL, product_name TEXT NOT NULL,
        product_price INTEGER NOT NULL CHECK(typeof(product_price) = 'integer' AND product_price BETWEEN 0 AND 9007199254740991),
        quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 9007199254740991),
        subtotal INTEGER NOT NULL CHECK(typeof(subtotal) = 'integer' AND subtotal BETWEEN 0 AND 9007199254740991),
        FOREIGN KEY (transaction_id) REFERENCES transactions_v4(id) ON DELETE CASCADE
      );
      INSERT INTO products_v4 SELECT id, name, price, image_path, created_at, updated_at FROM products;
      WITH numbered AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date(created_at) ORDER BY id) AS daily_seq FROM transactions
      )
      INSERT INTO transactions_v4
        SELECT id,
          'INV-' || strftime('%d%m', created_at) || substr(strftime('%Y', created_at),3,2) || '-' || printf('%03d', daily_seq),
          total, payment_method, payment_amount, change, created_at FROM numbered;
      INSERT INTO transaction_items_v4
        SELECT id, transaction_id, product_id, product_name, product_price, quantity, subtotal FROM transaction_items;
      DROP TABLE transaction_items;
      DROP TABLE transactions;
      DROP TABLE products;
      ALTER TABLE products_v4 RENAME TO products;
      ALTER TABLE transactions_v4 RENAME TO transactions;
      ALTER TABLE transaction_items_v4 RENAME TO transaction_items;
      CREATE TABLE invoice_sequences (
        invoice_date TEXT PRIMARY KEY,
        last_number INTEGER NOT NULL CHECK(typeof(last_number) = 'integer' AND last_number > 0)
      );
      INSERT INTO invoice_sequences SELECT date(created_at), COUNT(*) FROM transactions GROUP BY date(created_at);
    `);
    // Preserve AUTOINCREMENT high-water marks even if the last row was deleted.
    for (const sequence of sequences) {
      await txn.runAsync(
        'INSERT INTO sqlite_sequence (name, seq) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = ?)',
        sequence.name, sequence.seq, sequence.name
      );
      await txn.runAsync('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?', sequence.seq, sequence.name);
    }
    const foreignKeyErrors = await txn.getAllAsync('PRAGMA foreign_key_check');
    if (foreignKeyErrors.length > 0) throw new Error('Relasi transaksi lama tidak valid. Migrasi dibatalkan tanpa mengubah data.');
    await txn.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}
