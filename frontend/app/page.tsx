'use client';

// Hero screen: total net worth + 1-ring ECharts sunburst colored by
// asset class (roadmap section 4 v0.1 acceptance "answer what fraction
// is cash in <5s"). M4 expands to a 3-ring sunburst with look-through
// and adds the 5-number summary strip.

import dynamic from 'next/dynamic';
import useSWR from 'swr';

import { api, type AllocationResult } from './lib/api';
import { Provenance } from './lib/provenance';

// ECharts touches window at import; keep it out of the server bundle.
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function Home() {
  const { data, error, isLoading } = useSWR<AllocationResult>(
    '/api/allocation',
    api.allocation,
  );

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

  return (
    <Frame>
      <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
        Total net worth{' '}
        <span style={{ color: '#888' }}>(paste-time market value; M4 adds live pricing)</span>
      </p>
      <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0.25rem 0 1.5rem' }}>
        <Provenance source="sum of committed positions (market_value → cost_basis fallback)">
          {formatUSD(data.total)}
        </Provenance>
      </p>

      {data.total === 0 ? (
        <p style={{ color: '#555' }}>
          No positions committed yet. Start at <a href="/paste">/paste</a>.
        </p>
      ) : (
        <>
          <ReactECharts
            style={{ height: 480 }}
            option={{
              tooltip: {
                trigger: 'item',
                formatter: '{b}: ${c} ({d}%)',
              },
              series: [
                {
                  type: 'sunburst',
                  radius: [0, '90%'],
                  data: data.by_asset_class.map((s) => ({ name: s.name, value: s.value })),
                  label: { formatter: '{b}\n{d}%' },
                  itemStyle: { borderColor: '#fff', borderWidth: 2 },
                  emphasis: { focus: 'ancestor' },
                },
              ],
            }}
          />

          <h2 style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>Breakdown</h2>
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
                      source={`sum of ${s.tickers.length} position(s): ${s.tickers.join(', ')}`}
                    >
                      {formatUSD(s.value)}
                    </Provenance>
                  </td>
                  <td style={td}>{s.pct.toFixed(1)}%</td>
                  <td style={{ ...td, color: '#555' }}>{s.tickers.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>

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
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>{children}</main>;
}

function formatUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };
