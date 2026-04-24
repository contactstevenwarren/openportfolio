'use client';

// v0.5 Rebalance recommendations. Two modes:
//   "full"      -- show sells + buys to close drift against current net worth
//   "new_money" -- allocate a positive contribution with no sells
//
// L1 rows render flat; L2 rows render indented under their parent when the
// class has any group targets. Uses the same inline-style palette as the
// rest of the hero. No live-update in new-money mode: the user clicks
// "Compute" after typing an amount (grill-me decision).

import Link from 'next/link';
import { useCallback, useState } from 'react';

import {
  api,
  RebalanceStaleTargetsError,
  type RebalanceDirection,
  type RebalanceMove,
  type RebalanceResult,
} from '../lib/api';
import { formatUSD, humanize } from '../lib/labels';
import { Provenance } from '../lib/provenance';

type Props = {
  isHeroRoot: boolean;
};

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };

export function RebalancePanel({ isHeroRoot }: Props) {
  const [mode, setMode] = useState<'full' | 'new_money'>('full');
  const [amountInput, setAmountInput] = useState<string>('');
  const [result, setResult] = useState<RebalanceResult | null>(null);
  const [stale, setStale] = useState<RebalanceStaleTargetsError['detail'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchFull = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setStale(null);
    try {
      const r = await api.rebalance('full');
      setResult(r);
    } catch (e) {
      if (e instanceof RebalanceStaleTargetsError) setStale(e.detail);
      else setLoadError((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNewMoney = useCallback(async () => {
    const amt = Number(amountInput);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setLoading(true);
    setLoadError(null);
    setStale(null);
    try {
      const r = await api.rebalance('new_money', amt);
      setResult(r);
    } catch (e) {
      if (e instanceof RebalanceStaleTargetsError) setStale(e.detail);
      else setLoadError((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [amountInput]);

  // Auto-load the "full" result once on first render when rebalance mode is full.
  // No fetch in new-money mode until the user clicks Compute.
  const [autoLoaded, setAutoLoaded] = useState(false);
  if (!autoLoaded && mode === 'full' && !loading && result == null && stale == null && loadError == null) {
    setAutoLoaded(true);
    void fetchFull();
  }

  const onSwitchMode = (next: 'full' | 'new_money') => {
    setMode(next);
    setResult(null);
    setStale(null);
    setLoadError(null);
    if (next === 'full') {
      setAutoLoaded(true);
      void fetchFull();
    } else {
      setAutoLoaded(false);
    }
  };

  // Panel is anchored to the hero root view. Inside a drill we keep the
  // existing drift pill + table; rebalance stays at root per v0.5 scope.
  if (!isHeroRoot) return null;

  const amountValid =
    amountInput.trim().length > 0 && Number.isFinite(Number(amountInput)) && Number(amountInput) > 0;

  return (
    <section
      style={{
        marginTop: '1.5rem',
        padding: '1rem',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        background: '#fafafa',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Rebalance</h2>
        <ModeToggle mode={mode} onChange={onSwitchMode} />
        {mode === 'new_money' && (
          <NewMoneyInput
            value={amountInput}
            onChange={setAmountInput}
            onCompute={fetchNewMoney}
            disabled={loading || !amountValid}
          />
        )}
      </div>

      {stale && <StaleTargetsBanner detail={stale} />}
      {loadError && (
        <p style={{ color: 'crimson', fontSize: '0.9rem' }}>
          Could not load recommendations: {loadError}
        </p>
      )}
      {loading && <p style={{ color: '#666', fontSize: '0.9rem' }}>Computing…</p>}

      {result && !stale && !loadError && (
        <MovesTable result={result} mode={mode} />
      )}

      {result && !stale && !loadError && result.moves.length === 0 && (
        <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Set L1 targets on <Link href="/targets" style={{ color: '#2563eb' }}>/targets</Link> to see
          rebalance recommendations.
        </p>
      )}
    </section>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'full' | 'new_money';
  onChange: (next: 'full' | 'new_money') => void;
}) {
  const btn = (active: boolean) => ({
    padding: '0.25rem 0.75rem',
    fontSize: '0.85rem',
    border: '1px solid #ccc',
    borderRadius: 4,
    background: active ? '#222' : '#fff',
    color: active ? '#fff' : '#222',
    cursor: 'pointer' as const,
  });
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button style={btn(mode === 'full')} onClick={() => onChange('full')}>
        Rebalance existing
      </button>
      <button style={btn(mode === 'new_money')} onClick={() => onChange('new_money')}>
        New money
      </button>
    </div>
  );
}

function NewMoneyInput({
  value,
  onChange,
  onCompute,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onCompute: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <label style={{ fontSize: '0.85rem', color: '#333' }}>Contribution $</label>
      <input
        type="number"
        min="0"
        step="100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !disabled) onCompute();
        }}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.85rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          width: 120,
        }}
      />
      <button
        onClick={onCompute}
        disabled={disabled}
        style={{
          padding: '0.25rem 0.75rem',
          fontSize: '0.85rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          background: disabled ? '#eee' : '#222',
          color: disabled ? '#888' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Compute
      </button>
    </div>
  );
}

function StaleTargetsBanner({ detail }: { detail: RebalanceStaleTargetsError['detail'] }) {
  return (
    <div
      style={{
        padding: '0.6rem 0.75rem',
        background: '#fef3c7',
        color: '#92400e',
        border: '1px solid #fcd34d',
        borderRadius: 4,
        fontSize: '0.9rem',
        marginBottom: '0.5rem',
      }}
    >
      Your {humanize(detail.asset_class)} targets are out of date
      {detail.missing_paths.length > 0 && (
        <> (missing: {detail.missing_paths.map((p) => p.split('.').pop()).join(', ')})</>
      )}
      . <Link href="/targets" style={{ color: '#92400e', textDecoration: 'underline' }}>Edit targets</Link> to
      include every sub-class before rebalancing.
    </div>
  );
}

function MovesTable({ result, mode }: { result: RebalanceResult; mode: 'full' | 'new_money' }) {
  if (result.moves.length === 0) return null;

  return (
    <>
      {mode === 'full' && (
        <p style={{ fontSize: '0.82rem', color: '#555', margin: '0 0 0.6rem', lineHeight: 1.45 }}>
          Top row: dollars vs your whole portfolio. Indented rows: how that parent move is split
          across sub-buckets (overweights lose first on sells; underweights gain first on buys).
          Sub-row dollars add up to the parent row.
        </p>
      )}
      {mode === 'new_money' && (
        <p style={{ fontSize: '0.82rem', color: '#555', margin: '0 0 0.6rem', lineHeight: 1.45 }}>
          Contribution is allocated by gap-fill, then excess among classes at or under target; L2
          splits each class&apos;s share inside that class.
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
            <th style={th}>Category</th>
            <th style={th}>Target</th>
            <th style={th}>Actual</th>
            <th style={th}>Move</th>
            <th style={th}>Move ($)</th>
          </tr>
        </thead>
        <tbody>
          {result.moves.flatMap((m) => [
            <MoveRow key={m.path} move={m} depth={0} mode={result.mode} />,
            ...m.children.map((c) => (
              <MoveRow key={c.path} move={c} depth={1} mode={result.mode} />
            )),
          ])}
        </tbody>
      </table>
    </>
  );
}

function MoveRow({
  move,
  depth,
  mode,
}: {
  move: RebalanceMove;
  depth: number;
  mode: 'full' | 'new_money';
}) {
  const label = humanize(depth === 0 ? move.path : move.path.split('.').slice(1).join('.'));
  const dollar = Math.round(move.delta_usd);
  // In new-money mode an over-target class receives $0 but backend labels it
  // "buy" (direction is driven by drift, not dollars). Suppress the noise by
  // rendering $0 as a dash regardless of label.
  const showDash = mode === 'new_money' && dollar === 0;

  return (
    <tr
      style={{
        borderBottom: '1px solid #eee',
        background: depth > 0 ? '#f5f5f5' : undefined,
      }}
    >
      <td style={{ ...td, paddingLeft: depth > 0 ? '1.75rem' : td.padding }}>{label}</td>
      <td style={td}>{move.target_pct.toFixed(1)}%</td>
      <td style={td}>{move.actual_pct.toFixed(1)}%</td>
      <td style={td}>
        <DirectionBadge direction={showDash ? 'hold' : move.direction} dashed={showDash} />
      </td>
      <td style={td}>
        {showDash ? (
          <span style={{ color: '#aaa' }}>—</span>
        ) : (
          <Provenance source={provenanceFor(move, mode, depth)}>
            {formatUSD(Math.abs(dollar))}
          </Provenance>
        )}
      </td>
    </tr>
  );
}

function DirectionBadge({
  direction,
  dashed,
}: {
  direction: RebalanceDirection;
  dashed: boolean;
}) {
  if (dashed) return <span style={{ color: '#aaa' }}>—</span>;
  const palette: Record<RebalanceDirection, { bg: string; fg: string; label: string }> = {
    buy: { bg: '#dcfce7', fg: '#166534', label: 'Buy' },
    sell: { bg: '#fee2e2', fg: '#991b1b', label: 'Sell' },
    hold: { bg: '#e5e7eb', fg: '#374151', label: 'Hold' },
  };
  const p = palette[direction];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
        background: p.bg,
        color: p.fg,
      }}
    >
      {p.label}
    </span>
  );
}

function provenanceFor(move: RebalanceMove, mode: 'full' | 'new_money', depth: number): string {
  const driftPct = move.target_pct - move.actual_pct;
  if (mode === 'full' && depth === 0) {
    return (
      `(target ${move.target_pct.toFixed(2)}% − actual ${move.actual_pct.toFixed(2)}%) ` +
      `÷ 100 × net worth ${formatUSD(move.parent_total_usd)} = ${formatUSD(move.delta_usd)} ` +
      `(drift ${driftPct.toFixed(2)} pp vs portfolio)`
    );
  }
  if (mode === 'full' && depth > 0) {
    const parentClass = move.path.includes('.') ? move.path.slice(0, move.path.indexOf('.')) : '';
    return (
      `Share of the ${humanize(parentClass)} row above: ${formatUSD(move.delta_usd)} ` +
      `allocated across sub-buckets by dollars over target (sells) or under target (buys) ` +
      `within ${humanize(parentClass)}; sub-rows sum to that parent dollar move. ` +
      `Shown target/actual are % of ${humanize(parentClass)} (${move.target_pct.toFixed(1)}% vs ${move.actual_pct.toFixed(1)}%).`
    );
  }
  return (
    `new-money allocation toward target ${move.target_pct.toFixed(2)}% ` +
    `(actual ${move.actual_pct.toFixed(2)}%, parent ${formatUSD(move.parent_total_usd)})`
  );
}
