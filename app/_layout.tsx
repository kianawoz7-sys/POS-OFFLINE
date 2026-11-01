import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { migrateDbIfNeeded } from '@/services/database';
import { DatabaseErrorBoundary } from '@/components/database-error-boundary';
import { BackupRuntimeProvider } from '@/components/backup-runtime';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <DatabaseErrorBoundary>
        <SQLite.SQLiteProvider databaseName="pos.db" onInit={migrateDbIfNeeded}>
          <BackupRuntimeProvider>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="transaksi" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
            </SafeAreaView>
            <StatusBar style="dark" />
          </BackupRuntimeProvider>
        </SQLite.SQLiteProvider>
      </DatabaseErrorBoundary>
    </ThemeProvider>
  );
}
