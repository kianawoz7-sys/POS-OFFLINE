const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// Execute production TS with the existing TypeScript dependency. Only native
// printer calls are mocked; migration/checkout SQL runs on real SQLite.
function createLoader(mocks = {}) {
  const cache = new Map();
  function load(relativePath) {
    const filename = path.resolve(root, relativePath);
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, mod);
    const originalRequire = mod.require.bind(mod);
    mod.require = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
      return originalRequire(id);
    };
    mod._compile(compiled.outputText, filename);
    return mod.exports;
  }
  return load;
}

function openDb(filename = ':memory:') {
  const sql = new DatabaseSync(filename);
  const db = {
    sql,
    async execAsync(query) { sql.exec(query); },
    async runAsync(query, ...params) {
      const result = sql.prepare(query).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getFirstAsync(query, ...params) { return sql.prepare(query).get(...params) ?? null; },
    async getAllAsync(query, ...params) { return sql.prepare(query).all(...params); },
    async withExclusiveTransactionAsync(task) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        await task(db);
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
    close() { sql.close(); },
  };
  return db;
}

function seedLegacy(db, version, { imageColumn = true } = {}) {
  db.sql.exec(`
    PRAGMA foreign_keys = OFF;
    PRAGMA user_version = ${version};
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO settings VALUES ('store_name','Gerai Lama'), ('business_type','Rumah Makan');
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL,
      ${imageColumn ? "image_path TEXT NOT NULL DEFAULT ''," : ''}
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL NOT NULL,
      payment_method TEXT NOT NULL, payment_amount REAL NOT NULL, change REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL, product_name TEXT NOT NULL, product_price REAL NOT NULL,
      quantity INTEGER NOT NULL, subtotal REAL NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );
    INSERT INTO products (id,name,price,${imageColumn ? 'image_path,' : ''}created_at,updated_at)
      VALUES (7,'Ayam Geprek',13000,${imageColumn ? "'file:///ayam.jpg'," : ''}'2026-09-01 09:00:00','2026-09-02 10:00:00');
    INSERT INTO transactions VALUES
      (12,13000,'tunai',20000,7000,'2026-09-01 11:00:00'),
      (13,13000,'qris',13000,0,'2026-09-01 12:00:00'),
      (14,26000,'tunai',30000,4000,'2026-09-02 11:00:00');
    INSERT INTO transaction_items VALUES
      (21,12,7,'Ayam Geprek',13000,1,13000),
      (22,13,7,'Ayam Geprek',13000,1,13000),
      (23,14,7,'Ayam Geprek',13000,2,26000);
    UPDATE sqlite_sequence SET seq = 99 WHERE name = 'transactions';
  `);
}

module.exports = { createLoader, openDb, seedLegacy };
