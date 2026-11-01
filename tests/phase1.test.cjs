const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLoader, openDb, seedLegacy } = require('./helpers.cjs');

const load = createLoader();
const { migrateDbIfNeeded, DATABASE_VERSION } = load('services/database.ts');
const { parseRupiahInput, assertRupiah } = load('utils/money.ts');
const { useTransactionStore: store } = load('stores/transactionStore.ts');
const { useProductStore: products } = load('stores/productStore.ts');

function resetStore() {
  store.setState({ cart: [], transactions: [], isCheckingOut: false, loading: false, hasMore: true });
}
function addChicken() { store.getState().addToCart({ id: 7, name: 'Ayam Geprek', price: 13000 }); }
async function freshDb(t) {
  const db = openDb();
  t.after(() => db.close());
  await migrateDbIfNeeded(db);
  resetStore();
  return db;
}

test('Rupiah accepts digits and valid thousands separators, rejects fractions/unsafe input', () => {
  for (const value of ['13000', '13.000', ' 13.000 ', '013000']) assert.equal(parseRupiahInput(value), 13000);
  assert.equal(parseRupiahInput('0'), 0);
  for (const value of ['', '13.00', '13.5', '13,5', '-13000', '1e4', 'Rp 13000', 'NaN', '9007199254740992']) {
    assert.equal(parseRupiahInput(value), null, value);
  }
  for (const value of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertRupiah(value));
});

for (const version of [0, 1, 2, 3]) {
  test(`legacy v${version} preserves products, snapshots, dates, settings and IDs`, async (t) => {
    const db = openDb();
    t.after(() => db.close());
    seedLegacy(db, version);
    const oldItems = await db.getAllAsync('SELECT * FROM transaction_items ORDER BY id');
    const oldProduct = await db.getFirstAsync('SELECT * FROM products');
    const oldTransactions = await db.getAllAsync('SELECT * FROM transactions ORDER BY id');
    await migrateDbIfNeeded(db);
    assert.deepEqual(await db.getFirstAsync('SELECT * FROM products'), oldProduct);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM transaction_items ORDER BY id'), oldItems);
    const upgraded = await db.getAllAsync('SELECT * FROM transactions ORDER BY id');
    for (let i = 0; i < upgraded.length; i++) {
      const { invoice_number, ...rest } = upgraded[i];
      assert.deepEqual(rest, { ...oldTransactions[i] });
      assert.equal(invoice_number, ['INV-010926-001', 'INV-010926-002', 'INV-020926-001'][i]);
    }
    assert.equal((await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', 'store_name')).value, 'Gerai Lama');
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, DATABASE_VERSION);
    assert.equal((await db.getFirstAsync('SELECT typeof(price) AS type FROM products')).type, 'integer');
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
    resetStore();
    addChicken();
    const saved = await store.getState().checkout(db, 'tunai', 20000);
    assert.equal(saved.id, 100);
    await migrateDbIfNeeded(db);
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM products')).count, 1);
  });
}

test('legacy v1 without image_path is extended without losing the product', async (t) => {
  const db = openDb();
  t.after(() => db.close());
  seedLegacy(db, 1, { imageColumn: false });
  await migrateDbIfNeeded(db);
  const product = await db.getFirstAsync('SELECT * FROM products');
  assert.equal(product.id, 7);
  assert.equal(product.price, 13000);
  assert.equal(product.image_path, '');
});

test('empty legacy table keeps its deleted AUTOINCREMENT high-water mark', async (t) => {
  const db = openDb();
  t.after(() => db.close());
  seedLegacy(db, 1);
  db.sql.exec('DELETE FROM products');
  await migrateDbIfNeeded(db);
  const result = await db.runAsync('INSERT INTO products (name,price) VALUES (?,?)', 'Baru', 5000);
  assert.equal(result.lastInsertRowId, 8);
});

test('fractional legacy money aborts upgrade without rounding or changing schema/data', async (t) => {
  const db = openDb();
  t.after(() => db.close());
  seedLegacy(db, 1);
  db.sql.exec('UPDATE products SET price = 13.5');
  await assert.rejects(migrateDbIfNeeded(db), /Rupiah tidak valid/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 1);
  assert.equal((await db.getFirstAsync('SELECT price FROM products')).price, 13.5);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 3);
  assert.equal((await db.getAllAsync('PRAGMA table_info(transactions)')).some((c) => c.name === 'invoice_number'), false);
});

