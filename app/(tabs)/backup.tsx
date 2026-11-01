import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBackupRuntime } from '@/components/backup-runtime';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useLockOrientation } from '@/hooks/use-orientation';
import { createBackup, deleteSavedBackup, disposePreparedBackup, listSavedBackups, prepareBackup, restoreBackup, type PreparedBackup, type SavedBackup } from '@/services/backup';

export default function BackupScreen() {
  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const runtime = useBackupRuntime();
  const [saved, setSaved] = useState<SavedBackup[]>([]);
  const [preview, setPreview] = useState<PreparedBackup | null>(null);
  const selected = useRef<PreparedBackup | null>(null);
  const busy = useRef(false);

  const reloadSaved = () => {
    try { setSaved(listSavedBackups()); } catch { Alert.alert('Gagal memuat backup', 'Daftar backup lokal tidak dapat dibaca.'); }
  };
  useEffect(() => {
    reloadSaved();
    return () => disposePreparedBackup(selected.current);
  }, []);

  const cancelPreview = () => {
    disposePreparedBackup(selected.current);
    selected.current = null;
    setPreview(null);
  };
  const showError = (error: unknown) => Alert.alert('Backup & Restore', error instanceof Error ? error.message : 'Operasi gagal. Silakan coba lagi.');
  const share = async (backup: SavedBackup) => {
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('Menu berbagi tidak tersedia di perangkat ini. Backup tetap tersimpan di aplikasi.');
      await Sharing.shareAsync(backup.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Bagikan / Simpan Backup POS' });
    } catch (error) { showError(error); }
  };
  const makeBackup = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const backup = await runtime.run('Membuat backup...', (progress) => createBackup(db, progress));
      reloadSaved();
      await share(backup);
    } catch (error) { showError(error); } finally { busy.current = false; }
  };
  const removeBackup = async (backup: SavedBackup) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await runtime.run('Menghapus backup...', () => deleteSavedBackup(backup));
      reloadSaved();
    } catch (error) { showError(error); } finally { busy.current = false; }
  };
  const confirmDeleteBackup = (backup: SavedBackup) => {
    if (busy.current) return;
    Alert.alert('Hapus Backup', `Yakin ingin menghapus file backup ini?\n\n${backup.name}`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => { void removeBackup(backup); } },
    ]);
  };
  const selectBackup = async (local?: SavedBackup) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const candidate = await runtime.run('Memilih backup...', async (progress) => {
        if (local) return prepareBackup(local.uri, progress);
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
        if (result.canceled) return null;
        const asset = result.assets[0];
        try {
          if (!asset.name.toLowerCase().endsWith('.posbackup')) throw new Error('Pilih file dengan ekstensi .posbackup.');
          return await prepareBackup(asset.uri, progress);
        } finally {
          // Only delete the picker's cache copy, never the user's original file.
          if (asset.uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`)) {
            try { const file = new File(asset.uri); if (file.exists) file.delete(); } catch { /* cache can be cleared by Android */ }
          }
        }
      });
      if (candidate) {
        disposePreparedBackup(selected.current);
        selected.current = candidate;
        setPreview(candidate);
      }
    } catch (error) { showError(error); } finally { busy.current = false; }
  };
  const restore = async () => {
    const candidate = selected.current;
    if (!candidate || busy.current) return;
    busy.current = true;
    selected.current = null;
    setPreview(null);
    try {
      const result = await runtime.run('Menyiapkan restore...', (progress) => restoreBackup(db, candidate, progress));
      runtime.refreshAfterRestore();
      Alert.alert('Backup dipulihkan', `${result.summary.productCount} produk dan ${result.summary.transactionCount} transaksi dipulihkan.\n\nBackup pengaman tersedia di Pengaturan → Backup & Restore:\n${result.safetyBackup.name}`);
    } catch (error) {
      disposePreparedBackup(candidate);
      reloadSaved();
      showError(error);
    } finally { busy.current = false; }
  };

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <IconSymbol name="chevron.left" size={18} color={Colors.tint} />
          <ThemedText style={{ color: Colors.tint, fontWeight: '600' }}>Kembali</ThemedText>
        </View>
      </Pressable>
      <ThemedText type="title" style={{ marginBottom: 20 }}>Backup & Restore</ThemedText>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
        <Card style={{ gap: 12 }}>
          <ThemedText type="defaultSemiBold">Backup data POS</ThemedText>
          <ThemedText>Database, riwayat, pengaturan toko dan foto produk disimpan dalam satu file .posbackup.</ThemedText>
          <Button title="Buat Backup" onPress={makeBackup} />
          <ThemedText style={styles.hint}>Pembuatan backup berjalan offline. Bagikan atau simpan file ke tempat pilihanmu setelah selesai.</ThemedText>
        </Card>
        <Card style={{ gap: 12 }}>
          <ThemedText type="defaultSemiBold">Pulihkan data POS</ThemedText>
          <ThemedText>Data sekarang akan diganti seluruhnya oleh isi backup. Backup pengaman dibuat otomatis sebelum pemulihan.</ThemedText>
          <Button title="Pulihkan Backup" variant="outline" onPress={() => selectBackup()} />
        </Card>
        {saved.length > 0 && <View style={{ gap: 10 }}>
          <ThemedText type="defaultSemiBold">Backup di perangkat ini</ThemedText>
          <ThemedText style={styles.hint}>Backup pengaman dapat dipulihkan untuk kembali ke kondisi sebelum restore. Bagikan file agar tetap tersedia jika aplikasi dihapus.</ThemedText>
          {saved.map((backup) => <Card key={backup.uri} style={{ gap: 8 }}>
            <ThemedText type="defaultSemiBold">{backup.name.includes('_sebelum_restore_') ? 'Backup pengaman sebelum restore' : 'Backup manual'}</ThemedText>
            <ThemedText style={styles.hint}>{backup.name}</ThemedText>
            <ThemedText style={styles.hint}>{(backup.size / 1024 / 1024).toFixed(2)} MiB</ThemedText>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Bagikan" size="sm" variant="outline" onPress={() => share(backup)} />
              <Button title="Pulihkan" size="sm" variant="secondary" onPress={() => selectBackup(backup)} />
              <Button title="Hapus" size="sm" variant="danger" onPress={() => confirmDeleteBackup(backup)} />
            </View>
          </Card>)}
        </View>}
      </ScrollView>
      <Modal visible={preview !== null} transparent animationType="fade" onRequestClose={cancelPreview}>
        <View style={styles.overlay}>
          <Card style={styles.preview}>
            <ThemedText type="subtitle">Backup POS</ThemedText>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <ThemedText>Dibuat: {preview && new Date(preview.metadata.createdAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</ThemedText>
              <ThemedText>Nama Toko: {preview?.summary.storeName}</ThemedText>
              <ThemedText>Produk: {preview?.summary.productCount}</ThemedText>
              <ThemedText>Transaksi: {preview?.summary.transactionCount}</ThemedText>
              <ThemedText>Produk dengan foto: {preview?.summary.imageCount}</ThemedText>
              <ThemedText style={styles.hint}>Data sekarang akan diganti, termasuk pengaturan toko. Keranjang yang belum dibayar akan dikosongkan.</ThemedText>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button title="Batal" variant="secondary" style={{ flex: 1 }} onPress={cancelPreview} />
              <Button title="Pulihkan" variant="danger" style={{ flex: 1 }} onPress={restore} />
            </View>
          </Card>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.placeholder },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  preview: { width: '100%', maxWidth: 420, maxHeight: '90%', gap: 18 },
});
