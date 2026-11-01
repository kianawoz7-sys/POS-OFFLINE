import * as ScreenOrientation from 'expo-screen-orientation';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useLockOrientation } from '@/hooks/use-orientation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTransactionStore, type PeriodFilter, type Transaction, type TransactionItem } from '@/stores/transactionStore';
import { parseLocalDateTime } from '@/utils/invoice';
import { Colors } from '@/constants/theme';

export default function HistoryScreen() {
  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { transactions, loading, hasMore, loadTransactions } = useTransactionStore();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    loadTransactions(db, period, 1).catch((error) => {
      console.error('load history failed:', error);
      Alert.alert('Gagal memuat riwayat', 'Transaksi tersimpan tetap ada. Silakan pilih periode untuk mencoba lagi.');
    });
  }, [db, period, loadTransactions]);

  const selectTransaction = async (t: Transaction) => {
    try {
      const rows = await db.getAllAsync<TransactionItem>(
        'SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY id', t.id
      );
      setItems(rows);
      setSelected(t);
    } catch (error) {
      console.error('load transaction items failed:', error);
      Alert.alert('Gagal memuat detail', 'Silakan pilih transaksi kembali.');
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      loadTransactions(db, period, nextPage).then(() => setPage(nextPage)).catch((error) => {
        console.error('load next history page failed:', error);
        Alert.alert('Gagal memuat riwayat', 'Silakan coba lagi.');
      });
    }
  };

  const formatDate = (date: string) => {
    const d = parseLocalDateTime(date);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const periods: { key: PeriodFilter; label: string }[] = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: '7 Hari' },
    { key: 'month', label: 'Bulan Ini' },
    { key: 'all', label: 'Semua' },
  ];

  if (selected) {
    return (
      <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
        <Pressable onPress={() => setSelected(null)} style={styles.backRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <IconSymbol name="chevron.left" size={18} color={Colors.tint} />
            <ThemedText style={{ color: Colors.tint, fontWeight: '600', fontSize: 14 }}>Kembali</ThemedText>
          </View>
        </Pressable>

        <Card style={{ marginBottom: 16 }}>
          <ThemedText type="title" style={{ marginBottom: 12 }}>Detail Transaksi</ThemedText>
          <ThemedText type="defaultSemiBold">{selected.invoice_number}</ThemedText>
          <View style={styles.detailRow}>
            <ThemedText style={{ color: Colors.placeholder }}>Tanggal</ThemedText>
            <ThemedText type="defaultSemiBold">{formatDate(selected.created_at)}</ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={{ color: Colors.placeholder }}>Pembayaran</ThemedText>
            <Badge
              label={selected.payment_method.toUpperCase()}
              variant={selected.payment_method === 'qris' ? 'info' : 'success'}
            />
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={{ color: Colors.placeholder }}>Bayar</ThemedText>
            <ThemedText type="defaultSemiBold">Rp {selected.payment_amount.toLocaleString('id-ID')}</ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={{ color: Colors.placeholder }}>Kembalian</ThemedText>
            <ThemedText type="defaultSemiBold">Rp {selected.change.toLocaleString('id-ID')}</ThemedText>
          </View>
        </Card>

        <ThemedText type="defaultSemiBold" style={{ marginBottom: 8 }}>Item</ThemedText>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ gap: 6 }}
          renderItem={({ item }) => (
            <Card padding={10}>
              <View style={styles.detailRow}>
                <ThemedText style={{ flex: 2 }}>{item.product_name}</ThemedText>
                <ThemedText style={{ flex: 1, textAlign: 'center' }}>{item.quantity}x</ThemedText>
                <ThemedText style={{ flex: 1, textAlign: 'right', fontWeight: '600' }}>
                  Rp {item.subtotal.toLocaleString('id-ID')}
                </ThemedText>
              </View>
            </Card>
          )}
        />

        <Card style={{ marginTop: 12 }}>
          <View style={styles.detailRow}>
            <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>Total</ThemedText>
            <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>
              Rp {selected.total.toLocaleString('id-ID')}
            </ThemedText>
          </View>
        </Card>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <ThemedText type="title" style={{ marginBottom: 12 }}>Riwayat Transaksi</ThemedText>

      <View style={styles.filterRow}>
        {periods.map((p) => (
          <Pressable
            key={p.key}
            style={[styles.filterBtn, period === p.key && styles.filterBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <ThemedText
              style={[styles.filterBtnText, period === p.key && styles.filterBtnTextActive]}
            >
              {p.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ gap: 8, paddingTop: 8 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => selectTransaction(item)}>
            <Card style={styles.transactionCard}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ThemedText type="defaultSemiBold">{item.invoice_number}</ThemedText>
                  <Badge
                    label={item.payment_method.toUpperCase()}
                    variant={item.payment_method === 'qris' ? 'info' : 'success'}
                  />
                </View>
                <ThemedText style={{ color: Colors.placeholder, fontSize: 12 }}>
                  {formatDate(item.created_at)}
                </ThemedText>
                <ThemedText type="defaultSemiBold">
                  Rp {item.total.toLocaleString('id-ID')}
                </ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.muted} />
            </Card>
          </Pressable>
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loading ? (
            <ActivityIndicator size="small" color={Colors.tint} style={{ paddingVertical: 16 }} />
          ) : !hasMore && transactions.length > 0 ? (
            <ThemedText style={{ textAlign: 'center', color: Colors.muted, paddingVertical: 12, fontSize: 12 }}>
              Semua transaksi telah dimuat
            </ThemedText>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={'\u{1F4CB}'}
              title="Belum ada transaksi"
              subtitle="Transaksi akan muncul di sini"
            />
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  backRow: { marginBottom: 16 },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  filterBtnActive: {
    backgroundColor: Colors.tint,
    borderColor: Colors.tint,
  },
  filterBtnText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
});
