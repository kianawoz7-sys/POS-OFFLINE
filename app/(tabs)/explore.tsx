import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useLockOrientation } from '@/hooks/use-orientation';
import { useProductStore, type Product } from '@/stores/productStore';
import { Colors, Shadows } from '@/constants/theme';
import { parseRupiahInput } from '@/utils/money';

export default function ProductsScreen() {
  useLockOrientation(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { products, loadProducts, addProduct, updateProduct, deleteProduct } =
    useProductStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [imagePath, setImagePath] = useState('');

  useEffect(() => {
    loadProducts(db).catch((error) => {
      console.error('load products failed:', error);
      Alert.alert('Gagal memuat produk', 'Silakan buka kembali halaman produk.');
    });
  }, [db, loadProducts]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      legacy: true,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      const ext = uri.split('.').pop() ?? 'jpg';
      const dir = new Directory(Paths.document, 'products');
      dir.create({ intermediates: true, idempotent: true });
      const file = new File(dir, `${Date.now()}.${ext}`);
      const source = new File(uri);
      source.copy(file);
      setImagePath(file.uri);
    }
  };

  const openAdd = () => {
    setEditingProduct(null);
    setName('');
    setPrice('');
    setImagePath('');
    setModalVisible(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setPrice(product.price.toString());
    setImagePath(product.image_path);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const amount = parseRupiahInput(price);
    if (!name.trim()) {
      Alert.alert('Data tidak valid', 'Nama produk harus diisi.');
      return;
    }
    if (amount === null) {
      Alert.alert('Harga tidak valid', 'Masukkan Rupiah bulat, misalnya 13000 atau 13.000.');
      return;
    }
    try {
      const product = { name: name.trim(), price: amount, image_path: imagePath };
      if (editingProduct) {
        await updateProduct(db, editingProduct.id, product);
      } else {
        await addProduct(db, product);
      }
      setModalVisible(false);
    } catch (error) {
      console.error('save product failed:', error);
      Alert.alert('Gagal menyimpan produk', 'Periksa daftar produk sebelum mencoba menyimpan lagi.');
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Hapus Produk', 'Yakin ingin menghapus produk ini?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => {
        deleteProduct(db, id).catch((error) => {
          console.error('delete product failed:', error);
          Alert.alert('Gagal menghapus produk', 'Silakan periksa daftar produk dan coba lagi.');
        });
      } },
    ]);
  };

  return (
    <ThemedView style={[styles.container, { paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <View style={styles.header}>
        <ThemedText type="title">Produk</ThemedText>
        <Button title="+ Tambah" size="sm" onPress={openAdd} />
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.productItem} padding={12}>
            <View style={styles.productRow}>
              {item.image_path ? (
                <Image source={{ uri: item.image_path }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <ThemedText style={{ color: Colors.muted, fontSize: 10 }}>{'\u{1F5BC}'}</ThemedText>
                </View>
              )}
              <View style={styles.productInfo}>
                <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
                <ThemedText style={{ color: Colors.placeholder }}>
                  Rp {item.price.toLocaleString('id-ID')}
                </ThemedText>
              </View>
              <View style={styles.productActions}>
                <Pressable style={styles.iconBtn} onPress={() => openEdit(item)}>
                  <ThemedText style={{ color: Colors.tint, fontSize: 16 }}>{'\u270F'}</ThemedText>
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => handleDelete(item.id)}>
                  <ThemedText style={{ color: Colors.danger, fontSize: 16 }}>{'\u{1F5D1}'}</ThemedText>
                </Pressable>
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={'\u{1F4E6}'}
            title="Belum ada produk"
            subtitle="Tambah produk baru untuk memulai"
          />
        }
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <ThemedView style={styles.modalOverlay}>
          <Card style={styles.modalContent} padding={24}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ThemedText style={{ fontSize: 20, lineHeight: 22 }}>{'\u{1F4E6}'}</ThemedText>
                <ThemedText type="subtitle">
                  {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
                </ThemedText>
              </View>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <ThemedText style={{ fontSize: 18, lineHeight: 20, color: Colors.muted }}>{'\u2716'}</ThemedText>
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Nama Produk</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="cth: Nasi Goreng"
                placeholderTextColor={Colors.disabled}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Harga</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="cth: 15000"
                placeholderTextColor={Colors.disabled}
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
              />
            </View>

            <View style={styles.imageSection}>
              <ThemedText style={styles.label}>Foto Produk</ThemedText>
              <Pressable style={styles.imagePickerBtn} onPress={pickImage}>
                <ThemedText style={{ fontSize: 24, lineHeight: 28 }}>{'\u{1F4F7}'}</ThemedText>
                <ThemedText style={{ color: Colors.placeholder, fontSize: 13 }}>
                  {imagePath ? 'Ganti Gambar' : 'Pilih dari Galeri'}
                </ThemedText>
              </Pressable>
              {imagePath ? (
                <View style={styles.previewWrapper}>
                  <Image source={{ uri: imagePath }} style={styles.preview} />
                </View>
              ) : null}
            </View>

            <View style={styles.modalActions}>
              <Button title="Batal" variant="secondary" size="sm" onPress={() => setModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Simpan" size="sm" onPress={handleSave} style={{ flex: 1 }} />
            </View>
          </Card>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  list: { paddingBottom: 16, gap: 8 },
  productItem: {},
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  thumbPlaceholder: {
    backgroundColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: { flex: 1, gap: 2 },
  productActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '85%',
    maxWidth: 420,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.placeholder,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  imageSection: {
    gap: 8,
  },
  imagePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderStyle: 'dashed',
    backgroundColor: '#fafafa',
  },
  previewWrapper: {
    alignItems: 'center',
    ...Shadows.sm,
  },
  preview: { width: 120, height: 120, borderRadius: 12 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
