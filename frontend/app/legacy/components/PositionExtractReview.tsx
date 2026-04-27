'use client';

import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import type {
  ClassificationSuggestItem,
  ExtractedPosition,
  Taxonomy,
} from '../../lib/api';
import { Provenance } from '../../lib/provenance';

export type PositionExtractReviewProps = {
  rows: ExtractedPosition[];
  selected: Set<number>;
  toggle: (index: number) => void;
  updateRow: (index: number, patch: Partial<ExtractedPosition>) => void;
  taxonomy: Taxonomy | null;
  assetClassByIndex: Record<number, string>;
  setAssetClassByIndex: Dispatch<SetStateAction<Record<number, string>>>;
  suggestionByTicker: Record<string, ClassificationSuggestItem>;
  busy: boolean;
  onRefreshHints: () => void;
  children?: ReactNode;
};

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.35rem 0.25rem', verticalAlign: 'top' as const };

function rowBg(confidence: number, hasErrors: boolean): string {
  if (hasErrors) return '#fde7ea';
  if (confidence >= 0.95) return '#e7f5e8';
  if (confidence >= 0.8) return '#fffbe0';
  return '#fde7ea';
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function sumMoney(
  rows: ExtractedPosition[],
  include: (i: number) => boolean,
): { cost: number | null; market: number | null } {
  let cost = 0;
  let market = 0;
  let hasCost = false;
  let hasMarket = false;
  rows.forEach((r, i) => {
    if (!include(i)) return;
    if (r.cost_basis != null) {
      cost += r.cost_basis;
      hasCost = true;
    }
    if (r.market_value != null) {
      market += r.market_value;
      hasMarket = true;
    }
  });
  return {
    cost: hasCost ? cost : null,
    market: hasMarket ? market : null,
  };
}

export function PositionExtractReview({
  rows,
  selected,
  toggle,
  updateRow,
  taxonomy,
  assetClassByIndex,
  setAssetClassByIndex,
  suggestionByTicker,
  busy,
  onRefreshHints,
  children,
}: PositionExtractReviewProps) {
  const totalsAll = useMemo(
    () => sumMoney(rows, () => true),
    [rows],
  );
  const totalsSelected = useMemo(
    () => sumMoney(rows, (i) => selected.has(i)),
    [rows, selected],
  );

  return (
    <>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        Edit tickers? Use &quot;Refresh classification hints&quot; to re-fetch LLM suggestions.
      </p>
      <div style={{ marginBottom: '0.75rem' }}>
        <button type="button" onClick={onRefreshHints} disabled={busy}>
          Refresh classification hints
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={th}></th>
              <th style={th}>Ticker</th>
              <th style={th}>Asset class</th>
              <th style={th}>Shares</th>
              <th style={th}>Cost basis</th>
              <th style={th}>Market value</th>
              <th style={th}>Confidence</th>
              <th style={th}>Source span</th>
              <th style={th}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const sug = suggestionByTicker[r.ticker.trim()];
              return (
                <tr
                  key={i}
                  style={{
                    background: rowBg(r.confidence, r.validation_errors.length > 0),
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <td style={td}>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  </td>
                  <td style={td}>
                    <input
                      value={r.ticker}
                      onChange={(e) => updateRow(i, { ticker: e.target.value })}
                      size={10}
                    />
                  </td>
                  <td style={td}>
                    <select
                      value={assetClassByIndex[i] ?? ''}
                      onChange={(e) =>
                        setAssetClassByIndex((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                      style={{ maxWidth: 160 }}
                      disabled={!taxonomy}
                    >
                      <option value="">— Unclassified —</option>
                      {taxonomy?.asset_classes.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '0.75rem', color: '#555', marginTop: 4 }}>
                      {sug?.source === 'existing' && (
                        <span title="Bundled YAML or saved row — change to create an override">
                          baseline
                        </span>
                      )}
                      {sug?.source === 'llm' && sug.confidence != null && (
                        <Provenance source="llm-classify" confidence={sug.confidence}>
                          LLM {(sug.confidence * 100).toFixed(0)}%
                        </Provenance>
                      )}
                      {sug?.source === 'none' && <span>no hint</span>}
                    </div>
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      value={r.shares}
                      onChange={(e) => updateRow(i, { shares: Number(e.target.value) })}
                      step="any"
                      style={{ width: 90 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      value={r.cost_basis ?? ''}
                      onChange={(e) =>
                        updateRow(i, {
                          cost_basis: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      step="any"
                      style={{ width: 100 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      value={r.market_value ?? ''}
                      onChange={(e) =>
                        updateRow(i, {
                          market_value: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      step="any"
                      style={{ width: 110 }}
                    />
                  </td>
                  <td style={td}>
                    <Provenance source="llm-extract" confidence={r.confidence}>
                      {(r.confidence * 100).toFixed(0)}%
                    </Provenance>
                  </td>
                  <td
                    style={{
                      ...td,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: '0.8rem',
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={r.source_span}
                  >
                    {r.source_span}
                  </td>
                  <td style={{ ...td, color: 'crimson', fontSize: '0.8rem' }}>
                    {r.validation_errors.join('; ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #bbb', background: '#f0f4f8' }}>
              <td colSpan={4} style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                Total (all rows)
              </td>
              <td style={td} />
              <td style={{ ...td, fontWeight: 600 }}>
                {totalsAll.cost != null ? (
                  <Provenance source="Review table: sum of cost basis (all rows)">
                    {fmtUsd(totalsAll.cost)}
                  </Provenance>
                ) : (
                  '—'
                )}
              </td>
              <td style={{ ...td, fontWeight: 600 }}>
                {totalsAll.market != null ? (
                  <Provenance source="Review table: sum of market value (all rows)">
                    {fmtUsd(totalsAll.market)}
                  </Provenance>
                ) : (
                  '—'
                )}
              </td>
              <td colSpan={3} style={td}>
                Compare to your statement totals.
              </td>
            </tr>
            <tr style={{ background: '#e8eef5' }}>
              <td colSpan={4} style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                Total (selected)
              </td>
              <td style={td} />
              <td style={{ ...td, fontWeight: 600 }}>
                {totalsSelected.cost != null ? (
                  <Provenance source="Review table: sum of cost basis (selected rows)">
                    {fmtUsd(totalsSelected.cost)}
                  </Provenance>
                ) : (
                  '—'
                )}
              </td>
              <td style={{ ...td, fontWeight: 600 }}>
                {totalsSelected.market != null ? (
                  <Provenance source="Review table: sum of market value (selected rows)">
                    {fmtUsd(totalsSelected.market)}
                  </Provenance>
                ) : (
                  '—'
                )}
              </td>
              <td colSpan={3} style={{ ...td, fontSize: '0.8rem', color: '#555' }}>
                Rows included in commit
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {children}
    </>
  );
}
