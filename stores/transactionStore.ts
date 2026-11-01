import { create } from 'zustand';
import type { SQLiteDatabase } from '@/services/database';
import { assertRupiah } from '@/utils/money';
import { formatInvoice } from '@/utils/invoice';

export type PaymentMethod = 'tunai' | 'qris';

export interface CartItem {
  product_id: number;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
}

function validateCart(cart: CartItem[]): CartItem[] {
  const items = cart.map((item) => {
    assertRupiah(item.product_price, 'Harga');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('Jumlah produk tidak valid.');
    const subtotal = item.product_price * item.quantity;
    assertRupiah(subtotal, 'Subtotal');
    return { ...item, subtotal };
  });
  assertRupiah(items.reduce((sum, item) => sum + item.subtotal, 0), 'Total');
  return items;
}

export interface Transaction {
  id: number;
  invoice_number: string;
  total: number;
  payment_method: string;
  payment_amount: number;
  change: number;
  created_at: string;
}

export interface SavedTransaction extends Transaction {
  items: CartItem[];
}

export interface TransactionItem {
  id: number;
  transaction_id: number;
  product_id: number;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
}

export type PeriodFilter = 'today' | 'week' | 'month' | 'all';

interface TransactionState {
  cart: CartItem[];
  transactions: Transaction[];
  loading: boolean;
  isCheckingOut: boolean;
  hasMore: boolean;
  addToCart: (product: { id: number; name: string; price: number }) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  checkout: (db: SQLiteDatabase, paymentMethod: PaymentMethod, paymentAmount: number) => Promise<SavedTransaction | null>;
  loadTransactions: (db: SQLiteDatabase, period?: PeriodFilter, page?: number, pageSize?: number) => Promise<void>;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  cart: [],
  transactions: [],
  loading: false,
  isCheckingOut: false,
  hasMore: true,

  addToCart: (product) => {
    if (get().isCheckingOut) return;
    assertRupiah(product.price, 'Harga');
    const { cart } = get();
    const existing = cart.find((item) => item.product_id === product.id);

    if (existing) {
      set({
        cart: validateCart(cart.map((item) =>
          item.product_id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.product_price,
              }
            : item
        )),
      });
    } else {
      set({
        cart: validateCart([
          ...cart,
          {
            product_id: product.id,
            product_name: product.name,
            product_price: product.price,
            quantity: 1,
            subtotal: product.price,
          },
        ]),
      });
    }
  },

  updateQuantity: (productId, quantity) => {
    if (get().isCheckingOut) return;
    if (!Number.isSafeInteger(quantity)) throw new Error('Jumlah produk harus berupa bilangan bulat.');
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }
    set({
      cart: validateCart(get().cart.map((item) =>
        item.product_id === productId
          ? { ...item, quantity, subtotal: quantity * item.product_price }
          : item
      )),
    });
  },

  removeFromCart: (productId) => {
    if (get().isCheckingOut) return;
    set({ cart: get().cart.filter((item) => item.product_id !== productId) });
  },

  clearCart: () => {
    if (!get().isCheckingOut) set({ cart: [] });
  },

  checkout: async (db, paymentMethod, paymentAmount) => {
    // Zustand updates synchronously: a second tap is blocked before any await.
    if (get().isCheckingOut) return null;
    set({ isCheckingOut: true });
    try {
      if (get().cart.length === 0) throw new Error('Keranjang masih kosong.');
      if (paymentMethod !== 'tunai' && paymentMethod !== 'qris') throw new Error('Metode pembayaran tidak valid.');
      const items = validateCart(get().cart);
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      assertRupiah(total, 'Total');
      // QRIS never uses a previous cash input or gives change.
      const amount = paymentMethod === 'qris' ? total : paymentAmount;
      assertRupiah(amount, 'Jumlah bayar');
      if (amount < total) throw new Error('Jumlah bayar kurang dari total belanja.');
      const receipt: SavedTransaction = {
        id: 0, invoice_number: '', created_at: '', items, total,
        payment_method: paymentMethod, payment_amount: amount, change: amount - total,
      };

      try {
        await db.withExclusiveTransactionAsync(async (txn) => {
          const clock = await txn.getFirstAsync<{ created_at: string; invoice_date: string }>(
            "SELECT datetime('now','localtime') AS created_at, date('now','localtime') AS invoice_date"
          );
          if (!clock) throw new Error('Waktu transaksi tidak tersedia.');
          await txn.runAsync(
            `INSERT INTO invoice_sequences (invoice_date, last_number) VALUES (?, 1)
             ON CONFLICT(invoice_date) DO UPDATE SET last_number = last_number + 1`,
            clock.invoice_date
          );
          const sequence = await txn.getFirstAsync<{ last_number: number }>(
            'SELECT last_number FROM invoice_sequences WHERE invoice_date = ?', clock.invoice_date
          );
          if (!sequence) throw new Error('Nomor invoice tidak tersedia.');
          receipt.invoice_number = formatInvoice(clock.invoice_date, sequence.last_number);
          receipt.created_at = clock.created_at;
          const result = await txn.runAsync(
            `INSERT INTO transactions (invoice_number, total, payment_method, payment_amount, change, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            receipt.invoice_number, total, paymentMethod, amount, receipt.change, receipt.created_at
          );
          receipt.id = result.lastInsertRowId;
          for (const item of items) {
            await txn.runAsync(
              'INSERT INTO transaction_items (transaction_id, product_id, product_name, product_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
              receipt.id, item.product_id, item.product_name, item.product_price, item.quantity, item.subtotal
            );
          }
        });
      } catch (error) {
        console.error('checkout failed:', error);
        throw new Error('Transaksi belum tersimpan. Keranjang tetap tersedia. Silakan coba lagi.');
      }
      // Once committed, do not turn a history refresh failure into a failed sale.
      set((state) => ({ cart: [], transactions: [receipt, ...state.transactions] }));
      return receipt;
    } finally {
      set({ isCheckingOut: false });
    }
  },

  loadTransactions: async (db, period = 'all', page = 1, pageSize = 50) => {
    set({ loading: true });
    try {
      let whereClause = '';
      switch (period) {
        case 'today':
          whereClause = "WHERE date(created_at) = date('now','localtime')";
          break;
        case 'week':
          whereClause = "WHERE created_at >= datetime('now','localtime','-7 days')";
          break;
        case 'month':
          whereClause = "WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now','localtime')";
          break;
      }

      const offset = (page - 1) * pageSize;
      const transactions = await db.getAllAsync<Transaction>(
        `SELECT * FROM transactions ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        pageSize,
        offset
      );

      const countResult = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM transactions ${whereClause}`
      );
      const totalCount = countResult?.count ?? 0;
      const hasMore = offset + pageSize < totalCount;

      set((state) => ({
        transactions: page === 1 ? transactions : [...state.transactions, ...transactions],
        hasMore,
      }));
    } finally {
      set({ loading: false });
    }
  },
}));
