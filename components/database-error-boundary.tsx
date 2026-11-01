import { Component, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export class DatabaseErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Database initialization failed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Database belum dapat dibuka</Text>
            <Text>{this.state.error.message}</Text>
            <Text>Jangan hapus data aplikasi. Simpan database lama sebelum melakukan perbaikan.</Text>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}
