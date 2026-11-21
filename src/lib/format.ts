/**
 * Formats an auction value given in lakhs (e.g. 20 -> "₹20 L", 150 -> "₹1.5 Cr").
 */
export function formatLakhs(n: number): string {
  if (!Number.isFinite(n)) {
    return '₹0 L';
  }

  if (n < 100) {
    const lakhs = Number.isInteger(n) ? n : Number(n.toFixed(2));
    return `₹${lakhs} L`;
  }

  const crores = Number((n / 100).toFixed(2));
  return `₹${crores} Cr`;
}
