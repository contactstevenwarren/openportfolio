'use client';

// Committed positions list with inline edit, filters, and batch delete
// (v0.1.5 M5). Primary use case after a paste commit: skim, fix a few
// wrong values, delete anything the LLM hallucinated. Filter by
// account / source / date range narrows the view; batch checkbox +
// "Delete selected" makes cleanup fast without N confirm dialogs.

import { useEffect, useMemo, useState } from 'react';

import { api, type Account, type ClassificationRow, type Position } from '../lib/api';
import { humanize } from '../lib/labels';
import { Provenance } from '../lib/provenance';

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Position>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyBatch, setBusyBatch] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Filters. ticker and account filters are populated from query params
  // when navigating in from /classifications or /accounts so the link
  // lands on the filtered view.
  const [filterAccountId, setFilterAccountId] = useState<number | 'all'>('all');
  const [filterSource, setFilterSource] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterTicker, setFilterTicker] = useState('');

  useEffect(() => {
    refresh();
    api.accounts().then(setAccounts).catch(() => {});
    api.classifications().then(setClassifications).catch(() => {});
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('ticker');
      if (t) setFilterTicker(t);
      const a = params.get('account');
      if (a) setFilterAccountId(Number(a));
    }
  }, []);

  const classificationByTicker = useMemo(() => {
    const m = new Map<string, ClassificationRow>();
    for (const c of classifications) m.set(c.ticker, c);
    return m;
  }, [classifications]);

  function refresh() {
    api
      .positions()
      .then((rows) => {
        setPositions(rows);
        const next: Record<number, Position> = {};
        for (const p of rows) next[p.id] = { ...p };
        setDrafts(next);
        setSelected(new Set());
      })
      .catch((e) => setStatus({ kind: 'err', message: (e as Error).message }));
  }

  const filtered = useMemo(() => {
    const srcQuery = filterSource.trim().toLowerCase();
    const tickerQuery = filterTicker.trim().toLowerCase();
    return positions.filter((p) => {
      if (filterAccountId !== 'all' && p.account_id !== filterAccountId) return false;
      if (srcQuery && !p.source.toLowerCase().includes(srcQuery)) return false;
      if (tickerQuery && !p.ticker.toLowerCase().includes(tickerQuery)) return false;
      const asOf = p.as_of.slice(0, 10);
      if (filterFrom && asOf < filterFrom) return false;
      if (filterTo && asOf > filterTo) return false;
      return true;
    });
  }, [positions, filterAccountId, filterSource, filterTicker, filterFrom, filterTo]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const p of filtered) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of filtered) next.add(p.id);
      return next;
    });
  }

  function patchDraft(id: number, patch: Partial<Position>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(id: number) {
    const draft = drafts[id];
    const original = positions.find((p) => p.id === id);
    if (!original) return;

    // ticker is intentionally read-only (v0.1.5.1): mutating it can
    // silently unclassify the position or orphan a user-created
    // Classification row. Users fix bad tickers by deleting + re-entering.
    const changed: Record<string, number | string | null> = {};
    if (draft.shares !== original.shares) changed.shares = draft.shares;
    if (draft.cost_basis !== original.cost_basis) changed.cost_basis = draft.cost_basis;
    if (draft.market_value !== original.market_value) changed.market_value = draft.market_value;
    if (Object.keys(changed).length === 0) {
      setStatus({ kind: 'ok', message: 'No changes.' });
      return;
    }

    setBusyId(id);
    setStatus(null);
    try {
      await api.patchPosition(id, changed);
      setStatus({ kind: 'ok', message: `Updated #${id}.` });
      refresh();
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm(`Delete position #${id}? Provenance audit trail is preserved.`)) return;
    setBusyId(id);
    setStatus(null);
    try {
      await api.deletePosition(id);
      setStatus({ kind: 'ok', message: `Deleted #${id}.` });
      refresh();
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ok = window.confirm(
      `Delete ${selected.size} position(s)? Provenance audit trail is preserved.`,
    );
    if (!ok) return;
    setBusyBatch(true);
    setStatus(null);
    const ids = Array.from(selected);
    let failed = 0;
    for (const id of ids) {
      try {
        await api.deletePosition(id);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      setStatus({ kind: 'ok', message: `Deleted ${ids.length} position(s).` });
    } else {
      setStatus({
        kind: 'err',
        message: `Deleted ${ids.length - failed} of ${ids.length}; ${failed} failed.`,
      });
    }
    setBusyBatch(false);
    refresh();
  }

  const accountLabel = (id: number) =>
    accounts.find((a) => a.id === id)?.label ?? `#${id}`;
  const distinctSources = Array.from(new Set(positions.map((p) => p.source))).sort();

  return (
    <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Positions</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <a
            href="/paste"
            style={{
              padding: '0.5rem 1rem',
              background: '#111',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            + Paste from Brokerage
          </a>
          <a
            href="/manual"
            style={{
              padding: '0.5rem 1rem',
              background: '#f0f0f0',
              color: '#111',
              textDecoration: 'none',
              borderRadius: 4,
              border: '1px solid #ccc',
              fontWeight: 600,
            }}
          >
            + Add Custom Asset
          </a>
        </div>
      </div>
      <p style={{ color: '#555' }}>
        Every committed row. Edit inline (writes an override provenance entry) or delete.
        Filter to scope the view; batch-delete for cleanup after a paste.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'end',
          flexWrap: 'wrap',
          margin: '1rem 0',
          padding: '0.75rem',
          background: '#f5f7fa',
          borderRadius: 4,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>Account</span>
          <select
            value={filterAccountId}
            onChange={(e) =>
              setFilterAccountId(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
            style={{ padding: '0.35rem 0.4rem' }}
          >
            <option value="all">All</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                #{a.id} {a.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>Source contains</span>
          <input
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            list="known-sources"
            placeholder="paste, manual, fidelity..."
            style={{ padding: '0.35rem 0.4rem', width: 200 }}
          />
          <datalist id="known-sources">
            {distinctSources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>Ticker contains</span>
          <input
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
            placeholder="VTI, wine..."
            style={{ padding: '0.35rem 0.4rem', width: 150 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>As of from</span>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            style={{ padding: '0.3rem 0.4rem' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>As of to</span>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            style={{ padding: '0.3rem 0.4rem' }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setFilterAccountId('all');
            setFilterSource('');
            setFilterTicker('');
            setFilterFrom('');
            setFilterTo('');
          }}
          style={{ padding: '0.4rem 0.75rem' }}
        >
          Clear
        </button>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.85rem' }}>
          {filtered.length} of {positions.length} shown
        </span>
      </div>

      {selected.size > 0 && (
        <div
          style={{
            margin: '0.5rem 0',
            padding: '0.5rem 0.75rem',
            background: '#fff5d6',
            border: '1px solid #e0c873',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <span>{selected.size} selected</span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={busyBatch}
            style={{ color: 'crimson' }}
          >
            {busyBatch ? 'Deleting...' : `Delete ${selected.size} selected`}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} disabled={busyBatch}>
            Clear selection
          </button>
        </div>
      )}

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

      {positions.length === 0 ? (
        <p style={{ color: '#555' }}>
          Nothing here yet. Start at <a href="/paste">/paste</a> or{' '}
          <a href="/manual">/manual</a>.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th style={th}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    aria-label="Select all filtered"
                  />
                </th>
                <th style={th}>#</th>
                <th style={th}>Account</th>
                <th style={th}>Ticker</th>
                <th style={th}>Asset class</th>
                <th style={th}>Shares</th>
                <th style={th}>Cost basis</th>
                <th style={th}>Market value</th>
                <th style={th}>Source</th>
                <th style={th}>As of</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const d = drafts[p.id] ?? p;
                const cls = classificationByTicker.get(p.ticker);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        aria-label={`Select #${p.id}`}
                      />
                    </td>
                    <td style={td}>{p.id}</td>
                    <td style={td} title={accountLabel(p.account_id)}>
                      {accountLabel(p.account_id)}
                    </td>
                    <td style={{ ...td, color: '#333' }} title="Read-only: delete + re-enter to change">
                      <code>{p.ticker}</code>
                      <div style={{ marginTop: 4 }}>
                        <a
                          href={`/classifications?ticker=${encodeURIComponent(p.ticker)}`}
                          style={{
                            fontSize: '0.75rem',
                            color: '#0066cc',
                            textDecoration: 'none',
                          }}
                        >
                          Edit classification
                        </a>
                      </div>
                    </td>
                    <td style={td}>
                      {cls ? (
                        <a
                          href={`/classifications?ticker=${encodeURIComponent(p.ticker)}`}
                          style={{ color: '#111', textDecoration: 'none' }}
                          title={`${humanize(cls.asset_class)}${cls.sub_class ? ` / ${humanize(cls.sub_class)}` : ''}${cls.source === 'user' ? ' (your override)' : ''}`}
                        >
                          {humanize(cls.asset_class)}
                          {cls.source === 'user' && (
                            <span style={overrideBadge} title="Your override">·</span>
                          )}
                        </a>
                      ) : (
                        <a
                          href={`/classifications?ticker=${encodeURIComponent(p.ticker)}`}
                          style={unclassifiedBadge}
                          title="No classification for this ticker; click to manage"
                        >
                          unclassified
                        </a>
                      )}
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        value={d.shares}
                        onChange={(e) => patchDraft(p.id, { shares: Number(e.target.value) })}
                        step="any"
                        style={{ width: 90 }}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        value={d.cost_basis ?? ''}
                        onChange={(e) =>
                          patchDraft(p.id, {
                            cost_basis: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        step="any"
                        style={{ width: 110 }}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        value={d.market_value ?? ''}
                        onChange={(e) =>
                          patchDraft(p.id, {
                            market_value: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        step="any"
                        style={{ width: 120 }}
                      />
                    </td>
                    <td style={{ ...td, fontSize: '0.8rem', color: '#666' }}>
                      <Provenance source={p.source} capturedAt={p.as_of}>
                        {p.source}
                      </Provenance>
                    </td>
                    <td style={{ ...td, fontSize: '0.8rem', color: '#666' }}>
                      {p.as_of.slice(0, 10)}
                    </td>
                    <td style={{ ...td, display: 'flex', gap: 4 }}>
                      <button onClick={() => save(p.id)} disabled={busyId === p.id}>
                        Save
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        disabled={busyId === p.id}
                        style={{ color: 'crimson' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.35rem 0.25rem', verticalAlign: 'top' as const };
const overrideBadge = {
  marginLeft: 4,
  color: '#9a7b1f',
  fontWeight: 700,
} as const;
const unclassifiedBadge = {
  padding: '0.1rem 0.5rem',
  background: '#fde7ea',
  color: 'crimson',
  border: '1px solid #f0b4bc',
  borderRadius: 3,
  fontSize: '0.75rem',
  textDecoration: 'none',
} as const;
