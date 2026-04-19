'use client';

// M4 hero screen.
//   Ring 1  asset_class   (equity / fixed_income / real_estate / ...)
//   Ring 2  region        (US / intl_developed / emerging / global / other)
//   Ring 3  sub_class     (us_large_cap / us_aggregate / cd / direct / ...)
//
// The 5-number summary strip on top is the acceptance bar from roadmap
// phase 0.1 -- a user must answer "what fraction is cash?" in <5s
// without hovering.

import dynamic from 'next/dynamic';
import { useState } from 'react';
import useSWR from 'swr';

import { api, type AllocationResult, type AllocationSlice } from './lib/api';
import { Provenance } from './lib/provenance';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function Home() {
  const { data, error, isLoading } = useSWR<AllocationResult>(
    '/api/allocation',
    api.allocation,
  );
  const [drill, setDrill] = useState<string[] | null>(null);

  if (isLoading) return <Frame>Loading…</Frame>;
  if (error) {
    return (
      <Frame>
        <p style={{ color: 'crimson' }}>Failed to load allocation: {(error as Error).message}</p>
        <p>
          If this is a fresh install, head to <a href="/paste">/paste</a> first.
        </p>
      </Frame>
    );
  }
  if (!data) return <Frame>No data.</Frame>;

  const summary = data.summary;

  return (
    <Frame>
      {/* 5-number summary strip */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.75rem',
            margin: '0 0 1.5rem',
            padding: '1rem',
            borderRadius: 6,
            background: '#f5f7fa',
          }}
        >
          <SummaryCell
            label="Net worth"
            value={formatUSD(summary.net_worth)}
            provenance="sum of committed positions (market_value → cost_basis fallback)"
          />
          <SummaryCell
            label="Cash"
            value={formatPct(summary.cash_pct)}
            provenance="cash asset class ÷ net worth"
          />
          <SummaryCell
            label="US equity"
            value={formatPct(summary.us_equity_pct)}
            provenance="equity (region=US, look-through weighted) ÷ net worth"
          />
          <SummaryCell
            label="Intl equity"
            value={formatPct(summary.intl_equity_pct)}
            provenance="equity (region≠US, look-through weighted) ÷ net worth"
          />
          <SummaryCell
            label="Alts"
            value={formatPct(summary.alts_pct)}
            provenance="real_estate + commodity + crypto + private ÷ net worth"
          />
        </div>
      )}

      {data.total === 0 ? (
        <p style={{ color: '#555' }}>
          No positions committed yet. Start at <a href="/paste">/paste</a> or{' '}
          <a href="/manual">/manual</a>.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          <ReactECharts
            style={{ height: 520 }}
            onEvents={{
              click: (p: { treePathInfo?: Array<{ name: string }> }) => {
                if (p.treePathInfo && p.treePathInfo.length > 1) {
                  // path[0] is the synthetic root -- skip it.
                  setDrill(p.treePathInfo.slice(1).map((n) => n.name));
                }
              },
            }}
            option={{
              tooltip: {
                trigger: 'item',
                formatter: (p: { name: string; value: number }) =>
                  `${p.name}: ${formatUSD(p.value)} (${((p.value / data.total) * 100).toFixed(1)}%)`,
              },
              series: [
                {
                  type: 'sunburst',
                  radius: [20, '92%'],
                  data: buildSunburstData(data.by_asset_class),
                  label: { rotate: 'radial', minAngle: 18 },
                  levels: [
                    {},
                    { r0: '0%', r: '35%', itemStyle: { borderWidth: 2 } },
                    { r0: '35%', r: '65%', itemStyle: { borderWidth: 2 } },
                    { r0: '65%', r: '92%', itemStyle: { borderWidth: 2 } },
                  ],
                  itemStyle: { borderColor: '#fff', borderWidth: 2 },
                  emphasis: { focus: 'ancestor' },
                },
              ],
            }}
          />

          <DrillPanel data={data} drill={drill} onReset={() => setDrill(null)} />
        </div>
      )}

      <BreakdownTable data={data} />

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

function SummaryCell({
  label,
  value,
  provenance,
}: {
  label: string;
  value: string;
  provenance: string;
}) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 2 }}>
        <Provenance source={provenance}>{value}</Provenance>
      </div>
    </div>
  );
}

