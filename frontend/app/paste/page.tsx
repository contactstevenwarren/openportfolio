'use client';

// Paste review-and-confirm flow (roadmap section 6 extraction pipeline).
// User pastes broker text -> Extract -> rows land in the review table
// sorted by confidence ascending so the riskiest ones are on top ->
// user edits / deselects -> Commit persists selected rows with a
// provenance row per numeric field.

import { useEffect, useState } from 'react';

import {
  api,
  type Account,
  type ExtractedPosition,
} from '../lib/api';
import { Provenance } from '../lib/provenance';

export default function PastePage() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ExtractedPosition[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

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

  async function handleExtract() {
    if (!text.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.extract(text);
      const sorted = [...result.positions].sort((a, b) => a.confidence - b.confidence);
      setRows(sorted);
      setSelected(new Set(sorted.map((_, i) => i)));
    } catch (e) {
      setStatus({ kind: 'err', message: `Extract failed: ${(e as Error).message}` });
      setRows([]);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    const toCommit = rows.filter((_, i) => selected.has(i));
    if (toCommit.length === 0) {
      setStatus({ kind: 'err', message: 'No rows selected.' });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.commit({
        account_id: accountId,
        source: `paste:${new Date().toISOString().slice(0, 10)}`,
        positions: toCommit.map((r) => ({
          ticker: r.ticker,
          shares: r.shares,
          cost_basis: r.cost_basis,
          market_value: r.market_value,
          confidence: r.confidence,
          source_span: r.source_span,
        })),
      });
      setStatus({
        kind: 'ok',
        message: `Committed ${result.position_ids.length} position(s) to account #${result.account_id}.`,
      });
      setRows([]);
      setSelected(new Set());
      setText('');
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
    <main style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
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

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={th}></th>
                  <th style={th}>Ticker</th>
                  <th style={th}>Shares</th>
                  <th style={th}>Cost basis</th>
                  <th style={th}>Market value</th>
                  <th style={th}>Confidence</th>
                  <th style={th}>Source span</th>
                  <th style={th}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
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
                        maxWidth: 280,
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
                ))}
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
