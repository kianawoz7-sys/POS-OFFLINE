/** Accept whole Rupiah, with optional Indonesian thousands separators. */
export function parseRupiahInput(input: string): number | null {
  const value = input.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value)) return null;

  const amount = Number(value.replace(/\./g, ''));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function assertRupiah(amount: number, label = 'Nominal', allowZero = true): void {
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(`${label} harus berupa Rupiah bulat ${allowZero ? 'nol atau lebih' : 'lebih dari nol'}.`);
  }
}
