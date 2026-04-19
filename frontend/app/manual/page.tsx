'use client';

// Manual entry for non-brokerage assets (v0.1.5 M4 rewrite).
//
// The v0.1 "synthetic prefix" convention (REALESTATE:123Main,
// CRYPTO:solana, ...) is gone: each manual entry now carries its own
// classification, written as a user Classification row in the same
// transaction as the Position. The user picks asset_class from the
// taxonomy endpoint and types sub_class freely. Ticker collisions are
// resolved by the server with an auto-suffix and echoed back in the
// commit response.

import { useEffect, useMemo, useState } from 'react';

import { api, type Account, type ClassificationRow, type TaxonomyOption } from '../lib/api';
import { REGION_OPTIONS } from '../lib/labels';

export default function ManualPage() {
  const [label, setLabel] = useState('');
  const [assetClass, setAssetClass] = useState('real_estate');
  const [subClass, setSubClass] = useState('');
  const [sector, setSector] = useState('');
  const [region, setRegion] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyOption[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    api
      .accounts()
      .then(setAccounts)
      .catch(() => {
        // Token may not be set yet; form still usable, commit will surface the error.
      });
    api
      .taxonomy()
      .then((t) => setTaxonomy(t.asset_classes))
      .catch(() => {});
    // Pull existing classifications so we can suggest sub_class / sector
    // values the user (or the bundled YAML) has already used.
    api.classifications().then(setClassifications).catch(() => {});
  }, []);

  // Datalist options: existing sub_class values for the currently-
  // selected asset_class, and existing sector values (all asset classes;
  // sector is equity-biased but not strictly). Sorted, de-duplicated.
  const subClassSuggestions = useMemo(() => {
    const values = classifications
      .filter((c) => c.asset_class === assetClass && c.sub_class)
      .map((c) => c.sub_class as string);
    return Array.from(new Set(values)).sort();
  }, [classifications, assetClass]);

  const sectorSuggestions = useMemo(() => {
    const values = classifications
      .filter((c) => c.sector)
      .map((c) => c.sector as string);
    return Array.from(new Set(values)).sort();
  }, [classifications]);

  const proposedTicker = useMemo(() => slug(label), [label]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !marketValue || !assetClass) return;
    setBusy(true);
    setStatus(null);

    const mv = Number(marketValue);
    const cb = costBasis ? Number(costBasis) : null;

    try {
      const result = await api.commit({
        account_id: accountId,
        source: 'manual',
        positions: [
          {
            ticker: proposedTicker,
            shares: 1.0,
            cost_basis: cb,
            market_value: mv,
            confidence: 1.0,
            source_span: '',
            classification: {
              asset_class: assetClass,
              sub_class: subClass.trim() || null,
              sector: sector.trim() || null,
              region: region.trim() || null,
            },
          },
        ],
      });
      const finalTicker = result.tickers[0];
      const suffixNote =
        finalTicker !== proposedTicker
          ? ` (ticker auto-suffixed from "${proposedTicker}" to avoid collision)`
          : '';
      setStatus({
        kind: 'ok',
        message: `Saved ${finalTicker} ($${mv.toLocaleString()}) to account #${result.account_id}.${suffixNote}`,
      });
      setLabel('');
      setMarketValue('');
      setCostBasis('');
      setSubClass('');
      setSector('');
      setRegion('');
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
        For non-brokerage assets: real estate, gold, crypto held off an exchange, private
        holdings, HSA cash sleeves, checking accounts. You classify it yourself — the
        sunburst places it immediately.
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
        <label style={{ ...field, gridColumn: '1 / -1' }}>
          <span style={fieldLabel}>Label (becomes the ticker)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="123 Main St, physical-bar, solana..."
            style={input}
            required
          />
          <span style={{ fontSize: '0.8rem', color: '#888' }}>
            Ticker will be <code>{proposedTicker || '<label>'}</code>
            {label && ' (server appends -2, -3 if it collides)'}
          </span>
        </label>

        <label style={field}>
          <span style={fieldLabel}>Asset class</span>
          <select
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value)}
            style={input}
            required
          >
            {taxonomy.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label style={field}>
          <span style={fieldLabel}>Sub-class (free text, suggestions below)</span>
          <input
            value={subClass}
            onChange={(e) => setSubClass(e.target.value)}
            list="manual-subclass"
            placeholder="direct, gold, wine, hsa_cash..."
            style={input}
          />
          <datalist id="manual-subclass">
            {subClassSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <label style={field}>
          <span style={fieldLabel}>Sector (optional)</span>
          <input
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            list="manual-sector"
            placeholder="technology, real_estate..."
            style={input}
          />
          <datalist id="manual-sector">
            {sectorSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <label style={field}>
          <span style={fieldLabel}>Region (optional)</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={input}
          >
            {REGION_OPTIONS.map((o) => (
              <option key={o.value || 'none'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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

        <label style={{ ...field, gridColumn: '1 / -1' }}>
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

        <div style={{ gridColumn: '1 / -1' }}>
          <button
            type="submit"
            disabled={busy || !label.trim() || !marketValue || !assetClass}
          >
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
        Want to reclassify later? Edit any ticker on{' '}
        <a href="/classifications">/classifications</a>. Edit or delete entries on{' '}
        <a href="/positions">/positions</a>.
      </p>
    </main>
  );
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

const field = { display: 'flex', flexDirection: 'column', gap: 4 } as const;
const fieldLabel = { fontSize: '0.85rem', color: '#333' };
const input = { padding: '0.4rem 0.5rem' } as const;
