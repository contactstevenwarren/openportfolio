'use client';

// Paste review-and-confirm flow (docs/architecture.md extraction pipeline).
// User pastes broker text -> Extract -> rows land in the review table
// sorted by confidence ascending so the riskiest ones are on top ->
// user edits / deselects -> Commit persists selected rows with a
// provenance row per numeric field.

import { useEffect, useState } from 'react';

import {
  api,
  type Account,
  type ClassificationSuggestItem,
  type ExtractedPosition,
  type Taxonomy,
} from '../lib/api';
import { Provenance } from '../lib/provenance';
import { scrubPaste } from '../lib/scrub';

export default function PastePage() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ExtractedPosition[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [suggestionByTicker, setSuggestionByTicker] = useState<
    Record<string, ClassificationSuggestItem>
  >({});
  const [assetClassByIndex, setAssetClassByIndex] = useState<Record<number, string>>({});

  useEffect(() => {
    refreshAccounts();
  }, []);

  function refreshAccounts() {
    api
      .accounts()
      .then(setAccounts)
      .catch(() => {
        // Admin token not yet set or rejected; user can still try extract.
      });
  }

  async function refreshClassificationHintsFor(currentRows: ExtractedPosition[]) {
    const tickers = [...new Set(currentRows.map((r) => r.ticker.trim()).filter(Boolean))];
    if (tickers.length === 0) {
      setSuggestionByTicker({});
      setAssetClassByIndex({});
      return;
    }
    let tax = taxonomy;
    if (!tax) {
      tax = await api.taxonomy();
      setTaxonomy(tax);
    }
    const items = await api.suggestClassifications(tickers);
    const map: Record<string, ClassificationSuggestItem> = {};
    for (const it of items) {
      map[it.ticker] = it;
    }
    setSuggestionByTicker(map);
    const picks: Record<number, string> = {};
    currentRows.forEach((r, i) => {
      const s = map[r.ticker.trim()];
      if (s && (s.source === 'llm' || s.source === 'existing') && s.asset_class) {
        picks[i] = s.asset_class;
      } else {
        picks[i] = '';
      }
    });
    setAssetClassByIndex(picks);
  }

  async function handleExtract() {
    if (!text.trim()) return;
    setBusy(true);
    setStatus(null);
    const { text: scrubbed, redactions } = scrubPaste(text);
    try {
      const result = await api.extract(scrubbed);
      const sorted = [...result.positions].sort((a, b) => a.confidence - b.confidence);
      setRows(sorted);
      setSelected(new Set(sorted.map((_, i) => i)));
      let hintErr: string | null = null;
      try {
        await refreshClassificationHintsFor(sorted);
      } catch (e) {
        hintErr = (e as Error).message;
      }
      if (hintErr) {
        setStatus({
          kind: 'err',
          message: `Extract ok, but classification hints failed: ${hintErr}`,
        });
      } else if (redactions > 0) {
        setStatus({
          kind: 'ok',
          message: `Redacted ${redactions} digit run(s) of 6+ before sending (account numbers, SSNs, etc.).`,
        });
      }
    } catch (e) {
      setStatus({ kind: 'err', message: `Extract failed: ${(e as Error).message}` });
      setRows([]);
      setSelected(new Set());
      setSuggestionByTicker({});
      setAssetClassByIndex({});
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshHints() {
    if (rows.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      await refreshClassificationHintsFor(rows);
      setStatus({ kind: 'ok', message: 'Classification hints refreshed.' });
    } catch (e) {
      setStatus({ kind: 'err', message: `Hints failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    setStatus(null);
    try {
      if (!taxonomy) {
        setTaxonomy(await api.taxonomy());
      }
      const result = await api.commit({
        account_id: accountId,
        source: `paste:${new Date().toISOString().slice(0, 10)}`,
        positions: rows
          .map((r, i) => ({ r, i }))
          .filter(({ i }) => selected.has(i))
          .map(({ r, i }) => {
            const ac = assetClassByIndex[i]?.trim();
            const sug = suggestionByTicker[r.ticker.trim()];
            const base = {
              ticker: r.ticker,
              shares: r.shares,
              cost_basis: r.cost_basis,
              market_value: r.market_value,
              confidence: r.confidence,
              source_span: r.source_span,
            };
            if (!ac) {
              return base;
            }
            return {
              ...base,
              classification: {
                asset_class: ac,
                sub_class: null,
                sector: null,
                region: null,
                auto_suffix: false,
                suggestion_confidence: sug?.source === 'llm' ? sug.confidence ?? null : null,
                suggestion_reasoning: sug?.source === 'llm' ? sug.reasoning ?? null : null,
              },
            };
          }),
      });
      setStatus({
        kind: 'ok',
        message: `Committed ${result.position_ids.length} position(s) to account #${result.account_id}.`,
      });
      setRows([]);
      setSelected(new Set());
      setText('');
      setSuggestionByTicker({});
      setAssetClassByIndex({});
      refreshAccounts();
    } catch (e) {
      setStatus({ kind: 'err', message: `Commit failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<ExtractedPosition>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const selectedCount = selected.size;

  return (
    <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <h1>Paste positions</h1>
      <p style={{ color: '#555' }}>
        Paste brokerage holdings below. Every row is reviewed before commit.
      </p>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label>
          Account:{' '}
          <select
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
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
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste brokerage positions here..."
        rows={10}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.9rem',
          padding: '0.5rem',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />

      <div style={{ margin: '0.75rem 0' }}>
        <button onClick={handleExtract} disabled={busy || !text.trim()}>
          {busy ? 'Working...' : 'Extract'}
        </button>
      </div>

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

      {rows.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>
            Review ({rows.length} row{rows.length === 1 ? '' : 's'}, sorted by confidence asc)
          </h2>
          <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Edit tickers? Use &quot;Refresh classification hints&quot; to re-fetch LLM suggestions.
          </p>
          <div style={{ marginBottom: '0.75rem' }}>
            <button type="button" onClick={handleRefreshHints} disabled={busy}>
              Refresh classification hints
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={th}></th>
                  <th style={th}>Ticker</th>
                  <th style={th}>Asset class</th>
                  <th style={th}>Shares</th>
                  <th style={th}>Cost basis</th>
                  <th style={th}>Market value</th>
                  <th style={th}>Confidence</th>
                  <th style={th}>Source span</th>
                  <th style={th}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const sug = suggestionByTicker[r.ticker.trim()];
                  return (
                    <tr
                      key={i}
                      style={{
                        background: rowBg(r.confidence, r.validation_errors.length > 0),
                        borderBottom: '1px solid #eee',
                      }}
                    >
                      <td style={td}>
                        <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                      </td>
                      <td style={td}>
                        <input
                          value={r.ticker}
                          onChange={(e) => updateRow(i, { ticker: e.target.value })}
                          size={10}
                        />
                      </td>
                      <td style={td}>
                        <select
                          value={assetClassByIndex[i] ?? ''}
                          onChange={(e) =>
                            setAssetClassByIndex((prev) => ({
                              ...prev,
                              [i]: e.target.value,
                            }))
                          }
                          style={{ maxWidth: 160 }}
                          disabled={!taxonomy}
                        >
                          <option value="">— Unclassified —</option>
                          {taxonomy?.asset_classes.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <div style={{ fontSize: '0.75rem', color: '#555', marginTop: 4 }}>
                          {sug?.source === 'existing' && (
                            <span title="Bundled YAML or saved row — change to create an override">
                              baseline
                            </span>
                          )}
                          {sug?.source === 'llm' && sug.confidence != null && (
                            <Provenance source="llm-classify" confidence={sug.confidence}>
                              LLM {(sug.confidence * 100).toFixed(0)}%
                            </Provenance>
                          )}
                          {sug?.source === 'none' && <span>no hint</span>}
                        </div>
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          value={r.shares}
                          onChange={(e) => updateRow(i, { shares: Number(e.target.value) })}
                          step="any"
                          style={{ width: 90 }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          value={r.cost_basis ?? ''}
                          onChange={(e) =>
                            updateRow(i, {
                              cost_basis: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          step="any"
                          style={{ width: 100 }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          value={r.market_value ?? ''}
                          onChange={(e) =>
                            updateRow(i, {
                              market_value: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          step="any"
                          style={{ width: 110 }}
                        />
                      </td>
                      <td style={td}>
                        <Provenance source="llm-extract" confidence={r.confidence}>
                          {(r.confidence * 100).toFixed(0)}%
                        </Provenance>
                      </td>
                      <td
                        style={{
                          ...td,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: '0.8rem',
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={r.source_span}
                      >
                        {r.source_span}
                      </td>
                      <td style={{ ...td, color: 'crimson', fontSize: '0.8rem' }}>
                        {r.validation_errors.join('; ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ margin: '1rem 0' }}>
            <button onClick={handleCommit} disabled={busy || selectedCount === 0}>
              {busy ? 'Working...' : `Commit ${selectedCount} row${selectedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.35rem 0.25rem', verticalAlign: 'top' as const };

function rowBg(confidence: number, hasErrors: boolean): string {
  if (hasErrors) return '#fde7ea';
  if (confidence >= 0.95) return '#e7f5e8';
  if (confidence >= 0.8) return '#fffbe0';
  return '#fde7ea';
}
