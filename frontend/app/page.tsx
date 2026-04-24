'use client';

// v0.1.6 hero: allocation chart + context-aware one-level drill-down.
// v0.2: targets + drift (read-only on hero); edit on /targets. Chart: slice angles = actual %;
// outer radius bumps from signed drift only where a target exists (under → inside base ring,
// over → outside), scaled to max |drift| among targeted slices; grey baseline ring always behind
// slices; same ECharts category palette per slice.
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
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

import { AllocationTable } from './components/AllocationTable';
import { DriftStatusPill } from './components/DriftStatusPill';
import {
  api,
  type AllocationResult,
  type AllocationSlice,
  type DriftBand,
  type TargetsPayload,
} from './lib/api';
import {
  bandFromAbs,
  driftThresholds,
  effectiveDrift,
  EMPTY_TARGETS,
  getGroupRows,
  isTargetsEmpty,
  seedFromActuals,
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
  const autoSeedStarted = useRef(false);

  useEffect(() => {
    if (remoteTargets !== undefined) {
      setTargets(remoteTargets ?? EMPTY_TARGETS);
    }
  }, [remoteTargets]);

  useEffect(() => {
    if (!data) return;
    const targetsKnown = remoteTargets !== undefined || targetsError != null;
    if (!targetsKnown) return;
    if (autoSeedStarted.current) return;
    const existing = targetsError != null ? EMPTY_TARGETS : remoteTargets!;
    if (!isTargetsEmpty(existing)) return;
    if (data.total === 0) return;
    autoSeedStarted.current = true;
    void (async () => {
      try {
        await api.putTargets(seedFromActuals(data));
        await mutateTargets();
      } catch {
        autoSeedStarted.current = false;
      }
    })();
  }, [data, remoteTargets, targetsError, mutateTargets]);

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
          Targets could not be loaded; drift may be unavailable until you save targets on{' '}
          <Link href="/targets">/targets</Link>.
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

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        {statusPill.max != null && statusPill.band && (
          <DriftStatusPill band={statusPill.band} maxDrift={statusPill.max} />
        )}
        {!sectorInfoOnly && (
          <Link href="/targets" style={{ fontSize: '0.9rem', color: '#2563eb' }}>
            Edit targets
          </Link>
        )}
      </div>

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
              click: (p: { dataIndex?: number }) => {
                if (typeof p.dataIndex !== 'number') return;
                const n = chart.chartNames[p.dataIndex];
                if (n) onDrillInto(n);
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

function Frame({ children }: { children: React.ReactNode }) {
  return <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>{children}</main>;
}
