import { create } from 'zustand';

interface PrinterState {
  printerTarget: string | null;
  printerName: string | null;
  connected: boolean;
  setPrinter: (target: string, name: string) => void;
  setConnected: (connected: boolean) => void;
  disconnect: () => void;
}

export const usePrinterStore = create<PrinterState>((set) => ({
  printerTarget: null,
  printerName: null,
  connected: false,
  setPrinter: (target, name) => set({ printerTarget: target, printerName: name }),
  setConnected: (connected) => set({ connected }),
  disconnect: () => set({ printerTarget: null, printerName: null, connected: false }),
}));
