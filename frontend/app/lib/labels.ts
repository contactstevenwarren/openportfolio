// Human-readable labels for snake_case taxonomy values used across the UI.
//
// Kept frontend-only because the canonical storage is snake_case (YAML,
// DB, API). This module only affects *display*. Two knobs:
//   - LABEL_OVERRIDES: per-token acronym/name mapping ("us" -> "US").
//   - LABEL_FULL_OVERRIDES: explicit whole-string overrides for cases
//     the token approach can't handle naturally.
//
// Anything not listed falls back to Title Case ("us_large_cap" ->
// "US Large Cap"). When YAML grows a new bucket, add the acronym here
// once and it renders correctly everywhere.

const LABEL_OVERRIDES: Record<string, string> = {
  us: 'US',
  intl: 'Intl',
  tips: 'TIPS',
  cd: 'CD',
  hsa: 'HSA',
  espp: 'ESPP',
  etf: 'ETF',
  reit: 'REIT',
  ira: 'IRA',
  '401k': '401(k)',
  '529': '529',
  roth: 'Roth',
};

const LABEL_FULL_OVERRIDES: Record<string, string> = {
  us_tips: 'US TIPS',
  us_aggregate: 'US Aggregate',
  us_short_treasury: 'US Short Treasury',
  us_long_treasury: 'US Long Treasury',
  us_treasury: 'US Treasury',
  us_corporate: 'US Corporate',
  us_municipal: 'US Municipal',
  us_large_cap: 'US Large Cap',
  us_mid_cap: 'US Mid Cap',
  us_small_cap: 'US Small Cap',
  us_total_market: 'US Total Market',
  us_value: 'US Value',
  us_growth: 'US Growth',
  intl_developed: 'Intl Developed',
  intl_emerging: 'Intl Emerging',
  roth_ira: 'Roth IRA',
  hsa_cash: 'HSA Cash',
  real_estate: 'Real Estate',
  fixed_income: 'Fixed Income',
  other: 'Other',
  global: 'Global',
};

export function humanize(key: string | null | undefined): string {
  if (key == null || key === '') return '—';
  const lower = key.toLowerCase();
  if (LABEL_FULL_OVERRIDES[lower]) return LABEL_FULL_OVERRIDES[lower];
  return lower
    .split('_')
    .map((part) => {
      if (LABEL_OVERRIDES[part]) return LABEL_OVERRIDES[part];
      if (!part) return '';
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

// Region values used across allocation ring-2 and classification forms.
// Fixed set -- user-entered typos split the ring incorrectly, so this
// is an enum, not free text. Empty string means "no region" for
// non-equity assets (gold, real estate without region, etc.).
export const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— (none)' },
  { value: 'US', label: 'US' },
  { value: 'intl_developed', label: 'Intl Developed' },
  { value: 'intl_emerging', label: 'Intl Emerging' },
  { value: 'global', label: 'Global' },
  { value: 'other', label: 'Other' },
];
