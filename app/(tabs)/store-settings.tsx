import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useLockOrientation } from '@/hooks/use-orientation';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function StoreSettingsScreen() {
  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const { storeName, businessType, loadSettings, saveSettings } = useSettingsStore();

  const [name, setName] = useState(storeName);
  const [type, setType] = useState(businessType);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings(db);
  }, [db, loadSettings]);

  useEffect(() => {
    setName(storeName);
    setType(businessType);
  }, [storeName, businessType]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Nama toko tidak boleh kosong');
      return;
    }
    if (!type.trim()) {
      Alert.alert('Error', 'Jenis usaha tidak boleh kosong');
      return;
    }

    setSaving(true);
    try {
      await saveSettings(db, name.trim(), type.trim());
      Alert.alert('Berhasil', 'Pengaturan toko disimpan');
      router.back();
    } catch {
      Alert.alert('Error', 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <IconSymbol name="chevron.left" size={18} color={Colors.tint} />
          <ThemedText style={{ color: Colors.tint, fontWeight: '600' }}>Kembali</ThemedText>
        </View>
      </Pressable>

      <ThemedText type="title" style={{ marginBottom: 20 }}>Atur Toko</ThemedText>

      <Card padding={16} style={{ gap: 16 }}>
        <View style={{ gap: 6 }}>
          <ThemedText type="defaultSemiBold" style={{ fontSize: 13, color: Colors.placeholder }}>
            Nama Toko
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Contoh: Toko Sembako Berkah"
            placeholderTextColor={Colors.muted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={{ gap: 6 }}>
          <ThemedText type="defaultSemiBold" style={{ fontSize: 13, color: Colors.placeholder }}>
            Jenis Usaha
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Contoh: Toko Sembako, Rumah Makan, Kafe"
            placeholderTextColor={Colors.muted}
            value={type}
            onChangeText={setType}
          />
        </View>

        <Button
          title={saving ? 'Menyimpan...' : 'Simpan'}
          onPress={handleSave}
          disabled={saving}
        />
      </Card>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  backRow: { marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
});
