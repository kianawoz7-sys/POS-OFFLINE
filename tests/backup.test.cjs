const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, unzipSync, strToU8 } = require('fflate');
const { fixture } = require('./backup-native-mocks.cjs');

async function setup(t) {
  const f = fixture(t);
  const service = f.load('services/backup.ts');
  const format = f.load('services/backup-format.ts');
  const { migrateDbIfNeeded } = f.load('services/database.ts');
  const store = f.load('stores/transactionStore.ts').useTransactionStore;
  const a = f.open(path.join(f.Paths.document.path, 'pos.db'));
  await migrateDbIfNeeded(a);
  await a.runAsync("UPDATE settings SET value = 'Mba Nell' WHERE key = 'store_name'");
  await a.runAsync("UPDATE settings SET value = 'Rumah Makan' WHERE key = 'business_type'");
  await a.runAsync("INSERT INTO settings VALUES ('receipt_footer', 'Terima kasih')");
  const photos = new f.Directory(f.Paths.document, 'products');
  photos.create();
  const photo = new f.File(photos, 'ayam.png');
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6z0AAAAASUVORK5CYII=', 'base64');
  photo.create(); photo.write(imageBytes);
  await a.runAsync('INSERT INTO products(id,name,price,image_path) VALUES (7,?,?,?)', 'Ayam Geprek', 13000, photo.uri);
  await a.runAsync('INSERT INTO products(id,name,price,image_path) VALUES (8,?,?,?)', 'Ayam Goreng', 15000, photo.uri);
  await a.runAsync("INSERT INTO products(id,name,price) VALUES (9,'Es Teh',3000)");
  store.setState({ cart: [], transactions: [], isCheckingOut: false });
  for (const method of ['tunai', 'qris']) {
    store.getState().addToCart({ id: 7, name: 'Ayam Geprek', price: 13000 });
    await store.getState().checkout(a, method, 20000);
  }
  await a.runAsync("UPDATE sqlite_sequence SET seq = 99 WHERE name = 'transactions'");
  async function deviceB(populated = true) {
    f.useDevice('B');
    const b = f.open(path.join(f.Paths.document.path, 'pos.db'));
    await migrateDbIfNeeded(b);
    if (populated) {
      await b.runAsync("UPDATE settings SET value = 'Gerai B' WHERE key = 'store_name'");
      await b.runAsync("INSERT INTO products(id,name,price) VALUES (1,'Kopi B',5000)");
      store.setState({ cart: [], transactions: [], isCheckingOut: false });
      store.getState().addToCart({ id: 1, name: 'Kopi B', price: 5000 });
      await store.getState().checkout(b, 'tunai', 10000);
    }
    return b;
  }
  async function exportA() { f.useDevice('A'); return service.createBackup(a); }
  return { ...f, service, format, a, store, deviceB, exportA, photo, imageBytes };
}

async function rows(db) {
  const result = {};
  for (const table of ['settings', 'products', 'transactions', 'transaction_items', 'invoice_sequences', 'sqlite_sequence']) result[table] = await db.getAllAsync(`SELECT * FROM ${table} ORDER BY 1`);
  return result;
}

async function rewritten(f, backup, edit) {
  const files = unzipSync(await new f.File(backup.uri).bytes());
  const metadata = JSON.parse(Buffer.from(files['manifest.json']).toString());
  await edit(metadata, files);
  files['manifest.json'] = strToU8(JSON.stringify(metadata));
  files['manifest.sha256'] = strToU8(await f.format.sha256(files['manifest.json']));
  const file = new f.File(f.Paths.cache, `changed-${Date.now()}.posbackup`);
  file.create(); file.write(zipSync(files));
  return file;
}

test('deleting one local backup preserves other backups, database rows and product photos', async (t) => {
  const f = await setup(t);
  const first = await f.exportA();
  const second = await f.exportA();
  const before = await rows(f.a);
  const otherBytes = await new f.File(second.uri).bytes();
  await f.service.deleteSavedBackup(first);
  assert.equal(new f.File(first.uri).exists, false);
  assert.deepEqual(f.service.listSavedBackups().map((file) => file.uri), [second.uri]);
  assert.deepEqual(await new f.File(second.uri).bytes(), otherBytes);
  assert.deepEqual(await rows(f.a), before);
  assert.equal(f.photo.exists, true);
});

