import { create } from 'zustand';
import type { SQLiteDatabase } from '@/services/database';
import { assertRupiah } from '@/utils/money';

export interface Product {
  id: number;
  name: string;
  price: number;
  image_path: string;
  created_at: string;
  updated_at: string;
}

interface ProductState {
  products: Product[];
  loading: boolean;
  loadProducts: (db: SQLiteDatabase) => Promise<void>;
  addProduct: (db: SQLiteDatabase, product: { name: string; price: number; image_path?: string }) => Promise<void>;
  updateProduct: (db: SQLiteDatabase, id: number, product: { name?: string; price?: number; image_path?: string }) => Promise<void>;
  deleteProduct: (db: SQLiteDatabase, id: number) => Promise<void>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,

  loadProducts: async (db: SQLiteDatabase) => {
    set({ loading: true });
    try {
      const products = await db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
      set({ products });
    } finally {
      set({ loading: false });
    }
  },

  addProduct: async (db, product) => {
    assertRupiah(product.price, 'Harga');
    if (!product.name.trim()) throw new Error('Nama produk harus diisi.');
    await db.runAsync(
      'INSERT INTO products (name, price, image_path) VALUES (?, ?, ?)',
      product.name.trim(),
      product.price,
      product.image_path ?? ''
    );
    await get().loadProducts(db);
  },

  updateProduct: async (db, id, product) => {
    if (product.price !== undefined) assertRupiah(product.price, 'Harga');
    if (product.name !== undefined && !product.name.trim()) throw new Error('Nama produk harus diisi.');
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (product.name !== undefined) { fields.push('name = ?'); values.push(product.name.trim()); }
    if (product.price !== undefined) { fields.push('price = ?'); values.push(product.price); }
    if (product.image_path !== undefined) { fields.push('image_path = ?'); values.push(product.image_path); }

    if (fields.length === 0) return;

    fields.push("updated_at = datetime('now','localtime')");
    values.push(id);

    await db.runAsync(
      `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    await get().loadProducts(db);
  },

  deleteProduct: async (db, id) => {
    await db.runAsync('DELETE FROM products WHERE id = ?', id);
    await get().loadProducts(db);
  },
}));
