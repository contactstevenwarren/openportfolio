'use client';

// v0.5 Rebalance recommendations. Two modes:
//   "full"      -- show sells + buys to close drift against current net worth
//   "new_money" -- allocate a positive contribution with no sells
//
// Compact action-oriented layout: Action | Category | Move | New Position.
// Hold rows are hidden. L1 rows with L2 children are click-expandable.

import Link from 'next/link';
import { useCallback, useState } from 'react';

import {
  api,
  RebalanceStaleTargetsError,
  type RebalanceDirection,
  type RebalanceMove,
  type RebalanceResult,
} from '../lib/api';
import { formatUSD, formatUSDCompact, humanize } from '../lib/labels';
import { Provenance } from '../lib/provenance';

type Props = {
  isHeroRoot: boolean;
};

const th = { padding: '0.5rem 0.25rem', fontWeight: 600 };
const td = { padding: '0.5rem 0.25rem' };

const ACTION_COLOR: Record<RebalanceDirection, string> = {
  buy: '#166534',
  sell: '#991b1b',
  hold: '#6b7280',
};

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (result.moves.length === 0) return null;

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const visibleL1 = result.moves.filter((m) => m.direction !== 'hold');

  return (
    <>
      <p style={{ fontSize: '0.95rem', color: '#222', margin: '0 0 0.5rem', fontWeight: 500 }}>
        Rebalancing plan (on {formatUSDCompact(result.total)} investable)
      </p>
      <p style={{ fontSize: '0.82rem', color: '#666', margin: '0 0 0.6rem', lineHeight: 1.45 }}>
        {mode === 'full'
          ? 'Trades to bring every targeted class back to its target weight. Click a row to see how it splits across sub-classes.'
          : 'Allocates contribution to under-target classes (gap-fill first, then proportional to target).'}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
            <th style={th}>Action</th>
            <th style={th}>Category</th>
            <th style={th}>Move</th>
            <th style={th}>New Position</th>
          </tr>
        </thead>
        <tbody>
          {visibleL1.flatMap((m) => {
            const isOpen = expanded.has(m.path);
            const visibleChildren = isOpen ? m.children.filter((c) => c.direction !== 'hold') : [];
            return [
              <MoveRow
                key={m.path}
                move={m}
                depth={0}
                mode={result.mode}
                expandable={m.children.length > 0}
                expanded={isOpen}
                onToggle={() => toggle(m.path)}
              />,
              ...visibleChildren.map((c) => (
                <MoveRow
                  key={c.path}
                  move={c}
                  depth={1}
                  mode={result.mode}
                  expandable={false}
                  expanded={false}
                  onToggle={() => {}}
                />
              )),
            ];
          })}
        </tbody>
      </table>
      {mode === 'full' && <RebalanceTotals moves={result.moves} />}
    </>
  );
}

function RebalanceTotals({ moves }: { moves: RebalanceMove[] }) {
  // Sum L1 only — children decompose their parent and would double-count.
  let sells = 0;
  let buys = 0;
  for (const m of moves) {
    if (m.direction === 'sell') sells += -m.delta_usd;
    else if (m.direction === 'buy') buys += m.delta_usd;
  }
  const net = buys - sells;
  if (sells === 0 && buys === 0) {
    return (
      <p style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: '#555' }}>
        Every class is within ±1% of target — no trades suggested.
      </p>
    );
  }
  return (
    <div
      style={{
        marginTop: '0.6rem',
        padding: '0.5rem 0.75rem',
        background: '#f3f4f6',
        borderRadius: 4,
        fontSize: '0.85rem',
        color: '#374151',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1.25rem',
      }}
    >
      <span>
        Total sells: <strong>{formatUSD(sells)}</strong>
      </span>
      <span>
        Total buys: <strong>{formatUSD(buys)}</strong>
      </span>
      <span>
        Net: <strong>{formatUSD(Math.abs(net))}</strong>
      </span>
    </div>
  );
}

function MoveRow({
  move,
  depth,
  mode,
  expandable,
  expanded,
  onToggle,
}: {
  move: RebalanceMove;
  depth: number;
  mode: 'full' | 'new_money';
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = humanize(depth === 0 ? move.path : move.path.split('.').slice(1).join('.'));
  const dollar = Math.round(move.delta_usd);
  const direction = move.direction;
  const currentUsd = (move.actual_pct / 100) * move.parent_total_usd;
  const newPositionUsd = currentUsd + move.delta_usd;
  const showDashMove = direction === 'hold' || (mode === 'new_money' && dollar === 0);
  const actionLabel = direction === 'buy' ? 'Buy' : direction === 'sell' ? 'Sell' : '—';

  const chevron = expandable ? (expanded ? '▾' : '▸') : '';
  const handleRowClick = expandable ? onToggle : undefined;

  return (
    <tr
      onClick={handleRowClick}
      style={{
        borderBottom: '1px solid #eee',
        background: depth > 0 ? '#f5f5f5' : undefined,
        cursor: expandable ? 'pointer' : 'default',
      }}
    >
      <td style={{ ...td, color: ACTION_COLOR[direction], fontWeight: 600 }}>
        {actionLabel}
      </td>
      <td style={{ ...td, paddingLeft: depth > 0 ? '1.75rem' : td.padding }}>
        {label}
        {chevron && (
          <span style={{ marginLeft: '0.4rem', color: '#888', fontSize: '0.8rem' }}>
            {chevron}
          </span>
        )}
      </td>
      <td style={td}>
        {showDashMove ? (
          <span style={{ color: '#aaa' }}>—</span>
        ) : (
          <Provenance source={moveProvenance(move, mode, depth)}>
            <span style={{ color: ACTION_COLOR[direction], fontWeight: 500 }}>
              {formatSignedCompact(move.delta_usd)}
            </span>
          </Provenance>
        )}
      </td>
      <td style={td}>
        <Provenance source={positionProvenance(currentUsd, move.delta_usd, newPositionUsd)}>
          {formatUSDCompact(Math.max(0, newPositionUsd))}
        </Provenance>
      </td>
    </tr>
  );
}

function formatSignedCompact(delta: number): string {
  const abs = Math.abs(delta);
  const body = formatUSDCompact(abs);
  if (Math.round(delta) === 0) return body;
  return delta > 0 ? `+${body}` : `-${body}`;
}

function moveProvenance(move: RebalanceMove, mode: 'full' | 'new_money', depth: number): string {
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
      `Target/actual at this level are % of ${humanize(parentClass)} ` +
      `(${move.target_pct.toFixed(1)}% vs ${move.actual_pct.toFixed(1)}%).`
    );
  }
  return (
    `new-money allocation toward target ${move.target_pct.toFixed(2)}% ` +
    `(actual ${move.actual_pct.toFixed(2)}%, parent ${formatUSD(move.parent_total_usd)})`
  );
}

function positionProvenance(currentUsd: number, deltaUsd: number, newUsd: number): string {
  const sign = deltaUsd >= 0 ? '+' : '−';
  return (
    `current ${formatUSD(currentUsd)} ${sign} move ${formatUSD(Math.abs(deltaUsd))} ` +
    `= ${formatUSD(newUsd)}`
  );
}
