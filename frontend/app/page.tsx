'use client';

// v0.1.6 hero: single donut + context-aware one-level drill-down.
// v0.2: targets + drift columns, drift ring, save / prefill / clear targets.
//
// Root view shows one slice per asset class. Click a drillable slice (or
// its table row) and the same chart re-renders for that class's natural
// sub-breakdown:
//   equity        → Geography (regions) | Sector (look-through)
//   fixed_income  → sub_class (Treasury / TIPS / Corporate / ...)
//   real_estate   → sub_class (Direct / REITs / ...)
//   cash          → sub_class (MM / CDs / Checking / ...)
//   crypto        → sub_class (BTC / ETH / ...)
//   commodity     → not drillable
//   private       → not drillable
//
// Percentages at root are % of net worth. Percentages inside a drill are
// % of the parent asset class's total, so they sum to 100% within the
// drill.

import dynamic from 'next/dynamic';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import {
  api,
  type AllocationResult,
  type AllocationSlice,
  type DriftBand,
  type TargetRow,
  type TargetsPayload,
} from './lib/api';
import { humanize } from './lib/labels';
import { Provenance } from './lib/provenance';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type Dim = 'geography' | 'sector' | 'sub_class';
type Drill = { assetClass: string; dim: Dim } | null;

const DRILL_CONFIG: Record<string, Dim[]> = {
  equity: ['geography', 'sector'],
  fixed_income: ['sub_class'],
  real_estate: ['sub_class'],
  cash: ['sub_class'],
  crypto: ['sub_class'],
};

const EMPTY_TARGETS: TargetsPayload = { root: [], groups: {} };

function driftThresholds(data: AllocationResult | undefined): { minor_pct: number; major_pct: number } {
  const d = data?.drift_thresholds;
  return {
    minor_pct: d?.minor_pct ?? 1,
    major_pct: d?.major_pct ?? 3,
  };
}

function bandFromAbs(abs: number, t: { minor_pct: number; major_pct: number }): DriftBand {
  if (abs <= t.minor_pct) return 'on_target';
  if (abs <= t.major_pct) return 'minor';
  return 'major';
}

// Backend contract: root rows use bare asset-class paths ("equity"); group
// rows use bare asset-class keys ("equity") with dotted leaf paths
// ("equity.US"). <leaf> is exactly slice.name.
function rowPath(drill: Drill, sliceName: string): string {
  return drill ? `${drill.assetClass}.${sliceName}` : sliceName;
}

function getGroupRows(payload: TargetsPayload, drill: Drill): TargetRow[] {
  if (!drill) return payload.root;
  return payload.groups[drill.assetClass] ?? [];
}

function setGroupRows(payload: TargetsPayload, drill: Drill, rows: TargetRow[]): TargetsPayload {
  if (!drill) return { ...payload, root: rows };
  return { ...payload, groups: { ...payload.groups, [drill.assetClass]: rows } };
}

function sumTargetPct(rows: TargetRow[]): number {
  return rows.reduce((a, r) => a + r.pct, 0);
}

function targetSumOk(rows: TargetRow[]): boolean {
  if (rows.length === 0) return true;
  return sumTargetPct(rows) === 100;
}

function entirePayloadValid(p: TargetsPayload): boolean {
  if (!targetSumOk(p.root)) return false;
  for (const rows of Object.values(p.groups)) {
    if (rows?.length && !targetSumOk(rows)) return false;
  }
  return true;
}

function effectiveTarget(
  rows: TargetRow[],
  drill: Drill,
  slice: AllocationSlice,
): number | null {
  const path = rowPath(drill, slice.name);
  const local = rows.find((r) => r.path === path);
  if (local) return local.pct;
  if (slice.target_pct != null) return slice.target_pct;
  return null;
}

function effectiveDrift(rows: TargetRow[], drill: Drill, slice: AllocationSlice): number | null {
  if (slice.drift_pct != null) return slice.drift_pct;
  const t = effectiveTarget(rows, drill, slice);
  if (t == null) return null;
  return slice.pct - t;
}

