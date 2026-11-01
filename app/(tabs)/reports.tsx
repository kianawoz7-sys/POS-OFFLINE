import * as ScreenOrientation from 'expo-screen-orientation';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useLockOrientation } from '@/hooks/use-orientation';
import { Colors } from '@/constants/theme';

type Period = 'daily' | 'weekly' | 'monthly';

export default function ReportsScreen() {
  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [period, setPeriod] = useState<Period>('daily');
  const [data, setData] = useState<{
    total: number;
    count: number;
    items: { name: string; qty: number; total: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async (p: Period) => {
    setPeriod(p);
    setLoading(true);
    try {

      let dateFilter = '';
      switch (p) {
        case 'daily':
          dateFilter = "WHERE date(created_at) = date('now','localtime')";
          break;
        case 'weekly':
          dateFilter =
            "WHERE created_at >= datetime('now','localtime','-7 days')";
          break;
        case 'monthly':
          dateFilter =
            "WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now','localtime')";
          break;
      }

      const summary = await db.getFirstAsync<{
        total: number;
        count: number;
      }>(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM transactions ${dateFilter}`);

      const items = await db.getAllAsync<{
        name: string;
        qty: number;
        total: number;
      }>(
        `SELECT ti.product_name as name, SUM(ti.quantity) as qty, SUM(ti.subtotal) as total
         FROM transaction_items ti
         JOIN transactions t ON t.id = ti.transaction_id
         ${dateFilter}
         GROUP BY ti.product_name
         ORDER BY total DESC
         LIMIT 10`
      );

      setData({
        total: summary?.total ?? 0,
        count: summary?.count ?? 0,
        items,
      });
    } catch (error) {
      console.error('load report failed:', error);
      setData(null);
      Alert.alert('Gagal memuat laporan', 'Transaksi tersimpan tetap ada. Silakan pilih periode untuk mencoba lagi.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  const periodLabel = {
    daily: 'Hari Ini',
    weekly: '7 Hari',
    monthly: 'Bulan Ini',
  };

  const maxTotal = data ? Math.max(...data.items.map((i) => i.total), 1) : 1;

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <ThemedText type="title" style={{ marginBottom: 16 }}>Laporan</ThemedText>

      <View style={styles.periodRow}>
        {(Object.keys(periodLabel) as Period[]).map((p) => (
          <Pressable
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => loadReport(p)}
          >
            <ThemedText style={period === p ? { color: '#fff', fontWeight: '600' } : {}}>
              {periodLabel[p]}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {loading && (
        <ActivityIndicator size="large" color={Colors.tint} style={{ marginTop: 40 }} />
      )}

      {data && !loading && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <ThemedText style={{ fontSize: 24, lineHeight: 30, marginBottom: 4 }}>{'\u{1F4B5}'}</ThemedText>
                <ThemedText style={{ color: Colors.placeholder, fontSize: 11 }}>Total</ThemedText>
                <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>
                  Rp {data.total.toLocaleString('id-ID')}
                </ThemedText>
              </View>
              <View style={styles.separator} />
              <View style={styles.summaryItem}>
                <ThemedText style={{ fontSize: 24, lineHeight: 30, marginBottom: 4 }}>{'\u{1F4CA}'}</ThemedText>
                <ThemedText style={{ color: Colors.placeholder, fontSize: 11 }}>Transaksi</ThemedText>
                <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>
                  {data.count}
                </ThemedText>
              </View>
            </View>
          </Card>

          <ThemedText type="defaultSemiBold" style={{ marginBottom: 8 }}>
            Produk Terlaris
          </ThemedText>

          {data.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 12 }}>{item.name}</ThemedText>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${(item.total / maxTotal) * 100}%` },
                    ]}
                  />
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
                <ThemedText type="defaultSemiBold" style={{ fontSize: 12 }}>
                  Rp {item.total.toLocaleString('id-ID')}
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: Colors.placeholder }}>
                  {item.qty} pcs
                </ThemedText>
              </View>
            </View>
          ))}
          {data.items.length === 0 && (
            <EmptyState
              icon={'\u{1F4CA}'}
              title="Belum ada data"
              subtitle="Belum ada penjualan untuk periode ini"
            />
          )}
        </>
      )}

      {!data && !loading && (
        <EmptyState
          icon={'\u{1F4CA}'}
          title="Pilih periode"
          subtitle="Pilih periode untuk melihat laporan"
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: Colors.tint },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  separator: { width: 1, height: 40, backgroundColor: Colors.borderLight },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: Colors.tint,
    borderRadius: 3,
  },
});
