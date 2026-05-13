/**
 * Shared number formatting (see docs/brand.md § Numbers & dates).
 * Fraction inputs are 0–1 unless documented otherwise.
 */

export function formatPct(value: number, opts: { signed?: boolean; digits?: number } = {}) {
  const { signed, digits = 1 } = opts;
  const sign = signed && value > 0 ? "+" : "";
  return sign + (value * 100).toFixed(digits) + "%";
}