test('delete refuses the backup folder, directories, nested/outside files and mismatched names', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const backups = new f.Directory(f.Paths.document, 'backups');
  const nested = new f.Directory(backups, 'folder.posbackup'); nested.create();
  const child = new f.File(nested, 'child.posbackup'); child.create(); child.write(Buffer.from('keep nested'));
  const outside = new f.File(f.Paths.cache, backup.name); outside.create(); outside.write(Buffer.from('keep outside'));
  const ordinary = new f.File(backups, 'notes.txt'); ordinary.create(); ordinary.write(Buffer.from('keep text'));
  for (const target of [backups, nested, child, outside, ordinary]) {
    await assert.rejects(f.service.deleteSavedBackup({ ...backup, uri: target.uri, name: path.basename(target.path) }), /tidak ditemukan/);
    assert.equal(target.exists, true);
  }
  await assert.rejects(f.service.deleteSavedBackup({ ...backup, name: 'another.posbackup' }), /tidak ditemukan/);
  assert.equal(new f.File(backup.uri).exists, true);
});

test('failed delete preserves the file and local list, then retry can succeed', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const before = f.service.listSavedBackups();
  f.faults.backupDelete = true;
  await assert.rejects(f.service.deleteSavedBackup(backup), /delete failure/);
  assert.deepEqual(f.service.listSavedBackups(), before);
  assert.equal(new f.File(backup.uri).exists, true);
  f.faults.backupDelete = false;
  await f.service.deleteSavedBackup(backup);
  assert.deepEqual(f.service.listSavedBackups(), []);
});

test('A/E/F: clone fresh device, portable photos, persisted rows and new checkout with correct IDs/invoices', async (t) => {
  const f = await setup(t);
  const original = await rows(f.a);
  const backup = await f.exportA();
  const archive = await f.format.decodeBackup(await new f.File(backup.uri).bytes());
  assert.equal(archive.metadata.backupVersion, 1);
  assert.equal(archive.metadata.appId, 'com.rumahmakan.posoffline');
  assert.equal(archive.metadata.images.length, 1); // deduplicated shared source photo
  assert.equal(archive.metadata.productImages.length, 2);
  const b = await f.deviceB(false);
  const preview = await f.service.prepareBackup(backup.uri);
  assert.deepEqual(preview.summary, { productCount: 3, transactionCount: 2, imageCount: 2, storeName: 'Mba Nell' });
  const result = await f.service.restoreBackup(b, preview);
  assert.ok(new f.File(result.safetyBackup.uri).exists);
  const cloned = await rows(b);
  for (const table of Object.keys(original)) {
    if (table !== 'products') assert.deepEqual(cloned[table], original[table], table);
  }
  for (let i = 0; i < cloned.products.length; i++) {
    const { image_path: oldPath, ...old } = original.products[i];
    const { image_path: newPath, ...restored } = cloned.products[i];
    assert.deepEqual(restored, old);
    if (oldPath) {
      assert.notEqual(newPath, oldPath);
      assert.ok(newPath.includes('/B/document/products/restore-'));
      assert.deepEqual(Buffer.from(await new f.File(newPath).bytes()), f.imageBytes);
    } else assert.equal(newPath, '');
  }
  f.store.setState({ cart: [], transactions: [], isCheckingOut: false });
  f.store.getState().addToCart({ id: 7, name: 'Ayam Geprek', price: 13000 });
  const sale = await f.store.getState().checkout(b, 'tunai', 20000);
  assert.equal(sale.id, 100);
  assert.match(sale.invoice_number, /-003$/);
  assert.deepEqual(await b.getAllAsync('PRAGMA foreign_key_check'), []);
  assert.equal((await b.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
});

test('replace, not merge; safety backup can roll B back to its original state', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  const before = await rows(b);
  const result = await f.service.restoreBackup(b, await f.service.prepareBackup(backup.uri));
  assert.equal((await rows(b)).transactions.length, 2);
  assert.equal((await b.getFirstAsync('SELECT COUNT(*) AS count FROM products WHERE id=1')).count, 0);
  const safety = await f.service.prepareBackup(result.safetyBackup.uri);
  assert.equal(safety.metadata.purpose, 'pre-restore');
  assert.equal(safety.summary.storeName, 'Gerai B');
  await f.service.restoreBackup(b, safety);
  assert.deepEqual(await rows(b), before);
  assert.equal(f.service.listSavedBackups().filter((file) => file.name.includes('_sebelum_restore_')).length, 2);
});

test('C: preview and cancel never alter active data or create safety backups; staged handles/files close', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  const before = await rows(b);
  const candidate = await f.service.prepareBackup(backup.uri);
  const directory = candidate.directory.path;
  f.service.disposePreparedBackup(candidate);
  f.service.disposePreparedBackup(candidate);
  assert.deepEqual(await rows(b), before);
  assert.equal(fs.existsSync(directory), false);
  assert.equal(f.service.listSavedBackups().length, 0);
  assert.equal(f.connections.size, 2);
});

