import { BluetoothEscposPrinter } from '@vardrz/react-native-bluetooth-escpos-printer';
import { parseLocalDateTime } from '@/utils/invoice';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const W = 32;
const DIVIDER = '='.repeat(W);
const THIN = '-'.repeat(W);

function formatDate(date: string): string {
  const d = parseLocalDateTime(date);
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes}`;
}

function formatRupiah(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatItemLine(name: string, qty: number): string {
  const label = name.length > 22 ? name.slice(0, 20) + '..' : name;
  const qtyStr = qty.toString() + 'x';
  return label.padEnd(24) + qtyStr.padStart(6);
}

function formatPriceLine(price: number, subtotal: number): string {
  const left = formatRupiah(price);
  const right = formatRupiah(subtotal);
  const gap = W - left.length - right.length;
  return '  ' + left + ' '.repeat(Math.max(1, gap - 2)) + right;
}

function formatTotal(label: string, value: string): string {
  const gap = W - label.length - value.length;
  return label + ' '.repeat(Math.max(1, gap)) + value;
}

interface PrintItem {
  product_name: string;
  quantity: number;
  product_price: number;
  subtotal: number;
}

interface PrintParams {
  invoiceNumber: string;
  createdAt: string;
  items: PrintItem[];
  total: number;
  paymentMethod: string;
  paymentAmount: number;
  change: number;
  storeName?: string;
  storeAddress?: string;
}

export async function printReceipt(params: PrintParams): Promise<void> {
  const storeName = params.storeName ?? 'POS Offline';
  const storeAddress = params.storeAddress ?? 'Toko';

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText(storeName + '\n', {});
  await BluetoothEscposPrinter.printText(storeAddress + '\n', {});
  await BluetoothEscposPrinter.printText('\n', {});
  await BluetoothEscposPrinter.printText(DIVIDER + '\n', {});
  await BluetoothEscposPrinter.printText(params.invoiceNumber + '\n', {});
  await BluetoothEscposPrinter.printText(formatDate(params.createdAt) + '\n', {});

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
  await BluetoothEscposPrinter.printText(THIN + '\n', {});

  for (const item of params.items) {
    await BluetoothEscposPrinter.printText(formatItemLine(item.product_name, item.quantity) + '\n', {});
    await BluetoothEscposPrinter.printText(formatPriceLine(item.product_price, item.subtotal) + '\n', {});
  }

  await BluetoothEscposPrinter.printText(THIN + '\n', {});
  await BluetoothEscposPrinter.printText(formatTotal('Total', formatRupiah(params.total)) + '\n', {});
  const payLabel = params.paymentMethod === 'tunai' ? 'Tunai' : 'QRIS';
  await BluetoothEscposPrinter.printText(formatTotal(payLabel, formatRupiah(params.paymentAmount)) + '\n', {});
  await BluetoothEscposPrinter.printText(formatTotal('Kembalian', formatRupiah(params.change)) + '\n', {});

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText(DIVIDER + '\n', {});
  await BluetoothEscposPrinter.printText('Terima Kasih!\n', {});
  await BluetoothEscposPrinter.printText('Silahkan Datang Kembali\n', {});

  await BluetoothEscposPrinter.printAndFeed(4);
  await BluetoothEscposPrinter.cutOnePoint();
}
