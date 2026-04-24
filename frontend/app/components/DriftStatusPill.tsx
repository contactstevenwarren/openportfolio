import type { DriftBand } from '../lib/api';

export function DriftStatusPill({ band, maxDrift }: { band: DriftBand; maxDrift: number }) {
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