test('D: close/reopen after restore preserves data, invoice state and image paths', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  await f.service.restoreBackup(b, await f.service.prepareBackup(backup.uri));
  const restored = await rows(b);
  const filename = b.databasePath;
  b.close();
  const reopened = f.open(filename);
  await f.load('services/database.ts').migrateDbIfNeeded(reopened);
  assert.deepEqual(await rows(reopened), restored);
  assert.equal(new f.File(restored.products[0].image_path).exists, true);
});

test('B: random/truncated/corrupted files rejected with B completely unchanged', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const good = await new f.File(backup.uri).bytes();
  const b = await f.deviceB();
  const before = await rows(b);
  const changed = unzipSync(good);
  changed['database.sqlite'][200] ^= 1;
  for (const [index, data] of [Buffer.from('not a POS backup'), good.subarray(0, good.length / 2), zipSync(changed)].entries()) {
    const file = new f.File(f.Paths.cache, `broken-${index}.posbackup`); file.create(); file.write(data);
    await assert.rejects(f.service.prepareBackup(file.uri));
    assert.deepEqual(await rows(b), before);
  }
  assert.equal(f.service.listSavedBackups().length, 0);
});

for (const [label, change] of [
  ['wrong app', (m) => { m.appId = 'other.app'; }],
  ['unknown format', (m) => { m.backupVersion = 2; }],
  ['newer database', (m) => { m.databaseVersion = 5; }],
  ['wrong store', (m) => { m.storeName = 'Fake Store'; }],
  ['invalid date', (m) => { m.createdAt = '2026-99-99'; }],
  ['missing image mapping', (m) => { m.productImages.pop(); }],
]) {
  test(`B: ${label} rejected before changes`, async (t) => {
    const f = await setup(t);
    const backup = await f.exportA();
    const b = await f.deviceB();
    const before = await rows(b);
    const file = await rewritten(f, backup, change);
    await assert.rejects(f.service.prepareBackup(file.uri));
    assert.deepEqual(await rows(b), before);
  });
}

test('bad SQLite with matching checksum, orphan foreign keys, and unexpected schema rejected', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  const before = await rows(b);
  for (const query of ["PRAGMA foreign_keys=OFF; UPDATE transaction_items SET transaction_id=777", 'PRAGMA user_version=3', 'CREATE TABLE extra(value TEXT)']) {
    const candidate = await f.service.prepareBackup(backup.uri);
    const db = f.open(candidate.database.path); db.sql.exec(query); db.close();
    const file = await rewritten(f, backup, async (m, files) => {
      files['database.sqlite'] = await candidate.database.bytes();
      m.database.size = files['database.sqlite'].length;
      m.database.sha256 = await f.format.sha256(files['database.sqlite']);
    });
    f.service.disposePreparedBackup(candidate);
    await assert.rejects(f.service.prepareBackup(file.uri));
    assert.deepEqual(await rows(b), before);
  }
});

test('failure halfway through replace rolls back every table; verified safety file remains', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  const before = await rows(b);
  const candidate = await f.service.prepareBackup(backup.uri);
  f.faults.replace = true;
  await assert.rejects(f.service.restoreBackup(b, candidate), /Data POS sebelumnya tetap tersimpan/);
  f.faults.replace = false;
  assert.deepEqual(await rows(b), before);
  const files = f.service.listSavedBackups();
  assert.equal(files.length, 1);
  const safety = await f.service.prepareBackup(files[0].uri);
  assert.equal(safety.summary.storeName, 'Gerai B');
  f.service.disposePreparedBackup(safety);
  assert.equal(fs.existsSync(candidate.directory.path), false);
});

test('image copy failure and failed automatic backup leave B intact', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  const before = await rows(b);
  f.faults.imageCopy = true;
  await assert.rejects(f.service.restoreBackup(b, await f.service.prepareBackup(backup.uri)), /disk full/);
  assert.deepEqual(await rows(b), before);
  f.faults.imageCopy = false;
  await b.runAsync('UPDATE products SET image_path = ? WHERE id=1', new f.File(f.Paths.document, 'missing-photo.png').uri);
  const badPhotoState = await rows(b);
  await assert.rejects(f.service.restoreBackup(b, await f.service.prepareBackup(backup.uri)), /Foto.*hilang/);
  assert.deepEqual(await rows(b), badPhotoState);
});

