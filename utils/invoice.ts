/** Use the saved local transaction date, never the date a receipt is printed. */
export function formatInvoice(invoiceDate: string, sequence: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(invoiceDate);
  if (!match || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Nomor atau tanggal invoice tidak valid.');
  }
  const [, year, month, day] = match;
  return `INV-${day}${month}${year.slice(-2)}-${sequence.toString().padStart(3, '0')}`;
}

export function parseLocalDateTime(value: string): Date {
  // SQLite saves local wall time without an offset. Make that explicit for JS.
  return new Date(value.includes('T') ? value : value.replace(' ', 'T'));
}
