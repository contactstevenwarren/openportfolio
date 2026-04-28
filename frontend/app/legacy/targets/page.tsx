'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import {
  api,
  type AllocationResult,
  type TargetRow,
  type TargetsPayload,
} from '../../lib/api';
import {
  EMPTY_TARGETS,
  applyAutoBalance,
  displayResidualPath,
  entirePayloadValid,
  mergeTargetsWithActuals,
  seedFromActuals,
  sumTargetPct,
  targetSumOk,
} from '../../lib/allocationTargets';
import { DRILL_CONFIG, getDrillSlices } from '../../lib/drill';
import { humanize } from '../../lib/labels';

type SectionKey = 'root' | string;

function getSectionRows(payload: TargetsPayload, key: SectionKey): TargetRow[] {
  if (key === 'root') return payload.root;
  return payload.groups[key] ?? [];
}

function setSectionRows(payload: TargetsPayload, key: SectionKey, rows: TargetRow[]): TargetsPayload {
  if (key === 'root') return { ...payload, root: rows };
  return { ...payload, groups: { ...payload.groups, [key]: rows } };
}

export default function TargetsPage() {
  const router = useRouter();
  const { data: alloc, error: allocError, isLoading: allocLoading } = useSWR<AllocationResult>(
    '/api/allocation',
    api.allocation,
  );
  const { data: remoteTargets, mutate: mutateTargets, error: targetsError } = useSWR<TargetsPayload>(
    '/api/targets',
    api.getTargets,
    { shouldRetryOnError: false },
  );

  const targetsPending = remoteTargets === undefined && targetsError == null;
  const savedForMerge: TargetsPayload =
    targetsError != null ? EMPTY_TARGETS : (remoteTargets ?? EMPTY_TARGETS);

  const [payload, setPayload] = useState<TargetsPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blockedPath, setBlockedPath] = useState<string | null>(null);
  const [, bump] = useState(0);
  const touchRef = useRef<Record<string, string[]>>({});
  const dirtyRef = useRef(false);
  const blockedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashBlocked = useCallback((path: string) => {
    setBlockedPath(path);
    if (blockedTimer.current) clearTimeout(blockedTimer.current);
    blockedTimer.current = setTimeout(() => setBlockedPath(null), 2000);
  }, []);

  useLayoutEffect(() => {
    if (!alloc || targetsPending) return;
    if (dirtyRef.current) return;
    setPayload(mergeTargetsWithActuals(alloc, savedForMerge));
    touchRef.current = {};
    bump((x) => x + 1);
  }, [alloc, savedForMerge, targetsPending]);

  const sectionKeys = useCallback((): SectionKey[] => {
    if (!alloc) return [];
    const keys: SectionKey[] = ['root'];
    for (const assetClass of Object.keys(DRILL_CONFIG)) {
      const slice = alloc.by_asset_class.find((s) => s.name === assetClass);
      if (!slice || slice.value <= 0) continue;
      const dim = DRILL_CONFIG[assetClass][0];
      const drillSlices = getDrillSlices(alloc.by_asset_class, { assetClass, dim });
      if (drillSlices.length === 0) continue;
      keys.push(assetClass);
    }
    return keys;
  }, [alloc]);

  const actualPctByPath = useCallback(
    (key: SectionKey): Map<string, number> => {
      const m = new Map<string, number>();
      if (!alloc) return m;
      if (key === 'root') {
        for (const s of alloc.by_asset_class.filter((x) => x.value > 0)) {
          m.set(s.name, s.pct);
        }
        return m;
      }
      const dim = DRILL_CONFIG[key][0];
      for (const s of getDrillSlices(alloc.by_asset_class, { assetClass: key, dim })) {
        m.set(`${key}.${s.name}`, s.pct);
      }
      return m;
    },
    [alloc],
  );

  const sectionTitle = (key: SectionKey): string => {
    if (key === 'root') return 'Root allocation';
    const dim = DRILL_CONFIG[key][0];
    return `${humanize(key)} · ${humanize(dim)}`;
  };

  const resetSection = (key: SectionKey) => {
    if (!alloc) return;
    const seed = seedFromActuals(alloc);
    const rows = key === 'root' ? seed.root : seed.groups[key];
    if (!rows) return;
    dirtyRef.current = true;
    setPayload((prev) => (prev ? setSectionRows(prev, key, rows) : prev));
    touchRef.current = { ...touchRef.current, [key]: [] };
    bump((x) => x + 1);
  };

  const onCellChange = (key: SectionKey, path: string, raw: string) => {
    if (!payload) return;
    const rows = getSectionRows(payload, key);
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    const v = Math.max(0, Math.min(100, Math.round(parsed)));
    const ord = touchRef.current[key] ?? [];
    const res = applyAutoBalance(rows, path, v, ord);
    if (res.blocked) {
      flashBlocked(path);
      return;
    }
    dirtyRef.current = true;
    touchRef.current = { ...touchRef.current, [key]: [...ord, path] };
    setPayload((prev) => (prev ? setSectionRows(prev, key, res.rows) : prev));
    bump((x) => x + 1);
  };

  const saveAll = async () => {
    if (!payload || !entirePayloadValid(payload)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.putTargets(payload);
      dirtyRef.current = false;
      await mutateTargets();
      router.push('/');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (allocLoading || targetsPending || !alloc || payload == null) {
    return (
      <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (allocError) {
    return (
      <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
        <p style={{ color: 'crimson' }}>Failed to load allocation: {(allocError as Error).message}</p>
        <p>
          <Link href="/positions">/positions</Link>
        </p>
      </main>
    );
  }

  if (!alloc || alloc.total === 0) {
    return (
      <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
        <p>No positions yet. Start at <Link href="/positions">/positions</Link>.</p>
        <p style={{ marginTop: '1rem' }}>
          <Link href="/">← Portfolio</Link>
        </p>
      </main>
    );
  }

  const keys = sectionKeys();
  const thresholds = alloc.drift_thresholds;
  const minorNote = thresholds
    ? `Drift bands (preview): ≤${thresholds.tolerance_pct}% ok, ≤${thresholds.act_pct}% watch, ≤${thresholds.urgent_pct}% act (else urgent).`
    : 'Drift bands (preview): ≤3% ok, ≤5% watch, ≤10% act (else urgent).';

  return (
    <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 500, margin: 0, flex: '1 1 auto' }}>Target allocations</h1>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={btnGhost}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={saveAll}
          disabled={!entirePayloadValid(payload) || saving}
          style={btnPrimary}
        >
          {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>

      <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#555' }}>
        Each section must sum to 100% to save. One row per section absorbs rounding when you edit another row
        (least recently edited row; ties → bottom row).
      </p>
      <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: '#888' }}>{minorNote}</p>

      {targetsError && (
        <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '0.75rem' }}>
          Targets could not be loaded; showing merged defaults from actuals.
        </p>
      )}
      {saveError && (
        <p style={{ fontSize: '0.85rem', color: 'crimson', marginBottom: '0.75rem' }}>Save failed: {saveError}</p>
      )}

      {keys.map((key) => {
        const rows = getSectionRows(payload, key);
        const actualMap = actualPctByPath(key);
        const sum = sumTargetPct(rows);
        const ok = targetSumOk(rows);
        const residual = displayResidualPath(rows, touchRef.current[key] ?? []);
        return (
          <section key={key} style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>{sectionTitle(key)}</h2>
              <button type="button" onClick={() => resetSection(key)} style={btnMini}>
                Reset to actuals
              </button>
            </div>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: ok ? '#15803d' : '#b45309' }}>
              Sum: {sum}% {ok ? '· OK' : '· must equal 100 to save'}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                  <th style={th}>Category</th>
                  <th style={th}>Target %</th>
                  <th style={th}>Actual %</th>
                  <th style={th}>Drift (preview)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const act = actualMap.get(r.path) ?? 0;
                  const drift = act - r.pct;
                  const isResidual = residual === r.path;
                  const blocked = blockedPath === r.path;
                  return (
                    <tr key={r.path} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={td}>{humanize(r.path.includes('.') ? r.path.split('.').pop()! : r.path)}</td>
                      <td style={td}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={r.pct}
                          onChange={(e) => onCellChange(key, r.path, e.target.value)}
                          style={{
                            width: '4.5rem',
                            fontSize: '0.9rem',
                            border: blocked ? '2px solid crimson' : '1px solid #ccc',
                            borderRadius: 4,
                          }}
                          aria-label={`Target % for ${r.path}`}
                        />
                        {isResidual && (
                          <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#888' }}>← absorbs change</span>
                        )}
                      </td>
                      <td style={td}>{act.toFixed(1)}%</td>
                      <td style={td}>
                        {drift > 0 ? '+' : ''}
                        {drift.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={saveAll}
          disabled={!entirePayloadValid(payload) || saving}
          style={btnPrimary}
        >
          {saving ? 'Saving…' : 'Save all'}
        </button>
        <Link href="/" style={{ fontSize: '0.9rem', color: '#2563eb' }}>
          ← Portfolio
        </Link>
      </div>
    </main>
  );
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };

const btnPrimary: CSSProperties = {
  padding: '0.4rem 0.85rem',
  fontSize: '0.9rem',
  borderRadius: 4,
  border: '1px solid #166534',
  background: '#166534',
  color: '#fff',
  cursor: 'pointer',
};

const btnGhost: CSSProperties = {
  padding: '0.4rem 0.85rem',
  fontSize: '0.9rem',
  borderRadius: 4,
  border: '1px solid #ccc',
  background: '#fff',
  color: '#222',
  cursor: 'pointer',
};

const btnMini: CSSProperties = {
  padding: '0.2rem 0.5rem',
  fontSize: '0.8rem',
  borderRadius: 4,
  border: '1px solid #ccc',
  background: '#fff',
  color: '#222',
  cursor: 'pointer',
};
