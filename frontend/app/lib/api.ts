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
  /** false = paste/market ticker (no suffix; skip DB row if exists / YAML match) */
  auto_suffix?: boolean;
  suggestion_confidence?: number | null;
  suggestion_reasoning?: string | null;
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

export type DriftBand = 'on_target' | 'minor' | 'major';

export type AllocationSlice = {
  name: string;
  value: number;
  pct: number;
  tickers: string[];
  children?: AllocationSlice[];
  sector_breakdown?: AllocationSlice[];
  target_pct?: number | null;
  drift_pct?: number | null;
  drift_band?: DriftBand;
};

// Deprecated on the hero in v0.1.6 (donut redesign). Shape is still on the
// response for backward compat with any external tooling.
export type FiveNumberSummary = {
  net_worth: number;
  cash_pct: number;
  us_equity_pct: number;
  intl_equity_pct: number;
  alts_pct: number;
};

export type DriftThresholds = {
  minor_pct: number;
  major_pct: number;
};

export type AllocationResult = {
  total: number;
  by_asset_class: AllocationSlice[];
  unclassified_tickers: string[];
  summary?: FiveNumberSummary;
  // Per-ticker classification provenance: "yaml" | "user" | "prefix".
  // Drives sunburst hover tooltip provenance labels.
  classification_sources: Record<string, string>;
  max_drift?: number | null;
  max_drift_band?: DriftBand;
  /** When absent, UI uses 1% / 3% absolute drift for band thresholds. */
  drift_thresholds?: DriftThresholds;
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

export type ClassificationSuggestItem = {
  ticker: string;
  source: 'existing' | 'llm' | 'none';
  asset_class?: string | null;
  sub_class?: string | null;
  sector?: string | null;
  region?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
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

export type TargetRow = { path: string; pct: number };

export type TargetsPayload = { root: TargetRow[]; groups: Record<string, TargetRow[]> };

// v0.5 rebalance recommendations.
export type RebalanceDirection = 'buy' | 'sell' | 'hold';
export type RebalanceMode = 'full' | 'new_money';

export type RebalanceMove = {
  path: string;
  direction: RebalanceDirection;
  delta_usd: number;
  target_pct: number;
  actual_pct: number;
  // Net worth at L1; asset-class dollar value at L2. Divide
  // delta_usd / parent_total_usd * 100 to recover drift-as-% of parent.
  parent_total_usd: number;
  children: RebalanceMove[];
};

export type RebalanceResult = {
  mode: RebalanceMode;
  total: number;
  contribution_usd: number | null;
  moves: RebalanceMove[];
};

// 409 body from /api/rebalance when L2 targets no longer cover every
// funded sub-class (user added a new holding since targets were saved).
export type StaleTargetsError = {
  error: 'stale_targets';
  asset_class: string;
  missing_paths: string[];
  extra_paths: string[];
};

export class RebalanceStaleTargetsError extends Error {
  detail: StaleTargetsError;
  constructor(detail: StaleTargetsError) {
    super(`stale targets on ${detail.asset_class}`);
    this.detail = detail;
    this.name = 'RebalanceStaleTargetsError';
  }
}

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
  getTargets: async (): Promise<TargetsPayload> => {
    if (typeof window === 'undefined') return { root: [], groups: {} };
    try {
      const res = await fetch('/api/targets', {
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': getAdminToken(),
        },
      });
      if (res.status === 401) {
        clearAdminToken();
        throw new Error('Admin token rejected. Reload the page to re-enter.');
      }
      if (res.status === 404) return { root: [], groups: {} };
      if (!res.ok) return { root: [], groups: {} };
      return (await res.json()) as TargetsPayload;
    } catch (e) {
      if (e instanceof Error && e.message.includes('Admin token')) throw e;
      return { root: [], groups: {} };
    }
  },
  putTargets: (body: TargetsPayload) =>
    fetchJson<TargetsPayload>('/api/targets', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  rebalance: async (
    mode: RebalanceMode,
    amount?: number,
  ): Promise<RebalanceResult> => {
    const qs = new URLSearchParams({ mode });
    if (mode === 'new_money' && amount != null) qs.set('amount', String(amount));
    const res = await fetch(`/api/rebalance?${qs.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': getAdminToken(),
      },
    });
    if (res.status === 401) {
      clearAdminToken();
      throw new Error('Admin token rejected. Reload the page to re-enter.');
    }
    if (res.status === 409) {
      // FastAPI wraps our detail object under {"detail": ...}.
      const body = (await res.json()) as { detail?: StaleTargetsError };
      if (body?.detail?.error === 'stale_targets') {
        throw new RebalanceStaleTargetsError(body.detail);
      }
      throw new Error(`API 409: ${JSON.stringify(body)}`);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as RebalanceResult;
  },
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
  suggestClassifications: (tickers: string[]) =>
    fetchJson<ClassificationSuggestItem[]>('/api/classifications/suggest', {
      method: 'POST',
      body: JSON.stringify({ tickers }),
    }),
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
