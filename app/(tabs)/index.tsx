import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLockOrientation } from '@/hooks/use-orientation';
import { useSettingsStore } from '@/stores/settingsStore';
import { Colors } from '@/constants/theme';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();

  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);

  const { storeName, businessType, loadSettings } = useSettingsStore();
  const [summary, setSummary] = useState({
    today: 0,
    todayCount: 0,
    week: 0,
    month: 0,
    productCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      await loadSettings(db);
      const today = await db.getFirstAsync<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM transactions WHERE date(created_at) = date('now','localtime')`
      );
      const week = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(total),0) as total FROM transactions WHERE created_at >= datetime('now','localtime','-7 days')`
      );
      const month = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(total),0) as total FROM transactions WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now','localtime')`
      );
      const productCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM products'
      );
      setSummary({
        today: today?.total ?? 0,
        todayCount: today?.count ?? 0,
        week: week?.total ?? 0,
        month: month?.total ?? 0,
        productCount: productCount?.count ?? 0,
      });
    } catch (error) {
      console.error('load dashboard failed:', error);
      Alert.alert('Gagal memuat ringkasan', 'Transaksi tersimpan tetap ada. Silakan buka kembali dashboard.');
    } finally {
      setLoading(false);
    }
  }, [db, loadSettings]);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
    }, [loadSummary])
  );

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <View style={styles.brand}>
        <ThemedText style={styles.brandIcon}>{'\u{1F4B0}'}</ThemedText>
        <View>
          <ThemedText type="title" style={{ fontSize: 26 }}>{storeName}</ThemedText>
          <ThemedText style={styles.brandSub}>{businessType}</ThemedText>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.tint} style={{ marginTop: 60 }} />
      ) : (
        <>
          <View style={styles.cardsRow}>
            <Card style={styles.statCard}>
              <ThemedText style={styles.statIcon}>{'\u{1F4E6}'}</ThemedText>
              <ThemedText style={styles.statNumber}>{summary.productCount}</ThemedText>
              <ThemedText style={styles.statLabel}>Produk</ThemedText>
            </Card>
            <Card style={styles.statCard}>
              <ThemedText style={styles.statIcon}>{'\u{1F4B5}'}</ThemedText>
              <ThemedText style={styles.statNumber}>{summary.todayCount}</ThemedText>
              <ThemedText style={styles.statLabel}>Transaksi Hari Ini</ThemedText>
            </Card>
          </View>

          <Card style={{ marginBottom: 24 }}>
            <ThemedText style={styles.rekapTitle}>Rekap Penjualan</ThemedText>
            <View style={styles.rekapRow}>
              <ThemedText style={styles.rekapLabel}>Hari Ini</ThemedText>
              <ThemedText style={styles.rekapValue}>
                Rp {summary.today.toLocaleString('id-ID')}
              </ThemedText>
            </View>
            <View style={styles.rekapRow}>
              <ThemedText style={styles.rekapLabel}>7 Hari</ThemedText>
              <ThemedText style={styles.rekapValue}>
                Rp {summary.week.toLocaleString('id-ID')}
              </ThemedText>
            </View>
            <View style={styles.rekapRow}>
              <ThemedText style={styles.rekapLabel}>Bulan Ini</ThemedText>
              <ThemedText style={[styles.rekapValue, { fontSize: 16 }]}>
                Rp {summary.month.toLocaleString('id-ID')}
              </ThemedText>
            </View>
          </Card>
        </>
      )}

      <Button
        title="Mulai Menjual"
        size="lg"
        onPress={() => router.push('/transaksi')}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 32, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  brandIcon: { fontSize: 40, lineHeight: 44 },
  brandSub: { fontSize: 13, color: Colors.placeholder },
  cardsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statIcon: { fontSize: 28, lineHeight: 34 },
  statNumber: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: Colors.placeholder, textAlign: 'center' },
  rekapTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  rekapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  rekapLabel: { fontSize: 13, color: Colors.placeholder },
  rekapValue: { fontSize: 14, fontWeight: '600' },
});
