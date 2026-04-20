// Thin typed client for the OpenPortfolio backend.
//
// Admin token is kept in localStorage for v0.1 (single-user). On first
// API call we prompt for it once; a 401 clears the stored token so the
// user gets re-prompted. v0.2's Auth.js migration replaces this module.

const TOKEN_KEY = 'openportfolio.admin_token';

export type ExtractedPosition = {
  ticker: string;
  shares: number;
  cost_basis: number | null;
  market_value: number | null;
  confidence: number;
  source_span: string;
  validation_errors: string[];
};

export type ExtractionResult = {
  positions: ExtractedPosition[];
  model: string;
  extracted_at: string;
};

export type Account = {
  id: number;
  label: string;
  type: string;
  currency: string;
};

export type InlineClassification = {
  asset_class: string;
  sub_class?: string | null;
  sector?: string | null;
  region?: string | null;
};

export type CommitPosition = {
  ticker: string;
  shares: number;
  cost_basis: number | null;
  market_value: number | null;
  confidence: number;
  source_span: string;
  // Set by /manual so the commit also writes a Classification row and
  // resolves ticker collisions server-side. Leave undefined on paste.
  classification?: InlineClassification;
};

export type CommitRequest = {
  account_id: number | null;
  source: string;
  positions: CommitPosition[];
};

export type CommitResult = {
  account_id: number;
  position_ids: number[];
  // Server-resolved final tickers (auto-suffixed on collision).
  tickers: string[];
};

export type AllocationSlice = {
  name: string;
  value: number;
  pct: number;
  tickers: string[];
  children?: AllocationSlice[];
};

export type FiveNumberSummary = {
  net_worth: number;
  cash_pct: number;
  us_equity_pct: number;
  intl_equity_pct: number;
  alts_pct: number;
};

export type AllocationResult = {
  total: number;
  by_asset_class: AllocationSlice[];
  unclassified_tickers: string[];
  summary?: FiveNumberSummary;
  // Per-ticker classification provenance: "yaml" | "user" | "prefix".
  // Drives sunburst hover tooltip provenance labels.
  classification_sources: Record<string, string>;
};

export type BreakdownBucket = {
  bucket: string;
  weight: number;
};

export type FundBreakdown = {
  region: BreakdownBucket[];
  sub_class: BreakdownBucket[];
  sector: BreakdownBucket[];
};

export type ClassificationRow = {
  ticker: string;
  asset_class: string;
  sub_class: string | null;
  sector: string | null;
  region: string | null;
  source: 'yaml' | 'user';
  overrides_yaml: boolean;
  // True when a look-through breakdown exists for this ticker (VT, VTI, ...).
  // The UI replaces the misleading single-bucket sub_class/sector/region
  // cells with an "Auto-split" label so users understand the engine
  // isn't treating VT as "Global" at allocation time.
  has_breakdown: boolean;
  // Full look-through composition, mirroring data/lookthrough.yaml.
  // Each dimension is weight-sorted descending; empty dimensions stay
  // as empty arrays. Null when the ticker has no lookthrough entry.
  breakdown: FundBreakdown | null;
};

export type ClassificationPatch = {
  asset_class: string;
  sub_class?: string | null;
  sector?: string | null;
  region?: string | null;
};

export type TaxonomyOption = {
  value: string;
  label: string;
};

export type Taxonomy = {
  asset_classes: TaxonomyOption[];
};

export type Position = {
  id: number;
  account_id: number;
  ticker: string;
  shares: number;
  cost_basis: number | null;
  market_value: number | null;
  as_of: string;
  source: string;
};

export type PositionPatch = {
  ticker?: string;
  shares?: number;
  cost_basis?: number | null;
  market_value?: number | null;
};

function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  let token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = window.prompt('Admin token:') ?? '';
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

function clearAdminToken(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': getAdminToken(),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearAdminToken();
    throw new Error('Admin token rejected. Reload the page to re-enter.');
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  extract: (text: string) =>
    fetchJson<ExtractionResult>('/api/extract', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  commit: (body: CommitRequest) =>
    fetchJson<CommitResult>('/api/positions/commit', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  accounts: () => fetchJson<Account[]>('/api/accounts'),
  createAccount: (body: { label: string; type?: string }) =>
    fetchJson<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patchAccount: (id: number, patch: { label?: string; type?: string }) =>
    fetchJson<Account>(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteAccount: (id: number) =>
    fetchJson<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  allocation: () => fetchJson<AllocationResult>('/api/allocation'),
  positions: () => fetchJson<Position[]>('/api/positions'),
  patchPosition: (id: number, patch: PositionPatch) =>
    fetchJson<Position>(`/api/positions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deletePosition: (id: number) =>
    fetchJson<void>(`/api/positions/${id}`, { method: 'DELETE' }),
  classifications: () => fetchJson<ClassificationRow[]>('/api/classifications'),
  taxonomy: () => fetchJson<Taxonomy>('/api/classifications/taxonomy'),
  patchClassification: (ticker: string, patch: ClassificationPatch) =>
    fetchJson<ClassificationRow>(`/api/classifications/${encodeURIComponent(ticker)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteClassification: (ticker: string) =>
    fetchJson<void>(`/api/classifications/${encodeURIComponent(ticker)}`, {
      method: 'DELETE',
    }),
};
