'use client';

// Classifications page (v0.1.5 M3). One hero table for browsing and
// overriding how any ticker is classified. YAML baseline is always
// present; user rows display with an "overrides yaml" badge. Inline
// edit + revert; delete of a user-invented ticker is blocked by the
// server when positions still reference it.

import { useEffect, useMemo, useState } from 'react';

import {
  api,
  type ClassificationPatch,
  type ClassificationRow,
  type Position,
  type TaxonomyOption,
} from '../lib/api';
import { REGION_OPTIONS, humanize } from '../lib/labels';

type SourceFilter = 'all' | 'yaml' | 'user';

export default function ClassificationsPage() {
  const [rows, setRows] = useState<ClassificationRow[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyOption[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ClassificationPatch>({
    asset_class: 'equity',
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    refresh();
    api
      .taxonomy()
      .then((t) => setTaxonomy(t.asset_classes))
      .catch(() => {
        // Token may not be set yet; page still renders the list with
        // whatever refresh() returns.
      });
    // Deeplink from /positions: ?ticker=X pre-fills the search box so
    // the user lands on the row they were looking at.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('ticker');
      if (t) setSearch(t);
    }
  }, []);

  function refresh() {
    api
      .classifications()
      .then(setRows)
      .catch((e) => setStatus({ kind: 'err', message: (e as Error).message }));
    // Positions are used for the "N holdings" column and to scope the
    // editing-impact hint. Loaded separately so a failure here doesn't
    // break the main table.
    api.positions().then(setPositions).catch(() => {});
  }

  // Ticker -> number of Position rows pointing at it. Drives the
  // "Holdings" column so YAML rows you don't own show as 0, and a
  // user-invented ticker with real positions can't be deleted silently.
  const positionCountByTicker = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) m.set(p.ticker, (m.get(p.ticker) ?? 0) + 1);
    return m;
  }, [positions]);

  // Datalist options for the sub_class / sector edit inputs, scoped to
  // the draft's currently-selected asset_class where it matters.
  const subClassSuggestions = useMemo(() => {
    const values = rows
      .filter((r) => r.asset_class === editDraft.asset_class && r.sub_class)
      .map((r) => r.sub_class as string);
    return Array.from(new Set(values)).sort();
  }, [rows, editDraft.asset_class]);

  const sectorSuggestions = useMemo(() => {
    const values = rows.filter((r) => r.sector).map((r) => r.sector as string);
    return Array.from(new Set(values)).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (q && !r.ticker.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, sourceFilter]);

  function startEdit(row: ClassificationRow) {
    setEditing(row.ticker);
    setEditDraft({
      asset_class: row.asset_class,
      sub_class: row.sub_class,
      sector: row.sector,
      region: row.region,
    });
    setStatus(null);
  }

  function cancelEdit() {
    setEditing(null);
    setEditDraft({ asset_class: 'equity' });
  }

  async function saveEdit(ticker: string) {
    if (!editDraft.asset_class) return;
    setBusy(true);
    try {
      await api.patchClassification(ticker, {
        asset_class: editDraft.asset_class,
        sub_class: editDraft.sub_class || null,
        sector: editDraft.sector || null,
        region: editDraft.region || null,
      });
      setStatus({ kind: 'ok', message: `Saved override for ${ticker}` });
      cancelEdit();
      refresh();
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function revertToYaml(row: ClassificationRow) {
    const ok = window.confirm(
      `Revert ${row.ticker} to the bundled classification? Your override will be deleted.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteClassification(row.ticker);
      setStatus({ kind: 'ok', message: `Reverted ${row.ticker} to YAML baseline` });
      refresh();
    } catch (e) {
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteUserTicker(row: ClassificationRow) {
    const ok = window.confirm(
      `Delete the classification for ${row.ticker}? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteClassification(row.ticker);
      setStatus({ kind: 'ok', message: `Deleted classification for ${row.ticker}` });
      refresh();
    } catch (e) {
      // Expected when positions still reference the ticker -- server
      // returns 409 with a message the API wrapper surfaces as-is.
      setStatus({ kind: 'err', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const userRowCount = rows.filter((r) => r.source === 'user').length;

  return (
    <main style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Classifications</h1>
      <p style={{ color: '#555' }}>
        Bundled classifications for every known ticker, plus any overrides you've made.
        Edit a row to change how a ticker is categorized in the sunburst and 5-number
        summary. Your overrides win over the bundled values.
      </p>

      {rows.length > 0 && userRowCount === 0 && (
        <div
          style={{
            margin: '0.75rem 0',
            padding: '0.6rem 0.85rem',
            background: '#f0f6ff',
            border: '1px solid #c5dbff',
            borderRadius: 4,
            color: '#1a3a6e',
            fontSize: '0.9rem',
          }}
        >
          Showing {rows.length} bundled classifications from the project baseline. Edit any
          row to create an override; your overrides stay yours across deploys.
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          margin: '1rem 0',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>Search ticker</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="VTI, BND, wine..."
            style={{ padding: '0.4rem 0.5rem', width: 220 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>Source</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            style={{ padding: '0.4rem 0.5rem' }}
          >
            <option value="all">All ({rows.length})</option>
            <option value="user">Your overrides ({userRowCount})</option>
            <option value="yaml">Bundled ({rows.length - userRowCount})</option>
          </select>
        </label>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.85rem' }}>
          {filtered.length} shown
        </span>
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

      <datalist id="classifications-subclass">
        {subClassSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="classifications-sector">
        {sectorSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
            <th style={th}>Ticker</th>
            <th style={th}>Asset class</th>
            <th style={th}>Sub class</th>
            <th style={th}>Sector</th>
            <th style={th}>Region</th>
            <th style={th}>Source</th>
            <th style={th}>Holdings</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const isEditing = editing === r.ticker;
            const holdingCount = positionCountByTicker.get(r.ticker) ?? 0;
            return (
              <tr key={r.ticker} style={{ borderBottom: '1px solid #eee' }}>
                <td style={td}>
                  <code>{r.ticker}</code>
                </td>
                {isEditing ? (
                  <>
                    <td style={td}>
                      <select
                        value={editDraft.asset_class}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, asset_class: e.target.value }))
                        }
                        style={{ padding: '0.3rem 0.4rem' }}
                      >
                        {taxonomy.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <input
                        value={editDraft.sub_class ?? ''}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, sub_class: e.target.value }))
                        }
                        list="classifications-subclass"
                        style={{ padding: '0.3rem 0.4rem', width: 140 }}
                      />
                    </td>
                    <td style={td}>
                      <input
                        value={editDraft.sector ?? ''}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, sector: e.target.value }))
                        }
                        list="classifications-sector"
                        style={{ padding: '0.3rem 0.4rem', width: 110 }}
                      />
                    </td>
                    <td style={td}>
                      <select
                        value={editDraft.region ?? ''}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, region: e.target.value }))
                        }
                        style={{ padding: '0.3rem 0.4rem', width: 130 }}
                      >
                        {REGION_OPTIONS.map((o) => (
                          <option key={o.value || 'none'} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={td}>{humanize(r.asset_class)}</td>
                    <td style={td}>
                      {r.sub_class ? humanize(r.sub_class) : <span style={mutedDash}>—</span>}
                    </td>
                    <td style={td}>
                      {r.sector ? humanize(r.sector) : <span style={mutedDash}>—</span>}
                    </td>
                    <td style={td}>
                      {r.region ? humanize(r.region) : <span style={mutedDash}>—</span>}
                    </td>
                  </>
                )}
                <td style={td}>
                  {r.source === 'user' ? (
                    <span style={badgeUser}>
                      user{r.overrides_yaml ? ' · overrides yaml' : ''}
                    </span>
                  ) : (
                    <span style={badgeYaml}>yaml</span>
                  )}
                </td>
                <td style={td}>
                  {holdingCount === 0 ? (
                    <span style={mutedDash}>0</span>
                  ) : (
                    <a
                      href={`/positions?ticker=${encodeURIComponent(r.ticker)}`}
                      style={{ color: '#111' }}
                      title={`${holdingCount} position(s) held`}
                    >
                      {holdingCount}
                    </a>
                  )}
                </td>
                <td style={td}>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveEdit(r.ticker)}
                        disabled={busy || !editDraft.asset_class}
                      >
                        Save
                      </button>{' '}
                      <button type="button" onClick={cancelEdit} disabled={busy}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(r)} disabled={busy}>
                        Edit
                      </button>{' '}
                      {r.source === 'user' && r.overrides_yaml && (
                        <button
                          type="button"
                          onClick={() => revertToYaml(r)}
                          disabled={busy}
                        >
                          Revert
                        </button>
                      )}
                      {r.source === 'user' && !r.overrides_yaml && (
                        <button
                          type="button"
                          onClick={() => deleteUserTicker(r)}
                          disabled={busy}
                          style={{ color: 'crimson' }}
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

const th = { padding: '0.5rem 0.3rem', fontWeight: 600 };
const td = { padding: '0.4rem 0.3rem', verticalAlign: 'middle' as const };
const mutedDash = { color: '#bbb' };
const badgeUser = {
  display: 'inline-block',
  padding: '0.15rem 0.5rem',
  background: '#fff5d6',
  border: '1px solid #e0c873',
  borderRadius: 4,
  fontSize: '0.8rem',
} as const;
const badgeYaml = {
  display: 'inline-block',
  padding: '0.15rem 0.5rem',
  background: '#eef1f5',
  border: '1px solid #c7cfd9',
  borderRadius: 4,
  fontSize: '0.8rem',
  color: '#555',
} as const;
