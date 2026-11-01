import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Colors } from '@/constants/theme';
import { useLockOrientation } from '@/hooks/use-orientation';
import { usePrinterStore } from '@/stores/printerStore';
import { BluetoothEscposPrinter, BluetoothManager } from '@vardrz/react-native-bluetooth-escpos-printer';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, PermissionsAndroid, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PrinterDevice {
  name: string;
  address: string;
  connected?: boolean;
}

export default function PrinterScreen() {
  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const insets = useSafeAreaInsets();
  const { printerTarget, printerName, connected, setPrinter, setConnected, disconnect } = usePrinterStore();

  const [scanning, setScanning] = useState(false);
  const [foundDevices, setFoundDevices] = useState<PrinterDevice[]>([]);
  const [connecting, setConnecting] = useState(false);

  const requestBluetoothPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch {
      return false;
    }
  }, []);

  const handleScan = useCallback(async () => {
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) {
      Alert.alert('Izin diperlukan', 'Aplikasi membutuhkan izin Bluetooth untuk mencari printer.');
      return;
    }

    setScanning(true);
    setFoundDevices([]);

    try {
      const pairedRaw = await BluetoothManager.enableBluetooth();

      const raw = await BluetoothManager.scanDevices();
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw;

      const seen = new Set<string>();
      const allDevices: PrinterDevice[] = [];

      if (Array.isArray(pairedRaw)) {
        for (const p of pairedRaw) {
          const dev: PrinterDevice = typeof p === 'string' ? JSON.parse(p) : p;
          if (!seen.has(dev.address)) {
            seen.add(dev.address);
            allDevices.push(dev);
          }
        }
      }

      for (const d of result.paired ?? []) {
        if (!seen.has(d.address)) {
          seen.add(d.address);
          allDevices.push(d);
        }
      }
      for (const d of result.found ?? []) {
        if (!seen.has(d.address)) {
          seen.add(d.address);
          allDevices.push(d);
        }
      }

      setFoundDevices(allDevices);
    } catch (e: any) {
      Alert.alert('Gagal Scan', e?.message ?? 'Tidak dapat memindai perangkat Bluetooth');
    } finally {
      setScanning(false);
    }
  }, [requestBluetoothPermissions]);

  const handleConnect = useCallback(async (address: string, name: string) => {
    setConnecting(true);
    try {
      await BluetoothManager.connect(address);
      setPrinter(address, name);
      setConnected(true);
      Alert.alert('Berhasil', `Terhubung ke ${name}`);
    } catch (e: any) {
      Alert.alert('Gagal', e?.message ?? 'Tidak dapat terhubung ke printer');
      disconnect();
    } finally {
      setConnecting(false);
    }
  }, [setPrinter, setConnected, disconnect]);

  const handleDisconnect = useCallback(async () => {
    if (printerTarget) {
      await BluetoothManager.disconnect(printerTarget);
    }
    disconnect();
  }, [printerTarget, disconnect]);

  const handlePrintTest = useCallback(async () => {
    try {
      // await BluetoothEscposPrinter.printerInit();
      await BluetoothEscposPrinter.printText('TEST PRINT', {});
      await BluetoothEscposPrinter.printAndFeed(3);
      BluetoothEscposPrinter.cutOnePoint();
      Alert.alert('Sukses', 'Test print berhasil dikirim');
    } catch (e: any) {
      Alert.alert('Gagal', e?.message ?? 'Cetak gagal. Periksa koneksi printer.');
    }
  }, []);

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <ThemedText type="title" style={{ marginBottom: 16 }}>Printer</ThemedText>

      <Card style={{ marginBottom: 16 }}>
        <ThemedText type="defaultSemiBold" style={{ marginBottom: 8 }}>Status Printer</ThemedText>
        {printerName ? (
          <View style={{ gap: 4 }}>
            <View style={styles.statusRow}>
              <ThemedText style={{ color: Colors.placeholder }}>Nama</ThemedText>
              <ThemedText type="defaultSemiBold">{printerName}</ThemedText>
            </View>
            <View style={styles.statusRow}>
              <ThemedText style={{ color: Colors.placeholder }}>Alamat</ThemedText>
              <ThemedText style={{ fontSize: 12 }}>{printerTarget}</ThemedText>
            </View>
            <View style={styles.statusRow}>
              <ThemedText style={{ color: Colors.placeholder }}>Status</ThemedText>
              <Badge
                label={connected ? 'Terhubung' : 'Tidak Terhubung'}
                variant={connected ? 'success' : 'warning'}
              />
            </View>
            <Button
              title={connecting ? 'Menghubungkan...' : 'Lepas Printer'}
              variant="outline"
              size="sm"
              onPress={handleDisconnect}
              disabled={connecting}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : (
          <EmptyState
            icon={'\u{1F5A8}\u{FE0F}'}
            title="Belum ada printer"
            subtitle="Scan printer Bluetooth untuk mulai"
          />
        )}
      </Card>

      {!printerName && (
        <>
          <Button
            title={scanning ? 'Memindai...' : 'Cari Printer Bluetooth'}
            onPress={handleScan}
            disabled={scanning}
            style={{ marginBottom: 16 }}
          />

          {scanning && <ActivityIndicator size="large" color={Colors.tint} style={{ marginBottom: 16 }} />}

          <FlatList
            data={foundDevices}
            keyExtractor={(item) => item.address}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleConnect(item.address, item.name)}
                disabled={connecting}
              >
                <Card style={styles.printerItem}>
                  <ThemedText style={{ fontSize: 24 }}>{'\u{1F4F6}'}</ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">{item.name || '(tanpa nama)'}</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: Colors.placeholder }}>{item.address}</ThemedText>
                  </View>
                  <ThemedText style={{ color: Colors.tint, fontWeight: '600' }}>
                    {connecting ? '...' : 'Hubungkan'}
                  </ThemedText>
                </Card>
              </Pressable>
            )}
            ListEmptyComponent={
              !scanning ? (
                <EmptyState
                  icon={'\u{1F50D}'}
                  title="Tekan Cari Printer"
                  subtitle="Pastikan Bluetooth printer menyala"
                />
              ) : null
            }
          />
        </>
      )}

      {printerName && (
        <Button
          title="Cetak Test"
          variant="outline"
          onPress={handlePrintTest}
          style={{ marginTop: 8 }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  printerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