test('missing or corrupted image payload and traversal entries are rejected', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const decoded = await f.format.decodeBackup(await new f.File(backup.uri).bytes());
  const image = decoded.metadata.images[0].file;
  for (const edit of [
    (files) => { delete files[image]; },
    (files) => { files[image][0] ^= 1; },
    (files) => { files['../../outside.jpg'] = new Uint8Array([1]); },
  ]) {
    const files = unzipSync(await new f.File(backup.uri).bytes()); edit(files);
    await assert.rejects(f.format.decodeBackup(zipSync(files)));
  }
});

test('preview staging tampering detected before safety backup or replacement', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  const before = await rows(b);
  const candidate = await f.service.prepareBackup(backup.uri);
  candidate.images[0].file.write(Buffer.from('corrupt image'));
  await assert.rejects(f.service.restoreBackup(b, candidate), /Foto.*berubah/);
  assert.deepEqual(await rows(b), before);
  assert.equal(f.service.listSavedBackups().length, 0);
});

test('double backup/restore action is blocked synchronously', async (t) => {
  const f = await setup(t);
  const first = f.service.createBackup(f.a);
  await assert.rejects(f.service.createBackup(f.a), /masih berjalan/);
  await first;
  assert.equal(f.service.listSavedBackups().length, 1);
});

test('oversized archive and inflated entries rejected before allocation/extraction', async (t) => {
  const f = await setup(t);
  await assert.rejects(f.format.decodeBackup(new Uint8Array(f.format.MAX_BACKUP_BYTES + 1)), /ukuran/);
  const forged = zipSync({ 'database.sqlite': new Uint8Array([1]) });
  const offset = Buffer.from(forged).indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  new DataView(forged.buffer).setUint32(offset + 24, f.format.MAX_BACKUP_BYTES + 1, true);
  await assert.rejects(f.format.decodeBackup(forged), /ukuran/);
});

test('an in-flight write during the safety snapshot aborts restore and preserves the newly saved data', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  f.faults.afterSnapshot = async (source) => {
    if (source === b) await b.runAsync("UPDATE products SET name = 'Baru tersimpan' WHERE id=1");
  };
  await assert.rejects(f.service.restoreBackup(b, await f.service.prepareBackup(backup.uri)), /Data POS berubah/);
  assert.equal((await b.getFirstAsync('SELECT name FROM products WHERE id=1')).name, 'Baru tersimpan');
  assert.equal((await b.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 1);
});

test('an in-flight write after safety creation is detected inside the write lock before replacing data', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  await assert.rejects(f.service.restoreBackup(b, await f.service.prepareBackup(backup.uri), (message) => {
    if (message === 'Memulihkan data POS...') b.sql.exec("UPDATE products SET name = 'Baru tersimpan' WHERE id=1");
  }), /Data POS berubah/);
  assert.equal((await b.getFirstAsync('SELECT name FROM products WHERE id=1')).name, 'Baru tersimpan');
  assert.equal((await b.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 1);
  assert.equal(f.service.listSavedBackups().length, 1);
});

test('restore holds a write lock and enables foreign keys on its separate connection before replacement', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  const candidate = await f.service.prepareBackup(backup.uri);
  const contender = f.open(b.databasePath);
  contender.sql.exec('PRAGMA busy_timeout = 0');
  const { replaceDatabaseContents } = f.load('services/backup-database.ts');
  await replaceDatabaseContents(b, candidate.database.uri, async () => {
    assert.throws(() => contender.sql.exec("UPDATE products SET name='Concurrent write' WHERE id=1"), /locked/);
    const restoreConnection = [...f.connections].find((connection) => connection !== b && connection !== contender && connection.databasePath === b.databasePath);
    assert.equal((await restoreConnection.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
  });
  assert.equal((await b.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 2);
  contender.close();
  f.service.disposePreparedBackup(candidate);
});

test('a connection cleanup error after commit does not remove restored photos or report a failed restore', async (t) => {
  const f = await setup(t);
  const backup = await f.exportA();
  const b = await f.deviceB();
  f.faults.closeAfterRestore = true;
  const result = await f.service.restoreBackup(b, await f.service.prepareBackup(backup.uri));
  assert.equal(result.summary.transactionCount, 2);
  const products = await b.getAllAsync('SELECT image_path FROM products WHERE image_path != ? ', '');
  for (const product of products) assert.equal(new f.File(product.image_path).exists, true);
});