test('migration rolls back all tables on a late copy failure', async (t) => {
  const db = openDb();
  t.after(() => db.close());
  seedLegacy(db, 3);
  db.sql.exec('UPDATE transaction_items SET quantity = 0 WHERE id = 23');
  await assert.rejects(migrateDbIfNeeded(db), /CHECK constraint/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 3);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM products')).count, 1);
  assert.equal((await db.getFirstAsync('SELECT quantity FROM transaction_items WHERE id = 23')).quantity, 0);
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE '%_v4'")).count, 0);
});

test('orphaned legacy items cannot be silently discarded', async (t) => {
  const db = openDb();
  t.after(() => db.close());
  seedLegacy(db, 3);
  db.sql.exec('UPDATE transaction_items SET transaction_id = 999 WHERE id = 23');
  await assert.rejects(migrateDbIfNeeded(db));
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 3);
  assert.equal((await db.getFirstAsync('SELECT transaction_id FROM transaction_items WHERE id = 23')).transaction_id, 999);
});

test('newer database versions are not downgraded', async (t) => {
  const db = openDb();
  t.after(() => db.close());
  db.sql.exec('PRAGMA user_version = 99');
  await assert.rejects(migrateDbIfNeeded(db), /lebih baru/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 99);
});

test('cash checkout persists the receipt, line items, whole money and original timestamp', async (t) => {
  const db = await freshDb(t);
  addChicken();
  const saved = await store.getState().checkout(db, 'tunai', 20000);
  const record = await db.getFirstAsync('SELECT * FROM transactions');
  assert.equal(record.invoice_number, saved.invoice_number);
  assert.equal(record.created_at, saved.created_at);
  assert.equal(record.total, 13000);
  assert.equal(record.change, 7000);
  assert.equal((await db.getFirstAsync('SELECT typeof(total) AS type FROM transactions')).type, 'integer');
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM transaction_items')).count, 1);
  assert.equal(store.getState().cart.length, 0);
  assert.equal(store.getState().isCheckingOut, false);
});

test('simultaneous double tap saves only one sale and locks cart edits', async (t) => {
  const db = await freshDb(t);
  addChicken();
  const first = store.getState().checkout(db, 'tunai', 20000);
  assert.equal(store.getState().isCheckingOut, true);
  store.getState().clearCart();
  store.getState().updateQuantity(7, 5);
  store.getState().addToCart({ id: 8, name: 'Nasi', price: 3000 });
  const second = store.getState().checkout(db, 'tunai', 20000);
  const results = await Promise.all([first, second]);
  assert.equal(results[1], null);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 1);
  assert.equal((await db.getFirstAsync('SELECT quantity FROM transaction_items')).quantity, 1);
});

test('QRIS ignores stale cash values, even unsafe values, and always has zero change', async (t) => {
  const db = await freshDb(t);
  for (const staleCash of [50000, 1000, NaN]) {
    addChicken();
    const saved = await store.getState().checkout(db, 'qris', staleCash);
    assert.equal(saved.payment_amount, 13000);
    assert.equal(saved.change, 0);
  }
});

test('invalid cash values and insufficient payment preserve the cart without inserts', async (t) => {
  const db = await freshDb(t);
  addChicken();
  for (const amount of [1000, -1, NaN, Infinity, 20000.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(store.getState().checkout(db, 'tunai', amount));
    assert.equal(store.getState().isCheckingOut, false);
    assert.equal(store.getState().cart.length, 1);
  }
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 0);
});

test('a failed line insert rolls back sale and invoice sequence, then retry succeeds once', async (t) => {
  const db = await freshDb(t);
  addChicken();
  db.sql.exec("CREATE TRIGGER fail_item BEFORE INSERT ON transaction_items BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;");
  await assert.rejects(store.getState().checkout(db, 'tunai', 20000), /Keranjang tetap tersedia/);
  assert.equal(store.getState().cart.length, 1);
  assert.equal(store.getState().isCheckingOut, false);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 0);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM invoice_sequences')).count, 0);
  db.sql.exec('DROP TRIGGER fail_item');
  const saved = await store.getState().checkout(db, 'tunai', 20000);
  assert.match(saved.invoice_number, /-001$/);
});