function DrillPanel({
  data,
  drill,
  onReset,
}: {
  data: AllocationResult;
  drill: string[] | null;
  onReset: () => void;
}) {
  if (!drill) {
    return (
      <aside
        style={{
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: 6,
          background: '#fafafa',
          fontSize: '0.9rem',
          color: '#555',
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Drill-down</h3>
        <p>Click a wedge to see the positions contributing to it.</p>
      </aside>
    );
  }

  const slice = findSlice(data.by_asset_class, drill);
  return (
    <aside
      style={{
        padding: '1rem',
        border: '1px solid #ddd',
        borderRadius: 6,
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>{drill.join(' › ')}</h3>
        <button onClick={onReset} style={{ fontSize: '0.8rem' }}>
          Reset
        </button>
      </div>
      {slice ? (
        <>
          <p style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0.5rem 0' }}>
            <Provenance source={`wedge: ${drill.join(' › ')}`}>
              {formatUSD(slice.value)}
            </Provenance>{' '}
            <span style={{ color: '#666', fontWeight: 400, fontSize: '0.9rem' }}>
              ({slice.pct.toFixed(1)}%)
            </span>
          </p>
          {drill.length === 1 && slice.tickers && slice.tickers.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.75rem' }}>
                Contributing tickers
              </div>
              <ul style={{ paddingLeft: '1.25rem', margin: '0.25rem 0' }}>
                {slice.tickers.map((t) => {
                  const src = data.classification_sources[t];
                  return (
                    <li key={t}>
                      <code>{t}</code>
                      {src === 'user' && (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: '0 0.4rem',
                            fontSize: '0.7rem',
                            background: '#fff5d6',
                            border: '1px solid #e0c873',
                            borderRadius: 3,
                          }}
                          title="Classification overridden on /classifications"
                        >
                          your override
                        </span>
                      )}
                      {src === 'prefix' && (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: '0 0.4rem',
                            fontSize: '0.7rem',
                            background: '#f0f0f0',
                            border: '1px solid #ccc',
                            borderRadius: 3,
                            color: '#666',
                          }}
                          title="Synthetic prefix fallback; will migrate in v0.1.5 M4"
                        >
                          prefix
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {slice.children && slice.children.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.75rem' }}>
                Children
              </div>
              <ul style={{ paddingLeft: '1.25rem', margin: '0.25rem 0' }}>
                {slice.children.map((c) => (
                  <li key={c.name}>
                    {c.name} — {formatUSD(c.value)} ({c.pct.toFixed(1)}%)
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p style={{ color: '#888' }}>No data for that wedge.</p>
      )}
    </aside>
  );
}

function BreakdownTable({ data }: { data: AllocationResult }) {
  return (
    <>
      <h2 style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>Breakdown (asset class)</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
            <th style={th}>Asset class</th>
            <th style={th}>Value</th>
            <th style={th}>%</th>
            <th style={th}>Holdings</th>
          </tr>
        </thead>
        <tbody>
          {data.by_asset_class.map((s) => (
            <tr key={s.name} style={{ borderBottom: '1px solid #eee' }}>
              <td style={td}>{s.name}</td>
              <td style={td}>
                <Provenance
                  source={`sum of ${s.tickers?.length ?? 0} position(s): ${(s.tickers ?? []).join(', ') || '—'}`}
                >
                  {formatUSD(s.value)}
                </Provenance>
              </td>
              <td style={td}>{s.pct.toFixed(1)}%</td>
              <td style={{ ...td, color: '#555' }}>{(s.tickers ?? []).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type SunburstNode = {
  name: string;
  value: number;
  children?: SunburstNode[];
};

function buildSunburstData(root: AllocationSlice[]): SunburstNode[] {
  function toNode(s: AllocationSlice): SunburstNode {
    if (!s.children || s.children.length === 0) {
      return { name: s.name, value: s.value };
    }
    return { name: s.name, value: s.value, children: s.children.map(toNode) };
  }
  return root.filter((s) => s.value > 0).map(toNode);
}

function findSlice(root: AllocationSlice[], path: string[]): AllocationSlice | null {
  let current: AllocationSlice[] = root;
  let match: AllocationSlice | null = null;
  for (const name of path) {
    const found = current.find((s) => s.name === name);
    if (!found) return null;
    match = found;
    current = found.children ?? [];
  }
  return match;
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>{children}</main>;
}

function formatUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };
