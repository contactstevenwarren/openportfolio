'use client';

// Manual entry for non-brokerage assets (roadmap section 4 in-scope).
// Turns a short form into a committed Position with source="manual" and a
// synthetic ticker like REALESTATE:123Main so the classifier picks it up
// without a YAML edit.

import { useEffect, useState } from 'react';

import { api, type Account } from '../lib/api';

// Mirrors the backend synthetic prefix table in
// backend/app/classifications.py. Keep in sync when either side changes.
type AssetKind =
  | 'REALESTATE'
  | 'GOLD'
  | 'SILVER'
  | 'CRYPTO'
  | 'PRIVATE'
  | 'HSA_CASH'
  | 'CASH'
  | 'TREASURY'
  | 'TIPS'
  | 'CD'
  | 'ESPP';

const KIND_LABELS: Record<AssetKind, string> = {
  REALESTATE: 'Real estate',
  GOLD: 'Gold',
  SILVER: 'Silver',
  CRYPTO: 'Crypto (non-ticker)',
  PRIVATE: 'Private holding',
  HSA_CASH: 'HSA cash sleeve',
  CASH: 'Cash (checking, savings, brokerage sweep)',
  TREASURY: 'Treasury note / bill (held directly)',
  TIPS: 'TIPS (TreasuryDirect)',
  CD: 'CD (FDIC-insured)',
  ESPP: 'Employer stock (ESPP / RSU)',
};

export default function ManualPage() {
  const [kind, setKind] = useState<AssetKind>('REALESTATE');
  const [label, setLabel] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    api
      .accounts()
      .then(setAccounts)
      .catch(() => {
        // Token not set yet; form still usable, commit will surface the error.
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !marketValue) return;
    setBusy(true);
    setStatus(null);

    const ticker = `${kind}:${slug(label)}`;
    const mv = Number(marketValue);
    const cb = costBasis ? Number(costBasis) : null;

    try {
      const result = await api.commit({
        account_id: accountId,
        source: 'manual',
        positions: [
          {
            ticker,
            shares: 1.0,
            cost_basis: cb,
            market_value: mv,
            confidence: 1.0,
            source_span: '',
          },
        ],
      });
      setStatus({
        kind: 'ok',
        message: `Saved ${ticker} ($${mv.toLocaleString()}) to account #${result.account_id}.`,
      });
      setLabel('');
      setMarketValue('');
      setCostBasis('');
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>Manual entry</h1>
      <p style={{ color: '#555' }}>
        For non-brokerage assets: real estate, gold, crypto held outside an exchange,
        private holdings, HSA cash sleeves. Stored with source=manual.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem 1rem',
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: 4,
          background: '#fafafa',
          margin: '1rem 0',
        }}
      >
        <label style={field}>
          <span style={fieldLabel}>Asset type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
            style={input}
          >
            {Object.entries(KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label style={field}>
          <span style={fieldLabel}>Account</span>
          <select
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
            style={input}
          >
            <option value="">
              {accounts.length === 0 ? 'Default (auto-create)' : 'Default (auto-create if none)'}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                #{a.id} {a.label} ({a.type})
              </option>
            ))}
          </select>
        </label>

        <label style={{ ...field, gridColumn: '1 / -1' }}>
          <span style={fieldLabel}>Label (becomes ticker suffix, e.g. "123Main")</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="123Main, physical-bar, solana, etc."
            style={input}
            required
          />
          <span style={{ fontSize: '0.8rem', color: '#888' }}>
            Ticker will be <code>{`${kind}:${slug(label || '<label>')}`}</code>
          </span>
        </label>

        <label style={field}>
          <span style={fieldLabel}>Market value (USD)</span>
          <input
            type="number"
            value={marketValue}
            onChange={(e) => setMarketValue(e.target.value)}
            placeholder="650000"
            style={input}
            step="any"
            min="0"
            required
          />
        </label>

        <label style={field}>
          <span style={fieldLabel}>Cost basis (USD, optional)</span>
          <input
            type="number"
            value={costBasis}
            onChange={(e) => setCostBasis(e.target.value)}
            placeholder="400000"
            style={input}
            step="any"
            min="0"
          />
        </label>

        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" disabled={busy || !label.trim() || !marketValue}>
            {busy ? 'Working...' : 'Save asset'}
          </button>
        </div>
      </form>

      {status && (
        <p
          role="alert"
          style={{
            color: status.kind === 'ok' ? 'green' : 'crimson',
            background: status.kind === 'ok' ? '#e7f5e8' : '#fde7ea',
            padding: '0.5rem 0.75rem',
            borderRadius: 4,
          }}
        >
          {status.message}
        </p>
      )}

      <p style={{ color: '#777', fontSize: '0.85rem' }}>
        Need to edit or delete an existing entry? See <a href="/positions">/positions</a>.
      </p>
    </main>
  );
}

function slug(s: string): string {
  return s.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

const field = { display: 'flex', flexDirection: 'column', gap: 4 } as const;
const fieldLabel = { fontSize: '0.85rem', color: '#333' };
const input = { padding: '0.4rem 0.5rem' } as const;
