import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Colors } from '@/constants/theme';
import { useLockOrientation } from '@/hooks/use-orientation';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const menuItems = [
  { label: 'Laporan', icon: '\u{1F4CA}', route: '/(tabs)/reports' as const },
  { label: 'Printer', icon: '\u{1F5A8}\u{FE0F}', route: '/(tabs)/printer' as const },
  { label: 'Atur Toko', icon: '\u{1F3EA}', route: '/(tabs)/store-settings' as const },
  { label: 'Backup & Restore', icon: '\u{1F4BE}', route: '/(tabs)/backup' as const },
];

export default function SettingsScreen() {
  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <ThemedText type="title" style={{ marginBottom: 20 }}>Pengaturan</ThemedText>

      <View style={{ gap: 10 }}>
        {menuItems.map((item) => (
          <Pressable key={item.label} onPress={() => router.push(item.route)}>
            <Card padding={16} style={styles.menuItem}>
              <ThemedText style={{ fontSize: 28 }}>{item.icon}</ThemedText>
              <ThemedText type="defaultSemiBold" style={{ fontSize: 16, flex: 1 }}>{item.label}</ThemedText>
              <ThemedText style={{ fontSize: 20, color: Colors.muted }}>{'\u203A'}</ThemedText>
            </Card>
          </Pressable>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
});
