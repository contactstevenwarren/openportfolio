// Human-readable labels for snake_case values used across the UI (account types,
// etc.). Canonical taxonomy strings from the API are plain English — no mapping.
//
// Anything not listed falls back to Title Case (snake_case -> "Hello World").

const LABEL_OVERRIDES: Record<string, string> = {
  ira: "IRA",
  roth: "Roth",
  hsa: "HSA",
  espp: "ESPP",
  "401k": "401(k)",
  "529": "529",
};

const LABEL_FULL_OVERRIDES: Record<string, string> = {
  roth_ira: "Roth IRA",
};

export function humanize(key: string | null | undefined): string {
  if (key == null || key === "") return "—";
  const lower = key.toLowerCase();
  if (LABEL_FULL_OVERRIDES[lower]) return LABEL_FULL_OVERRIDES[lower];
  return lower
    .split("_")
    .map((part) => {
      if (LABEL_OVERRIDES[part]) return LABEL_OVERRIDES[part];
      if (!part) return "";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

// Region values used across allocation ring-2 and classification forms.
// Fixed set -- user-entered typos split the ring incorrectly, so this
// is an enum, not free text. Empty string means "no region" for
// non-equity assets (gold, real estate without region, etc.).
export const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— (none)" },
  { value: "US", label: "US" },
  { value: "intl_developed", label: "Intl Developed" },
  { value: "intl_emerging", label: "Intl Emerging" },
  { value: "global", label: "Global" },
  { value: "other", label: "Other" },
];

export function formatUSD(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUSDCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
