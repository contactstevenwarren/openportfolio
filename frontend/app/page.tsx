'use client';

// v0.1.6 hero: allocation chart + context-aware one-level drill-down.
// v0.2: targets + drift columns, save / prefill / clear targets. Chart: target-mode = angles
// from target %, outer radius from signed drift (under → inside base ring, over → outside),
// scaled to max |drift| in view; solid grey base-portfolio ring at baseline radius behind slices;
// slice colors = same palette as fallback donut. Fallback = value-angle donut when targets
// incomplete / sum off 100 (±2pp).
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

import { AllocationTable } from './components/AllocationTable';
import { DriftStatusPill } from './components/DriftStatusPill';
import {
  api,
  type AllocationResult,
  type AllocationSlice,
  type DriftBand,
  type TargetRow,
  type TargetsPayload,
} from './lib/api';
import {
  bandFromAbs,
  driftThresholds,
  effectiveDrift,
  EMPTY_TARGETS,
  entirePayloadValid,
  getGroupRows,
  rowPath,
  setGroupRows,
  sumTargetPct,
  targetSumOk,
} from './lib/allocationTargets';
import { buildAllocationChart } from './lib/buildAllocationChart';
import { DRILL_CONFIG, getDrillSlices, type Drill } from './lib/drill';
import { formatUSD, formatUSDCompact, humanize } from './lib/labels';
import { Provenance } from './lib/provenance';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

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

  const onDrillInto = useCallback((name: string) => {
    if (drill) return;
    const dims = DRILL_CONFIG[name];
    if (!dims) return;
    setDrill({ assetClass: name, dim: dims[0] });
  }, [drill]);

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

  const chart = useMemo(
    () =>
      buildAllocationChart({
        tableRows,
        targetRows,
        drill,
        minorPct: thresholds.minor_pct,
        centerTop,
        centerBottom,
      }),
    [tableRows, targetRows, drill, thresholds.minor_pct, centerTop, centerBottom],
  );

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

  const tableFooter = (
    <>
      {sumLine}
      {!sectorInfoOnly && thresholdsNote}
    </>
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
              click: (p: { name?: string; dataIndex?: number }) => {
                if (chart.mode === 'target' && typeof p.dataIndex === 'number') {
                  const n = chart.chartNames[p.dataIndex];
                  if (n) onDrillInto(n);
                } else if (p.name) {
                  onDrillInto(p.name);
                }
              },
            }}
            option={chart.option}
          />

          <AllocationTable
            tableRows={tableRows}
            drill={drill}
            sectorInfoOnly={sectorInfoOnly}
            targetRows={targetRows}
            onDrillInto={onDrillInto}
            onPatchTargetPct={patchTargetPct}
            footer={tableFooter}
          />
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

function Frame({ children }: { children: React.ReactNode }) {
  return <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>{children}</main>;
}
