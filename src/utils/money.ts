/** Money helpers. All monetary values are stored as Decimal in the DB. */

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value ?? 0);
}

export function roundMoney(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatMoney(value: number, currency = "NGN", locale = "en-NG"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function percentage(part: number, whole: number): number {
  if (whole === 0) return 0;
  return roundMoney((part / whole) * 100);
}
