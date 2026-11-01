import { create } from 'zustand';
import type { SQLiteDatabase } from '@/services/database';

interface SettingsState {
  storeName: string;
  businessType: string;
  loading: boolean;
  loadSettings: (db: SQLiteDatabase) => Promise<void>;
  saveSettings: (db: SQLiteDatabase, storeName: string, businessType: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  storeName: 'POS Offline',
  businessType: 'Toko',
  loading: false,

  loadSettings: async (db) => {
    set({ loading: true });
    try {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        'SELECT key, value FROM settings'
      );
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[row.key] = row.value;
      }
      set({
        storeName: map.store_name ?? 'POS Offline',
        businessType: map.business_type ?? 'Toko',
        loading: false,
      });
    } catch (e) {
      try {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
          INSERT OR IGNORE INTO settings (key, value) VALUES ('store_name', 'POS Offline');
          INSERT OR IGNORE INTO settings (key, value) VALUES ('business_type', 'Toko');
        `);
        const rows = await db.getAllAsync<{ key: string; value: string }>(
          'SELECT key, value FROM settings'
        );
        const map: Record<string, string> = {};
        for (const row of rows) {
          map[row.key] = row.value;
        }
        set({
          storeName: map.store_name ?? 'POS Offline',
          businessType: map.business_type ?? 'Toko',
          loading: false,
        });
      } catch (e2) {
        console.error('loadSettings retry error:', e2);
        set({ loading: false });
      }
    }
  },

  saveSettings: async (db, storeName, businessType) => {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        'store_name',
        storeName
      );
      await txn.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        'business_type',
        businessType
      );
    });
    set({ storeName, businessType });
  },
}));
