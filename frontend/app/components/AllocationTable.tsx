'use client';

import type { ReactNode } from 'react';

import type { AllocationSlice, TargetRow } from '../lib/api';
import { effectiveDrift, effectiveTarget } from '../lib/allocationTargets';
import { DRILL_CONFIG, type Drill } from '../lib/drill';
import { formatUSD, humanize } from '../lib/labels';
import { Provenance } from '../lib/provenance';

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };

type Props = {
  tableRows: AllocationSlice[];
  drill: Drill;
  sectorInfoOnly: boolean;
  targetRows: TargetRow[];
  onDrillInto: (name: string) => void;
  onPatchTargetPct: (sliceName: string, pct: number) => void;
  footer: ReactNode;
};

export function AllocationTable({
  tableRows,
  drill,
  sectorInfoOnly,
  targetRows,
  onDrillInto,
  onPatchTargetPct,
  footer,
}: Props) {
  return (
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
                  {drillable && <span style={{ color: '#aaa', marginLeft: 6 }}>›</span>}
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
                        onPatchTargetPct(s.name, v);
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
      {footer}
    </div>
  );
}
