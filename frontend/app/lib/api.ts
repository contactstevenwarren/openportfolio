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

export type CommitPosition = {
  ticker: string;
  shares: number;
  cost_basis: number | null;
  market_value: number | null;
  confidence: number;
  source_span: string;
};

export type CommitRequest = {
  account_id: number | null;
  source: string;
  positions: CommitPosition[];
};

export type CommitResult = {
  account_id: number;
  position_ids: number[];
};

export type AllocationSlice = {
  name: string;
  value: number;
  pct: number;
  tickers: string[];
};

export type AllocationResult = {
  total: number;
  by_asset_class: AllocationSlice[];
  unclassified_tickers: string[];
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
  allocation: () => fetchJson<AllocationResult>('/api/allocation'),
};
