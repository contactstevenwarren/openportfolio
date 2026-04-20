'use client';

// v0.1.6 hero: single donut + context-aware one-level drill-down.
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
import { useState } from 'react';
import useSWR from 'swr';

import { api, type AllocationResult, type AllocationSlice } from './lib/api';
import { humanize } from './lib/labels';
import { Provenance } from './lib/provenance';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type Dim = 'geography' | 'sector' | 'sub_class';
type Drill = { assetClass: string; dim: Dim } | null;

// Which asset classes are drillable and which dimensions each supports.
// First dim is the default when the user drills in. Asset classes absent
// from this map render without the `›` chevron and ignore slice/row
// clicks (commodity, private).
const DRILL_CONFIG: Record<string, Dim[]> = {
  equity: ['geography', 'sector'],
  fixed_income: ['sub_class'],
  real_estate: ['sub_class'],
  cash: ['sub_class'],
  crypto: ['sub_class'],
};

export default function Home() {
  const { data, error, isLoading } = useSWR<AllocationResult>(
    '/api/allocation',
    api.allocation,
  );
  const [drill, setDrill] = useState<Drill>(null);

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

  const root = data.by_asset_class;
  const parentSlice = drill ? root.find((s) => s.name === drill.assetClass) ?? null : null;
  const drillSlices = drill ? getDrillSlices(root, drill) : [];
  const tableRows: AllocationSlice[] = drill ? drillSlices : root.filter((s) => s.value > 0);

  const onDrillInto = (name: string) => {
    if (drill) return;
    const dims = DRILL_CONFIG[name];
    if (!dims) return;
    setDrill({ assetClass: name, dim: dims[0] });
  };

  const centerTop = drill ? humanize(drill.assetClass) : '';
  const centerBottom = drill && parentSlice ? formatUSDCompact(parentSlice.value) : '';
  const emptyDrill = drill !== null && tableRows.length === 0;

  return (
    <Frame>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 500, margin: '0 0 1rem' }}>
        Net worth ·{' '}
        <Provenance source="sum of committed positions (market_value → cost_basis fallback)">
          {formatUSD(data.total)}
        </Provenance>
      </h1>

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
            option={{
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
                  data: tableRows.map((s) => ({ name: s.name, value: s.value })),
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
            }}
          />

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                <th style={th}>{drill ? 'Sub-category' : 'Category'}</th>
                <th style={th}>Value ($)</th>
                <th style={th}>{drill ? '% of parent' : '% of portfolio'}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((s) => {
                const drillable = !drill && s.name in DRILL_CONFIG;
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
                  </tr>
                );
              })}
            </tbody>
          </table>
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

// Pure-function derivation of a drill-down view from the root slice tree.
// Percentages are re-computed against the parent asset class total so
// they sum to 100% within the drill (not the root's % of net worth).
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
    // sub_class: flatten children.children (region → sub_class) and sum
    // by sub_class name. The backend already emits a region ring for
    // every asset class, so this collapses the region dimension.
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