function effectiveBand(
  rows: TargetRow[],
  drill: Drill,
  slice: AllocationSlice,
  t: { minor_pct: number; major_pct: number },
): DriftBand | null {
  if (slice.drift_band) return slice.drift_band;
  const d = effectiveDrift(rows, drill, slice);
  if (d == null) return null;
  return bandFromAbs(Math.abs(d), t);
}

export default function Home() {
  const { data, error, isLoading } = useSWR<AllocationResult>('/api/allocation', api.allocation);
  const {
    data: remoteTargets,
    mutate: mutateTargets,
    error: targetsError,
  } = useSWR<TargetsPayload>('/api/targets', api.getTargets, { shouldRetryOnError: false });

  const [drill, setDrill] = useState<Drill>(null);
  const [targets, setTargets] = useState<TargetsPayload>(EMPTY_TARGETS);
  const [targetsDirty, setTargetsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (remoteTargets == null) return;
    if (!targetsDirty) setTargets(remoteTargets);
  }, [remoteTargets, targetsDirty]);

  const thresholds = useMemo(() => driftThresholds(data), [data]);

  const root = data?.by_asset_class ?? [];
  const parentSlice = drill ? root.find((s) => s.name === drill.assetClass) ?? null : null;
  const drillSlices = drill && data ? getDrillSlices(root, drill) : [];
  const tableRows: AllocationSlice[] = drill ? drillSlices : root.filter((s) => s.value > 0);

  const sectorInfoOnly = drill?.assetClass === 'equity' && drill.dim === 'sector';
  const targetRows = useMemo(() => getGroupRows(targets, drill), [targets, drill]);

  const onDrillInto = (name: string) => {
    if (drill) return;
    const dims = DRILL_CONFIG[name];
    if (!dims) return;
    setDrill({ assetClass: name, dim: dims[0] });
  };

  const centerTop = drill ? humanize(drill.assetClass) : '';
  const centerBottom = drill && parentSlice ? formatUSDCompact(parentSlice.value) : '';
  const emptyDrill = drill !== null && tableRows.length === 0;

  const maxDriftRoot = useMemo(() => {
    if (!data || drill) return { max: null as number | null, band: null as DriftBand | null };
    if (data.max_drift != null) {
      return {
        max: Math.abs(data.max_drift),
        band: data.max_drift_band ?? bandFromAbs(Math.abs(data.max_drift), thresholds),
      };
    }
    let m = 0;
    let any = false;
    for (const s of root.filter((x) => x.value > 0)) {
      const d = effectiveDrift(targets.root, null, s);
      if (d != null) {
        any = true;
        m = Math.max(m, Math.abs(d));
      }
    }
    if (!any) return { max: null, band: null };
    return { max: m, band: bandFromAbs(m, thresholds) };
  }, [data, drill, root, targets.root, thresholds]);

  const maxDriftDrill = useMemo(() => {
    if (!drill || sectorInfoOnly) return { max: null as number | null, band: null as DriftBand | null };
    let m = 0;
    let any = false;
    for (const s of tableRows) {
      const d = effectiveDrift(targetRows, drill, s);
      if (d != null) {
        any = true;
        m = Math.max(m, Math.abs(d));
      }
    }
    if (!any) return { max: null, band: null };
    return { max: m, band: bandFromAbs(m, thresholds) };
  }, [drill, sectorInfoOnly, tableRows, targetRows, thresholds]);

  const statusPill = drill ? maxDriftDrill : maxDriftRoot;

  const patchTargetPct = useCallback(
    (sliceName: string, pct: number) => {
      setSaveError(null);
      setTargetsDirty(true);
      const path = rowPath(drill, sliceName);
      setTargets((prev) => {
        const rows = getGroupRows(prev, drill);
        const i = rows.findIndex((r) => r.path === path);
        let next: TargetRow[];
        if (i >= 0) {
          next = rows.map((r, j) => (j === i ? { path, pct } : r));
        } else {
          next = [...rows, { path, pct }];
        }
        return setGroupRows(prev, drill, next);
      });
    },
    [drill],
  );

  const setTargetsFromActuals = useCallback(() => {
    if (tableRows.length === 0) return;
    setSaveError(null);
    setTargetsDirty(true);
    setTargets((prev) => {
      const rounded = tableRows.map((s) => Math.round(s.pct));
      const sumOthers = rounded.slice(0, -1).reduce((a, n) => a + n, 0);
      rounded[rounded.length - 1] = 100 - sumOthers;
      const nextRows: TargetRow[] = tableRows.map((s, i) => ({
        path: rowPath(drill, s.name),
        pct: rounded[i],
      }));
      return setGroupRows(prev, drill, nextRows);
    });
  }, [drill, tableRows]);

  const clearTargetsForGroup = useCallback(() => {
    if (!confirm('Clear saved targets for this view?')) return;
    setSaveError(null);
    setTargetsDirty(true);
    setTargets((prev) => setGroupRows(prev, drill, []));
  }, [drill]);

  const saveTargets = useCallback(async () => {
    if (!entirePayloadValid(targets)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.putTargets(targets);
      setTargetsDirty(false);
      await mutateTargets();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [targets, mutateTargets]);

  const chartOption = useMemo(() => {
    const inner = tableRows.map((s) => ({ name: s.name, value: s.value }));
    const outer = tableRows.map((s) => {
      const band = sectorInfoOnly ? null : effectiveBand(targetRows, drill, s, thresholds);
      let color = '#d1d5db';
      if (!sectorInfoOnly) {
        if (band === 'on_target') color = '#22c55e';
        else if (band === 'minor') color = '#f59e0b';
        else if (band === 'major') color = '#ef4444';
        else if (effectiveTarget(targetRows, drill, s) == null) color = '#d1d5db';
      }
      return { name: s.name, value: s.value, itemStyle: { color } };
    });
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${humanize(p.name)}: ${formatUSD(p.value)} (${p.percent}%)`,
      },
      series: [
        {
          type: 'pie',
          radius: ['55%', '85%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: {
            show: true,
            formatter: (p: { name: string }) => humanize(p.name),
          },
          labelLine: { show: true },
          emphasis: { itemStyle: { opacity: 0.8 } },
          data: inner,
        },
        {
          type: 'pie',
          radius: ['86%', '93%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 1 },
          label: { show: false },
          labelLine: { show: false },
          silent: true,
          data: outer,
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '43%',
          style: { text: centerTop, fontSize: 11, fill: '#666' },
        },
        {
          type: 'text',
          left: 'center',
          top: '50%',
          style: { text: centerBottom, fontSize: 20, fontWeight: 500, fill: '#222' },
        },
      ],
    };
  }, [tableRows, targetRows, drill, thresholds, sectorInfoOnly, centerTop, centerBottom]);

  if (isLoading) return <Frame>Loading…</Frame>;
  if (error) {
    return (
      <Frame>
        <p style={{ color: 'crimson' }}>Failed to load allocation: {(error as Error).message}</p>
        <p>
          If this is a fresh install, head to <a href="/positions">/positions</a> first.
        </p>
      </Frame>
    );
  }
  if (!data) return <Frame>No data.</Frame>;

  const targetSum = sumTargetPct(targetRows);
  const sumLine =
    targetRows.length > 0 ? (
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: targetSumOk(targetRows) ? '#15803d' : '#b45309' }}>
        Targets sum: {targetSum}%{targetSumOk(targetRows) ? ' · within 100' : ' · must equal 100 to save'}
      </p>
    ) : null;

  const thresholdsNote = (
    <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#888' }}>
      Drift bands: ≤{thresholds.minor_pct}% on target, ≤{thresholds.major_pct}% minor (else major).
    </p>
  );

  return (
    <Frame>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 500, margin: '0 0 1rem' }}>
        Net worth ·{' '}
        <Provenance source="sum of committed positions (market_value → cost_basis fallback)">
          {formatUSD(data.total)}
        </Provenance>
      </h1>

      {targetsError && (
        <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '0.5rem' }}>
          Targets could not be loaded; editing starts empty.
        </p>
      )}

      <div style={{ minHeight: '1.5rem', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        {drill ? (
          <>
            <button
              onClick={() => setDrill(null)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#2563eb',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              ← Portfolio
            </button>
            <span style={{ color: '#666' }}>
              {' / '}
              {humanize(drill.assetClass)}
            </span>
          </>
        ) : (
          <span style={{ color: '#888' }}>Click a slice or row to drill in</span>
        )}
      </div>

      {drill?.assetClass === 'equity' && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {(['geography', 'sector'] as const).map((d) => {
            const active = drill.dim === d;
            return (
              <button
                key={d}
                onClick={() => setDrill({ ...drill, dim: d })}
                style={{
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.85rem',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  background: active ? '#222' : '#fff',
                  color: active ? '#fff' : '#222',
                  cursor: 'pointer',
                }}
              >
                {humanize(d)}
              </button>
            );
          })}
        </div>
      )}

      {statusPill.max != null && statusPill.band && (
        <div style={{ marginBottom: '0.75rem' }}>
          <DriftStatusPill band={statusPill.band} maxDrift={statusPill.max} />
        </div>
      )}

      {!sectorInfoOnly && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={saveTargets}
            disabled={!entirePayloadValid(targets) || saving}
            style={btnPrimary}
          >
            {saving ? 'Saving…' : 'Save targets'}
          </button>
          <button type="button" onClick={setTargetsFromActuals} style={btnGhost}>
            Set targets for this group
          </button>
          <button type="button" onClick={clearTargetsForGroup} style={btnGhost}>
            Clear targets
          </button>
          {saveError && (
            <span style={{ fontSize: '0.85rem', color: 'crimson' }}>
              Save failed: {saveError}
            </span>
          )}
        </div>
      )}

      {data.total === 0 ? (
        <p style={{ color: '#555' }}>
          No positions committed yet. Start at <a href="/positions">/positions</a>.
        </p>
      ) : emptyDrill ? (
        <p style={{ color: '#888' }}>
          No {humanize(drill!.dim)} data for {humanize(drill!.assetClass)}.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1fr)',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          <ReactECharts
            style={{ height: 420 }}
            onEvents={{
              click: (p: { name: string }) => onDrillInto(p.name),
            }}
            option={chartOption}
          />

          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                  <th style={th}>{drill ? 'Sub-category' : 'Category'}</th>
                  {!sectorInfoOnly && <th style={th}>Target %</th>}
                  <th style={th}>Value ($)</th>
                  <th style={th}>{drill ? '% of parent' : '% of portfolio'}</th>
                  {!sectorInfoOnly && <th style={th}>Drift (pp)</th>}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((s) => {
                  const drillable = !drill && s.name in DRILL_CONFIG;
                  const tgt = effectiveTarget(targetRows, drill, s);
                  const drift = effectiveDrift(targetRows, drill, s);
                  return (
                    <tr
                      key={s.name}
                      onClick={drillable ? () => onDrillInto(s.name) : undefined}
                      style={{
                        borderBottom: '1px solid #eee',
                        cursor: drillable ? 'pointer' : 'default',
                      }}
                    >
                      <td style={td}>
                        {humanize(s.name)}
                        {drillable && (
                          <span style={{ color: '#aaa', marginLeft: 6 }}>›</span>
                        )}
                      </td>
                      {!sectorInfoOnly && (
                        <td
                          style={td}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={tgt ?? ''}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const raw = parseFloat(e.target.value);
                              if (Number.isNaN(raw)) return;
                              const v = Math.max(0, Math.min(100, Math.round(raw)));
                              patchTargetPct(s.name, v);
                            }}
                            style={{ width: '4.5rem', fontSize: '0.9rem' }}
                            aria-label={`Target % for ${s.name}`}
                          />
                        </td>
                      )}
                      <td style={td}>
                        <Provenance
                          source={
                            drill
                              ? `${humanize(drill.assetClass)} · ${humanize(drill.dim)} · ${s.name}`
                              : `sum of ${s.tickers?.length ?? 0} position(s): ${(s.tickers ?? []).join(', ') || '—'}`
                          }
                        >
                          {formatUSD(s.value)}
                        </Provenance>
                      </td>
                      <td style={td}>
                        <Provenance
                          source={
                            drill
                              ? `${formatUSD(s.value)} ÷ ${humanize(drill.assetClass)} total`
                              : `${formatUSD(s.value)} ÷ net worth`
                          }
                        >
                          {s.pct.toFixed(1)}%
                        </Provenance>
                      </td>
                      {!sectorInfoOnly && (
                        <td style={td}>
                          {drift != null ? (
                            <Provenance
                              source={
                                s.drift_pct != null
                                  ? 'drift_pct from allocation API'
                                  : `actual ${s.pct.toFixed(2)}% minus target ${tgt?.toFixed(2) ?? '—'}%`
                              }
                            >
                              {drift > 0 ? '+' : ''}
                              {drift.toFixed(1)}
                            </Provenance>
                          ) : (
                            <span style={{ color: '#aaa' }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sumLine}
            {!sectorInfoOnly && thresholdsNote}
          </div>
        </div>
      )}

      {data.unclassified_tickers.length > 0 && (
        <p
          style={{
            marginTop: '1rem',
            padding: '0.5rem 0.75rem',
            background: '#fde7ea',
            color: 'crimson',
            borderRadius: 4,
          }}
        >
          Unclassified (missing from <code>data/classifications.yaml</code>):{' '}
          {data.unclassified_tickers.join(', ')}
        </p>
      )}
    </Frame>
  );
}

function DriftStatusPill({ band, maxDrift }: { band: DriftBand; maxDrift: number }) {
  const x = maxDrift.toFixed(1);
  if (band === 'on_target') {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.55rem',
          borderRadius: 999,
          fontSize: '0.8rem',
          fontWeight: 600,
          background: '#dcfce7',
          color: '#166534',
        }}
      >
        On target
      </span>
    );
  }
  if (band === 'minor') {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.55rem',
          borderRadius: 999,
          fontSize: '0.8rem',
          fontWeight: 600,
          background: '#fef3c7',
          color: '#92400e',
        }}
      >
        {x}% max drift
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.55rem',
        borderRadius: 999,
        fontSize: '0.8rem',
        fontWeight: 600,
        background: '#fee2e2',
        color: '#991b1b',
      }}
    >
      {x}% max drift · rebalance recommended
    </span>
  );
}

const btnPrimary: CSSProperties = {
  padding: '0.35rem 0.75rem',
  fontSize: '0.85rem',
  borderRadius: 4,
  border: '1px solid #166534',
  background: '#166534',
  color: '#fff',
  cursor: 'pointer',
};
const btnGhost: CSSProperties = {
  padding: '0.35rem 0.75rem',
  fontSize: '0.85rem',
  borderRadius: 4,
  border: '1px solid #ccc',
  background: '#fff',
  color: '#222',
  cursor: 'pointer',
};

function getDrillSlices(
  root: AllocationSlice[],
  drill: { assetClass: string; dim: Dim },
): AllocationSlice[] {
  const slice = root.find((s) => s.name === drill.assetClass);
  if (!slice) return [];
  const parentValue = slice.value;

  let raw: { name: string; value: number }[];
  if (drill.dim === 'geography') {
    raw = (slice.children ?? []).map((c) => ({ name: c.name, value: c.value }));
  } else if (drill.dim === 'sector') {
    raw = (slice.sector_breakdown ?? []).map((c) => ({ name: c.name, value: c.value }));
  } else {
    const sums = new Map<string, number>();
    for (const region of slice.children ?? []) {
      for (const sub of region.children ?? []) {
        sums.set(sub.name, (sums.get(sub.name) ?? 0) + sub.value);
      }
    }
    raw = Array.from(sums, ([name, value]) => ({ name, value }));
  }

  return raw
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s) => ({
      name: s.name,
      value: s.value,
      pct: parentValue > 0 ? (s.value / parentValue) * 100 : 0,
      tickers: [],
      children: [],
    }));
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>{children}</main>;
}

function formatUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUSDCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };
