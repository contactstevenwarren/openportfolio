'use client';

// Committed positions list with inline edit + delete (M3). Primary use
// case: HSA cash/invested split via user override and trimming mistakes
// from a paste commit.

import { useEffect, useState } from 'react';

import { api, type Position } from '../lib/api';
import { Provenance } from '../lib/provenance';

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Position>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    api
      .positions()
      .then((rows) => {
        setPositions(rows);
        const next: Record<number, Position> = {};
        for (const p of rows) next[p.id] = { ...p };
        setDrafts(next);
      })
      .catch((e) => setStatus({ kind: 'err', message: (e as Error).message }));
  }

  function patchDraft(id: number, patch: Partial<Position>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(id: number) {
    const draft = drafts[id];
    const original = positions.find((p) => p.id === id);
    if (!original) return;

    const changed: Record<string, number | string | null> = {};
    if (draft.ticker !== original.ticker) changed.ticker = draft.ticker;
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

  return (
    <main style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Positions</h1>
      <p style={{ color: '#555' }}>
        Every committed row. Edit inline (writes an override provenance entry), or delete
        (provenance audit trail is preserved).
      </p>

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
                <th style={th}>#</th>
                <th style={th}>Account</th>
                <th style={th}>Ticker</th>
                <th style={th}>Shares</th>
                <th style={th}>Cost basis</th>
                <th style={th}>Market value</th>
                <th style={th}>Source</th>
                <th style={th}>As of</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const d = drafts[p.id] ?? p;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={td}>{p.id}</td>
                    <td style={td}>#{p.account_id}</td>
                    <td style={td}>
                      <input
                        value={d.ticker}
                        onChange={(e) => patchDraft(p.id, { ticker: e.target.value })}
                        style={{ width: 160 }}
                      />
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