test('history read failures never turn a committed checkout into a failed payment', async (t) => {
  const db = await freshDb(t);
  addChicken();
  const saved = await store.getState().checkout({
    ...db, async getAllAsync() { throw new Error('simulated read failure'); },
  }, 'tunai', 20000);
  assert.ok(saved.invoice_number);
  assert.equal(store.getState().cart.length, 0);
  await assert.rejects(store.getState().loadTransactions({
    ...db, async getAllAsync() { throw new Error('simulated read failure'); },
  }));
  assert.equal(store.getState().loading, false);
  assert.equal(store.getState().transactions[0].id, saved.id);
});

test('invoice sequence survives deleted transactions and switches at local midnight', async (t) => {
  const db = await freshDb(t);
  const getClock = db.getFirstAsync.bind(db);
  let currentTime = '2026-10-05 23:59:59';
  db.getFirstAsync = async (query, ...params) => query.includes("datetime('now','localtime') AS created_at")
    ? { created_at: currentTime, invoice_date: currentTime.slice(0, 10) }
    : getClock(query, ...params);
  addChicken();
  assert.equal((await store.getState().checkout(db, 'qris', 0)).invoice_number, 'INV-051026-001');
  db.sql.exec('DELETE FROM transaction_items; DELETE FROM transactions');
  addChicken();
  assert.equal((await store.getState().checkout(db, 'qris', 0)).invoice_number, 'INV-051026-002');
  currentTime = '2026-10-06 00:00:00';
  addChicken();
  const saved = await store.getState().checkout(db, 'qris', 0);
  assert.equal(saved.invoice_number, 'INV-061026-001');
  assert.equal(saved.created_at, currentTime);
});

test('invoice and timestamp persist after closing and reopening the SQLite file', async () => {
  const filename = path.join(os.tmpdir(), `pos-phase1-${process.pid}-${Date.now()}.db`);
  let db = openDb(filename);
  try {
    await migrateDbIfNeeded(db);
    resetStore();
    addChicken();
    const saved = await store.getState().checkout(db, 'tunai', 20000);
    db.close();
    db = openDb(filename);
    await migrateDbIfNeeded(db);
    const record = await db.getFirstAsync('SELECT * FROM transactions');
    assert.equal(record.invoice_number, saved.invoice_number);
    assert.equal(record.created_at, saved.created_at);
    assert.equal((await db.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
  } finally {
    db.close();
    fs.unlinkSync(filename);
  }
});

test('product writes and cart changes reject fractional or unsafe amounts', async (t) => {
  const db = await freshDb(t);
  await assert.rejects(products.getState().addProduct(db, { name: 'Ayam', price: 13000.5 }));
  assert.throws(() => store.getState().addToCart({ id: 7, name: 'Ayam', price: 13000.5 }));
  addChicken();
  assert.throws(() => store.getState().updateQuantity(7, 1.5));
  assert.throws(() => store.getState().updateQuantity(7, Number.MAX_SAFE_INTEGER));
  assert.equal(store.getState().cart[0].quantity, 1);
  await assert.rejects(db.runAsync('INSERT INTO products (name,price) VALUES (?,?)', 'Ayam', 13000.5), /CHECK constraint/);
});

test('existing printer output uses the persisted invoice/date, not the current time', async () => {
  const lines = [];
  const printLoad = createLoader({
    '@vardrz/react-native-bluetooth-escpos-printer': {
      BluetoothEscposPrinter: {
        ALIGN: { CENTER: 1, LEFT: 0 },
        async printerAlign() {}, async printAndFeed() {}, async cutOnePoint() {},
        async printText(text) { lines.push(text); },
      },
    },
  });
  const { printReceipt } = printLoad('services/print.ts');
  await printReceipt({
    invoiceNumber: 'INV-010926-003', createdAt: '2026-09-01 11:23:00',
    items: [{ product_name: 'Ayam Geprek', quantity: 1, product_price: 13000, subtotal: 13000 }],
    total: 13000, paymentMethod: 'qris', paymentAmount: 13000, change: 0,
  });
  assert.ok(lines.includes('INV-010926-003\n'));
  assert.ok(lines.includes('01 Sep 2026, 11:23\n'));
});
