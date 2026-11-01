const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { DatabaseSync, backup } = require('node:sqlite');
const { createLoader } = require('./helpers.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'posbackup-tests-'));
  const faults = { imageCopy: false, replace: false, closeAfterRestore: false, backupDelete: false, afterSnapshot: null };
  const connections = new Set();
  const absolute = (value) => value?.path ?? (String(value).startsWith('file://') ? fileURLToPath(value) : String(value));
  class Directory {
    constructor(...values) { this.path = path.resolve(...values.map(absolute)); }
    get uri() { return pathToFileURL(this.path).href; }
    get exists() { return fs.existsSync(this.path); }
    create({ intermediates = false, idempotent = false } = {}) {
      if (this.exists && idempotent) return;
      fs.mkdirSync(this.path, { recursive: intermediates });
    }
    list() { return fs.readdirSync(this.path, { withFileTypes: true }).map((item) => item.isDirectory() ? new Directory(this, item.name) : new File(this, item.name)); }
    delete() {
      if (!this.path.startsWith(root + path.sep)) throw new Error('Cleanup escaped test fixture');
      fs.rmSync(this.path, { recursive: true });
    }
  }
  class File {
    constructor(...values) { this.path = path.resolve(...values.map(absolute)); }
    get uri() { return pathToFileURL(this.path).href; }
    get name() { return path.basename(this.path); }
    get extension() { return path.extname(this.path); }
    get parentDirectory() { return new Directory(path.dirname(this.path)); }
    get exists() { return fs.existsSync(this.path); }
    get size() { return this.exists ? fs.statSync(this.path).size : 0; }
    get modificationTime() { return fs.statSync(this.path).mtimeMs; }
    create() { fs.closeSync(fs.openSync(this.path, 'wx')); }
    write(bytes) { fs.writeFileSync(this.path, bytes); }
    bytes() { return fs.promises.readFile(this.path); }
    copy(target) {
      if (faults.imageCopy && target.uri.includes('/restore-')) throw new Error('Simulated disk full copying image');
      fs.copyFileSync(this.path, target.path);
    }
    rename(name) { const target = path.join(path.dirname(this.path), name); fs.renameSync(this.path, target); this.path = target; }
    delete() {
      if (faults.backupDelete && this.name.endsWith('.posbackup')) throw new Error('Simulated backup delete failure');
      fs.unlinkSync(this.path);
    }
  }
  const Paths = {};
  function useDevice(name) {
    Paths.document = new Directory(root, name, 'document');
    Paths.cache = new Directory(root, name, 'cache');
    Paths.document.create({ intermediates: true, idempotent: true });
    Paths.cache.create({ intermediates: true, idempotent: true });
  }
  function open(filename) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const sql = new DatabaseSync(filename);
    sql.exec('PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 5000;');
    const db = {
      sql, databasePath: filename,
      async execAsync(query) {
        if (faults.replace && query.includes('DELETE FROM transaction_items;')) {
          sql.exec('DELETE FROM transaction_items; DELETE FROM transactions;');
          throw new Error('Simulated failure halfway through replacement');
        }
        sql.exec(query);
        if (query.includes('INSERT INTO settings SELECT * FROM pos_restore.settings')) db.restored = true;
      },
      async runAsync(query, ...params) { const result = sql.prepare(query).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; },
      async getFirstAsync(query, ...params) { return sql.prepare(query).get(...params) ?? null; },
      async getAllAsync(query, ...params) { return sql.prepare(query).all(...params); },
      async withExclusiveTransactionAsync(task) {
        const txn = open(filename);
        txn.sql.exec('BEGIN');
        try { await task(txn); txn.sql.exec('COMMIT'); } catch (error) { txn.sql.exec('ROLLBACK'); throw error; } finally { txn.close(); }
      },
      async closeAsync() {
        db.close();
        if (db.restored && faults.closeAfterRestore) throw new Error('Simulated connection close failure after commit');
      },
      close() { if (connections.delete(db)) sql.close(); },
    };
    connections.add(db);
    return db;
  }
  const SQLite = {
    async openDatabaseAsync(name, options, directory) { return open(path.join(absolute(directory), name)); },
    async backupDatabaseAsync({ sourceDatabase, destDatabase }) {
      await backup(sourceDatabase.sql, destDatabase.databasePath);
      await faults.afterSnapshot?.(sourceDatabase);
    },
  };
  const load = createLoader({
    'expo-file-system': { Directory, File, Paths },
    'expo-sqlite': SQLite,
    'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.0.0' } } },
    'expo-crypto': {
      randomUUID: crypto.randomUUID,
      CryptoDigestAlgorithm: { SHA256: 'sha256' },
      async digest(algorithm, bytes) { const data = crypto.createHash(algorithm).update(bytes).digest(); return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); },
    },
  });
  useDevice('A');
  t.after(() => {
    for (const db of [...connections]) db.close();
    if (!root.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Invalid test cleanup root');
    fs.rmSync(root, { recursive: true });
  });
  return { root, Paths, File, Directory, useDevice, open, load, faults, connections };
}
module.exports = { fixture };
