'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';

import type {
  ClassificationSuggestItem,
  ExtractedPosition,
  Taxonomy,
} from '../lib/api';
import { Provenance } from '../lib/provenance';

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
        </table>
      </div>

      {children}
    </>
  );
}
