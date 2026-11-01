import '@vardrz/react-native-bluetooth-escpos-printer';

declare module '@vardrz/react-native-bluetooth-escpos-printer' {
  interface BluetoothEscposPrinterType {
    printerInit(): Promise<void>;
    printerAlign(align: number): Promise<void>;
    printAndFeed(value: number): Promise<void>;
    printColumn(
      widths: number[],
      aligns: number[],
      data: string[],
      options?: Record<string, unknown>
    ): Promise<void>;
    cutOnePoint(): void;
    openDrawer(pin: number, t1: number, t2: number): Promise<void>;
  }

  interface BluetoothManagerType {
    enableBluetooth(): Promise<string[] | boolean>;
    scanDevices(): Promise<string>;
  }
}
