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
  footer?: ReactNode;
};

export function AllocationTable({
  tableRows,
  drill,
  sectorInfoOnly,
  targetRows,
  onDrillInto,
  footer = null,
}: Props) {
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
            <th style={th}>{drill ? 'Sub-category' : 'Category'}</th>
            <th style={th}>{drill ? '% of parent' : '% of portfolio'}</th>
            {!sectorInfoOnly && <th style={th}>Target %</th>}
            {!sectorInfoOnly && <th style={th}>Drift (pp)</th>}
            <th style={th}>Value ($)</th>
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
                    {tgt != null ? (
                      <Provenance
                        source={
                          s.target_pct != null
                            ? 'target_pct from allocation API'
                            : 'saved target row for this slice'
                        }
                      >
                        {tgt.toFixed(1)}%
                      </Provenance>
                    ) : (
                      <span style={{ color: '#aaa' }}>—</span>
                    )}
                  </td>
                )}
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
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
