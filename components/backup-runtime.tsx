import { createContext, Fragment, useContext, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useProductStore } from '@/stores/productStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTransactionStore } from '@/stores/transactionStore';
import type { BackupProgress } from '@/services/backup';

interface BackupRuntime {
  run: <T>(message: string, task: (progress: BackupProgress) => Promise<T>) => Promise<T>;
  refreshAfterRestore: () => void;
}

const Context = createContext<BackupRuntime | null>(null);

export function BackupRuntimeProvider({ children }: { children: ReactNode }) {
  const running = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const run: BackupRuntime['run'] = async (label, task) => {
    if (running.current || useTransactionStore.getState().isCheckingOut || useProductStore.getState().loading || useSettingsStore.getState().loading) throw new Error('Operasi POS masih berjalan. Tunggu sebentar lalu coba lagi.');
    running.current = true;
    setMessage(label);
    try { return await task(setMessage); } finally { running.current = false; setMessage(null); }
  };
  const refreshAfterRestore = () => {
    // Only cached/unsaved state is reset. Existing checkout and printer code
    // stay unchanged; remounting pages makes their existing loaders run again.
    useProductStore.setState({ products: [], loading: false });
    useTransactionStore.setState({ cart: [], transactions: [], loading: false, isCheckingOut: false, hasMore: true });
    useSettingsStore.setState({ storeName: 'POS Offline', businessType: 'Toko', loading: false });
    setRevision((value) => value + 1);
  };
  return (
    <Context.Provider value={{ run, refreshAfterRestore }}>
      <Fragment key={revision}>{children}</Fragment>
      <Modal transparent visible={message !== null} animationType="fade" onRequestClose={() => {}}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <ActivityIndicator size="large" color={Colors.tint} />
            <ThemedText style={{ textAlign: 'center' }}>{message}</ThemedText>
          </View>
        </View>
      </Modal>
    </Context.Provider>
  );
}

export function useBackupRuntime(): BackupRuntime {
  const runtime = useContext(Context);
  if (!runtime) throw new Error('BackupRuntimeProvider belum tersedia.');
  return runtime;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: Colors.card, padding: 24, borderRadius: 12, gap: 16, maxWidth: 340 },
});
