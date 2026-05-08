"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { PieChart, Pie, Cell } from "recharts";
import { CheckCircle2, ChevronLeft } from "lucide-react";

import {
  api,
  type AllocationResult,
  type AllocationSlice,
  type TargetsPayload,
} from "@/app/lib/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Slider } from "@/app/components/ui/slider";
import { Provenance } from "@/app/lib/provenance";
import {
  ASSET_CLASS_COLOR,
  formatPct,
  type AssetClass,
} from "@/app/(app)/_dashboard/mocks";
import {
  fundedL1Slices,
  meaningfulChildren as meaningfulChildrenSlice,
  toAssetClass,
} from "@/app/lib/allocation-display";

// ── Shared types ──────────────────────────────────────────────────────────────

type L1Class = {
  key: string;
  label: string;
  cls: AssetClass;
};

const L1_CLASSES: L1Class[] = [
  { key: "Cash", label: "Cash", cls: "Cash" },
  { key: "Stocks", label: "Stocks", cls: "Stocks" },
  { key: "Bonds", label: "Bonds", cls: "Bonds" },
  { key: "Real Estate", label: "Real Estate", cls: "Real Estate" },
  { key: "Commodities", label: "Commodities", cls: "Commodities" },
  { key: "Crypto", label: "Crypto", cls: "Crypto" },
  { key: "Private", label: "Private", cls: "Private" },
];

const EMPTY_VALUES: Record<string, number> = Object.fromEntries(
  L1_CLASSES.map((c) => [c.key, 0]),
);

// ── Preset library ─────────────────────────────────────────────────────────

type Preset = { id: string; label: string; values: Record<string, number> };

const PRESETS: Preset[] = [
  {
    id: "conservative",
    label: "Conservative",
    values: { Cash: 20, Stocks: 30, Bonds: 50, "Real Estate": 0, Commodities: 0, Crypto: 0, Private: 0 },
  },
  {
    id: "60_40",
    label: "60/40",
    values: { Cash: 0, Stocks: 60, Bonds: 40, "Real Estate": 0, Commodities: 0, Crypto: 0, Private: 0 },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    values: { Cash: 0, Stocks: 90, Bonds: 10, "Real Estate": 0, Commodities: 0, Crypto: 0, Private: 0 },
  },
  {
    id: "all_weather",
    label: "All-weather",
    values: { Cash: 0, Stocks: 30, Bonds: 55, "Real Estate": 0, Commodities: 15, Crypto: 0, Private: 0 },
  },
  {
    id: "diversified",
    label: "Diversified",
    values: { Cash: 5, Stocks: 50, Bonds: 20, "Real Estate": 10, Commodities: 5, Crypto: 5, Private: 5 },
  },
];

// ── Shared math helpers ──────────────────────────────────────────────────────

function touchIndex(key: string, touchOrder: string[]): number {
  return touchOrder.lastIndexOf(key);
}

function pickResidual(keys: string[], touchOrder: string[], editedKey: string): string {
  const candidates = keys.filter((k) => k !== editedKey);
  let bestKey = candidates[candidates.length - 1];
  let bestTouch = touchIndex(bestKey, touchOrder);
  let bestPos = keys.indexOf(bestKey);
  for (let i = candidates.length - 2; i >= 0; i--) {
    const k = candidates[i];
    const t = touchIndex(k, touchOrder);
    const pos = keys.indexOf(k);
    if (t < bestTouch || (t === bestTouch && pos > bestPos)) {
      bestKey = k;
      bestTouch = t;
      bestPos = pos;
    }
  }
  return bestKey;
}

function displayResidual(keys: string[], touchOrder: string[]): string {
  let bestKey = keys[keys.length - 1];
  let bestTouch = touchIndex(bestKey, touchOrder);
  let bestPos = keys.length - 1;
  for (let i = keys.length - 2; i >= 0; i--) {
    const k = keys[i];
    const t = touchIndex(k, touchOrder);
    if (t < bestTouch || (t === bestTouch && i > bestPos)) {
      bestKey = k;
      bestTouch = t;
      bestPos = i;
    }
  }
  return bestKey;
}

function addTouch(order: string[], k: string): string[] {
  return [...order.filter((x) => x !== k), k];
}

/**
 * Rebuild L2 rows for an asset class so paths match current funded drill slices.
 * Preserves pcts where paths still exist; new slices get 0 then whole group is
 * renormalized to integer percents summing to 100.
 */
function repairL2GroupRowsForAllocation(
  gkey: string,
  sl: AllocationSlice,
  existingRows: { path: string; pct: number }[],
): { path: string; pct: number }[] {
  const meaningful = meaningfulChildrenSlice(sl).filter((c) => c.value > 0);
  if (meaningful.length === 0) return [];

  const requiredPaths = meaningful
    .map((c) => `${gkey}.${c.name}`)
    .sort((a, b) => a.localeCompare(b));
  const saved = new Map(existingRows.map((r) => [r.path, r.pct]));

  const rows = requiredPaths.map((path) => ({
    path,
    pct: saved.get(path) ?? 0,
  }));

  let sum = rows.reduce((a, r) => a + r.pct, 0);
  if (sum === 100) return rows;

  if (sum === 0) {
    const n = rows.length;
    const base = Math.floor(100 / n);
    const rem = 100 - base * n;
    return rows.map((r, i) => ({
      ...r,
      pct: base + (i < rem ? 1 : 0),
    }));
  }

  const scaled = rows.map((r) => ({
    path: r.path,
    pct: Math.floor((100 * r.pct) / sum),
  }));
  const s2 = scaled.reduce((a, r) => a + r.pct, 0);
  let gap = 100 - s2;
  const order = rows
    .map((r, i) => {
      const exact = (100 * r.pct) / sum;
      return { i, frac: exact - Math.floor(exact) };
    })
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < gap; k++) {
    scaled[order[k].i].pct += 1;
  }
  return scaled;
}

function applyResidualEdit(
  values: Record<string, number>,
  keys: string[],
  editedKey: string,
  newPct: number,
  touchOrder: string[],
): { values: Record<string, number>; blocked: boolean } {
  if (keys.length === 1) {
    const only = keys[0];
    return { values: { ...values, [only]: 100 }, blocked: false };
  }
  const n = Math.max(0, Math.min(100, Math.round(newPct)));
  if (n === values[editedKey]) return { values, blocked: false };
  const residualKey = pickResidual(keys, touchOrder, editedKey);
  const next = { ...values, [editedKey]: n };
  let sumOthers = 0;
  for (const k of keys) {
    if (k !== residualKey) sumOthers += next[k] ?? 0;
  }
  const resPct = 100 - sumOthers;
  if (resPct < 0 || resPct > 100) {
    return { values, blocked: true };
  }
  next[residualKey] = resPct;
  return { values: next, blocked: false };
}

function activePresetId(values: Record<string, number>, fundedKeys: string[]): string | null {
  if (fundedKeys.length === 0) return null;
  for (const p of PRESETS) {
    const projected = projectToFundedKeys(p.values, fundedKeys);
    if (L1_CLASSES.every((c) => (values[c.key] ?? 0) === (projected[c.key] ?? 0))) {
      return p.id;
    }
  }
  return null;
}

function seedFromActuals(alloc: AllocationResult): Record<string, number> {
  const funded = new Map(
    alloc.by_asset_class.filter((s) => s.value > 0).map((s) => [s.name, s.pct]),
  );
  const raw: Record<string, number> = { ...EMPTY_VALUES };
  for (const c of L1_CLASSES) {
    raw[c.key] = funded.has(c.key) ? Math.round(funded.get(c.key)!) : 0;
  }
  const total = L1_CLASSES.reduce((a, c) => a + raw[c.key], 0);
  if (total !== 100 && total > 0) {
    const diff = 100 - total;
    const largest = L1_CLASSES.filter((c) => raw[c.key] > 0)
      .sort((a, b) => raw[b.key] - raw[a.key])[0];
    if (largest) raw[largest.key] = Math.max(0, raw[largest.key] + diff);
  }
  return raw;
}

function seedFromTargets(
  saved: TargetsPayload,
  alloc: AllocationResult,
): Record<string, number> {
  const savedMap = new Map(saved.root.map((r) => [r.path, r.pct]));
  if (savedMap.size === 0) return seedFromActuals(alloc);
  const raw: Record<string, number> = { ...EMPTY_VALUES };
  for (const c of L1_CLASSES) {
    raw[c.key] = savedMap.get(c.key) ?? 0;
  }
  const total = L1_CLASSES.reduce((a, c) => a + raw[c.key], 0);
  if (total !== 100 && total > 0) {
    const diff = 100 - total;
    const nonZero = L1_CLASSES.filter((c) => raw[c.key] > 0).sort((a, b) => raw[b.key] - raw[a.key]);
    if (nonZero[0]) raw[nonZero[0].key] = Math.max(0, raw[nonZero[0].key] + diff);
  }
  return raw;
}

/** Portfolio targets split across funded L1 keys only; other paths 0; renorm funded to 100%. */
function projectToFundedKeys(
  full: Record<string, number>,
  fundedKeys: string[],
): Record<string, number> {
  const out: Record<string, number> = { ...EMPTY_VALUES };
  if (fundedKeys.length === 0) return out;
  let sum = 0;
  for (const k of fundedKeys) {
    sum += full[k] ?? 0;
  }
  if (sum <= 0) {
    const n = fundedKeys.length;
    const eq = Math.floor(100 / n);
    fundedKeys.forEach((k, i) => {
      out[k] = i === n - 1 ? 100 - eq * (n - 1) : eq;
    });
    return out;
  }
  for (const k of fundedKeys) {
    out[k] = Math.round((100 * (full[k] ?? 0)) / sum);
  }
  let total = fundedKeys.reduce((a, k) => a + out[k], 0);
  if (total !== 100) {
    const diff = 100 - total;
    const largest = [...fundedKeys].sort((a, b) => out[b] - out[a])[0];
    out[largest] = Math.max(0, out[largest] + diff);
  }
  return out;
}

function formatPp(pp: number): string {
  if (pp === 0) return "—";
  const sign = pp > 0 ? "+" : "−";
  return `${sign}${Math.abs(pp).toFixed(0)}pp`;
}

function driftColor(pp: number): string {
  const abs = Math.abs(pp);
  if (abs === 0) return "text-muted-foreground";
  if (abs <= 3) return "text-muted-foreground";
  if (abs <= 10) return "text-warning";
  return "text-destructive";
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

// L2 color: parent brand color mixed with white at stepped lightness.
function l2Fill(parentCssColor: string, index: number, total: number): string {
  const mix = total <= 1 ? 0 : Math.min(60, (index * 55) / (total - 1));
  return `color-mix(in oklab, ${parentCssColor}, white ${mix}%)`;
}

// ── Shared editor row ─────────────────────────────────────────────────────────

function EditorRow({
  keyName,
  label,
  fill,
  target,
  now,
  isAbsorber,
  animating,
  onEdit,
  editLocked,
  lockHint,
}: {
  keyName: string;
  label: string;
  fill: string;
  target: number;
  now: number;
  isAbsorber: boolean;
  animating: boolean;
  onEdit: (key: string, v: number) => void;
  /** Single bucket under parent — share must stay 100% of the asset class. */
  editLocked?: boolean;
  /** When locked, overrides default single-bucket tooltip (L2 vs L1 wording). */
  lockHint?: string;
}) {
  const drift = target - now;
  const locked = Boolean(editLocked);
  return (
    <div
      className={
        "grid grid-cols-[1fr_minmax(120px,1.5fr)_4.5rem_3rem_3.5rem] items-center gap-x-3 rounded-md px-1 py-2 " +
        (!locked && isAbsorber ? "bg-muted/40" : "hover:bg-muted/40")
      }
      title={
        locked
          ? (lockHint ??
            "Only one sub-category — it uses 100% of this asset class")
          : isAbsorber
            ? "Absorbs change from your next edit"
            : undefined
      }
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: fill }}
          aria-hidden
        />
        <span className="truncate text-body-sm text-foreground">{label}</span>
        {!locked && isAbsorber && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground" aria-label="Absorbs next edit">
            absorbs
          </span>
        )}
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[target]}
        onValueChange={([v]) => onEdit(keyName, v)}
        disabled={animating || locked}
        aria-label={`${label} target percentage`}
      />
      <div className="relative flex items-center">
        <Input
          type="number"
          min={0}
          max={100}
          value={target}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onEdit(keyName, v);
          }}
          onBlur={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onEdit(keyName, Math.max(0, Math.min(100, v)));
          }}
          disabled={animating || locked}
          className="h-8 w-full pl-2 pr-6 text-right text-mono-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={`${label} target %`}
        />
        <span className="pointer-events-none absolute right-2 text-mono-sm text-muted-foreground">%</span>
      </div>
      <span className="text-right text-mono-sm tabular-nums text-muted-foreground">
        <Provenance source="computed">{now > 0 ? `${now}%` : "—"}</Provenance>
      </span>
      <span className={`text-right text-mono-sm tabular-nums ${driftColor(drift)}`}>
        <Provenance source="computed">{formatPp(drift)}</Provenance>
      </span>
    </div>
  );
}

// ── Route ─────────────────────────────────────────────────────────────────────

const VALID_ASSET_CLASSES = /^(Stocks|Bonds|Real Estate|Commodities|Crypto|Cash|Private)$/;

function TargetsRouter() {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");
  if (focus && VALID_ASSET_CLASSES.test(focus)) {
    return <L2Editor focusClass={focus} />;
  }
  return <L1Editor />;
}

export default function TargetsPage() {
  return (
    <React.Suspense fallback={<L1Editor />}>
      <TargetsRouter />
    </React.Suspense>
  );
}

// ── L1 Editor ────────────────────────────────────────────────────────────────

function L1Editor() {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const { data: alloc, isLoading: allocLoading } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
    { revalidateOnFocus: false },
  );
  const { data: remoteTargets, isLoading: targetsLoading } = useSWR<TargetsPayload>(
    "/api/targets",
    api.getTargets,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [values, setValues] = React.useState<Record<string, number> | null>(null);
  const [touchOrder, setTouchOrder] = React.useState<string[]>([]);
  const [animating, setAnimating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const fundedSlices = React.useMemo(
    () => (alloc ? fundedL1Slices(alloc) : []),
    [alloc],
  );
  const keys = React.useMemo(() => fundedSlices.map((s) => s.name), [fundedSlices]);

  React.useEffect(() => {
    if (!alloc || remoteTargets === undefined) return;
    if (values !== null) return;
    const fundedKeys = fundedL1Slices(alloc).map((s) => s.name);
    const base =
      remoteTargets.root.length > 0 ? seedFromTargets(remoteTargets, alloc) : seedFromActuals(alloc);
    setValues(projectToFundedKeys(base, fundedKeys));
  }, [alloc, remoteTargets, values]);

  const loading = allocLoading || targetsLoading || values === null;
  const noPositions = !allocLoading && alloc && alloc.total === 0;
  const noFundedL1 =
    !allocLoading && Boolean(alloc && alloc.total > 0 && fundedSlices.length === 0);

  const actualsMap = React.useMemo<Record<string, number>>(() => {
    if (!alloc) return {};
    return Object.fromEntries(alloc.by_asset_class.map((s) => [s.name, Math.round(s.pct)]));
  }, [alloc]);

  const activePreset = values ? activePresetId(values, keys) : null;
  const absorberKey = React.useMemo(
    () => (values ? displayResidual(keys, touchOrder) : null),
    [values, touchOrder, keys],
  );

  const handleEdit = React.useCallback((key: string, raw: number) => {
    setValues((prev) => {
      if (!prev) return prev;
      const result = applyResidualEdit(prev, keys, key, raw, touchOrder);
      if (result.blocked) return prev;
      if (keys.length === 1) {
        return { ...EMPTY_VALUES, [keys[0]]: 100 };
      }
      return result.values;
    });
    setTouchOrder((prev) => addTouch(prev, key));
  }, [touchOrder, keys]);

  const handlePreset = React.useCallback(
    (preset: Preset) => {
      if (animating || !values) return;
      const end = projectToFundedKeys(preset.values, keys);
      setAnimating(true);
      const start = { ...values };
      const duration = 500;
      const startTime = performance.now();
      function tick(now: number) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const frame: Record<string, number> = { ...EMPTY_VALUES };
        for (const c of L1_CLASSES) {
          frame[c.key] = lerp(start[c.key] ?? 0, end[c.key] ?? 0, eased);
        }
        setValues(projectToFundedKeys(frame, keys));
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          setValues(end);
          setTouchOrder([]);
          setAnimating(false);
        }
      }
      requestAnimationFrame(tick);
    },
    [animating, values, keys],
  );

  const handleReset = React.useCallback(() => {
    if (!alloc) return;
    const fundedKeys = fundedL1Slices(alloc).map((s) => s.name);
    setValues(projectToFundedKeys(seedFromActuals(alloc), fundedKeys));
    setTouchOrder([]);
  }, [alloc]);

  const handleSave = async () => {
    if (!values || !remoteTargets) return;
    setSaving(true);
    setSaveError(null);
    try {
      const freshAlloc = await api.allocation();
      const repairedGroups: Record<string, { path: string; pct: number }[]> = {};
      for (const gkey of Object.keys(remoteTargets.groups)) {
        const rows = remoteTargets.groups[gkey];
        if (!rows?.length) continue;
        const sl = freshAlloc.by_asset_class.find((s) => s.name === gkey);
        if (!sl || sl.value <= 0) continue;
        const fixed = repairL2GroupRowsForAllocation(gkey, sl, rows);
        if (fixed.length > 0) repairedGroups[gkey] = fixed;
      }
      const fundedSet = new Set(keys);
      const root = L1_CLASSES.map((c) => ({
        path: c.key,
        pct: fundedSet.has(c.key) ? (values[c.key] ?? 0) : 0,
      }));
      await api.putTargets({ root, groups: repairedGroups });
      await mutate("/api/allocation");
      await mutate("/api/targets");
      router.push("/");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const donutData = React.useMemo(() => {
    if (!values) return [];
    return L1_CLASSES.filter((c) => (values[c.key] ?? 0) > 0).map((c) => ({
      name: c.key,
      value: values[c.key],
      fill: ASSET_CLASS_COLOR[c.cls],
    }));
  }, [values]);

  if (noPositions) {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-h3">No positions yet</p>
        <p className="text-body-sm text-muted-foreground">Add positions to your accounts before setting targets.</p>
        <Button variant="outline" onClick={() => router.push("/accounts")}>Go to Accounts</Button>
      </div>
    );
  }

  if (noFundedL1) {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-h3">Nothing to target yet</p>
        <p className="text-body-sm text-muted-foreground">
          Your positions aren&apos;t allocated into asset classes yet. Classify holdings or add positions, then try again.
        </p>
        <Button variant="outline" onClick={() => router.push("/")}>Back to dashboard</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-h2">Target allocation</h1>
            {!loading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3" aria-hidden />
                Allocates 100%
              </span>
            )}
          </div>
          <p className="text-body-sm text-muted-foreground">
            Only asset classes you currently hold appear here (same as the allocation donut). Edits adjust one other row (marked
            <span className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">absorbs</span>)
            to keep the total at 100%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/")} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || saving || animating}>
            {saving ? "Saving…" : "Save targets"}
          </Button>
        </div>
      </div>

      {saveError && <p className="text-body-sm text-destructive">{saveError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm text-muted-foreground">Start from:</span>
        <button
          type="button"
          onClick={handleReset}
          className={
            "rounded-full border px-3 py-1 text-body-sm font-medium transition-colors " +
            (activePreset === null
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-muted")
          }
          disabled={animating}
          title="Your current portfolio allocation"
        >
          Custom
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => handlePreset(preset)}
            disabled={animating}
            title={(() => {
              const proj = projectToFundedKeys(preset.values, keys);
              return L1_CLASSES.filter((c) => (proj[c.key] ?? 0) > 0)
                .map((c) => `${c.label} ${proj[c.key]}%`)
                .join(" · ");
            })()}
            className={
              "rounded-full border px-3 py-1 text-body-sm font-medium transition-colors " +
              (activePreset === preset.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-foreground hover:bg-muted")
            }
          >
            {preset.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-body-sm text-muted-foreground">Loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col items-center gap-4 lg:sticky lg:top-6 lg:self-start">
            <p className="text-label uppercase tracking-wide text-muted-foreground">Target mix</p>
            <div className="relative">
              <PieChart width={220} height={220}>
                <Pie
                  data={donutData.length > 0 ? donutData : [{ name: "empty", value: 1, fill: "var(--muted)" }]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={100}
                  strokeWidth={2}
                  stroke="var(--background)"
                  isAnimationActive={false}
                >
                  {donutData.length > 0
                    ? donutData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)
                    : <Cell fill="var(--muted)" />}
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target</span>
                <span className="font-mono text-lg font-medium text-accent">100%</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 w-full px-2">
              {L1_CLASSES.filter((c) => values && (values[c.key] ?? 0) > 0).map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 text-body-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: ASSET_CLASS_COLOR[c.cls] }} aria-hidden />
                    <span className="text-muted-foreground">{c.label}</span>
                  </div>
                  <span className="font-mono tabular-nums text-foreground">{values?.[c.key] ?? 0}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[1fr_minmax(120px,1.5fr)_4.5rem_3rem_3.5rem] items-center gap-x-3 px-1 pb-2">
              <span className="text-label text-muted-foreground">Class</span>
              <span className="text-label text-muted-foreground">Target</span>
              <span className="text-right text-label text-muted-foreground">%</span>
              <span className="text-right text-label text-muted-foreground">Now</span>
              <span className="text-right text-label text-muted-foreground">Drift</span>
            </div>
            {fundedSlices.map((slice) => {
              const c =
                L1_CLASSES.find((x) => x.key === slice.name) ?? {
                  key: slice.name,
                  label: slice.name,
                  cls: toAssetClass(slice.name),
                };
              return (
                <EditorRow
                  key={c.key}
                  keyName={c.key}
                  label={c.label}
                  fill={ASSET_CLASS_COLOR[c.cls]}
                  target={values?.[c.key] ?? 0}
                  now={actualsMap[c.key] ?? 0}
                  isAbsorber={c.key === absorberKey}
                  animating={animating}
                  onEdit={handleEdit}
                  editLocked={keys.length === 1}
                  lockHint={
                    keys.length === 1
                      ? "Only one asset class with holdings — target stays 100%"
                      : undefined
                  }
                />
              );
            })}
            <div className="pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={animating}
                className="text-muted-foreground hover:text-foreground"
              >
                Reset to current allocation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── L2 Editor ────────────────────────────────────────────────────────────────

function L2Editor({ focusClass }: { focusClass: string }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const { data: alloc, isLoading: allocLoading } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
    { revalidateOnFocus: false },
  );
  const { data: remoteTargets, isLoading: targetsLoading } = useSWR<TargetsPayload>(
    "/api/targets",
    api.getTargets,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [values, setValues] = React.useState<Record<string, number> | null>(null);
  const [touchOrder, setTouchOrder] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // The parent asset class slice from the allocation.
  const parentSlice: AllocationSlice | null = React.useMemo(() => {
    if (!alloc) return null;
    return alloc.by_asset_class.find((s) => s.name === focusClass) ?? null;
  }, [alloc, focusClass]);

  // The meaningful children — what the donut drill showed.
  const l2Slices: AllocationSlice[] = React.useMemo(() => {
    if (!parentSlice) return [];
    return meaningfulChildrenSlice(parentSlice).filter((s) => s.value > 0);
  }, [parentSlice]);

  const keys: string[] = l2Slices.map((s) => s.name);
  const parentCls = toAssetClass(focusClass);
  const parentColor = ASSET_CLASS_COLOR[parentCls];

  // Actuals: % of parent for each meaningful child.
  const actualsMap = React.useMemo<Record<string, number>>(() => {
    if (!parentSlice || parentSlice.value <= 0) return {};
    return Object.fromEntries(
      l2Slices.map((s) => [s.name, Math.round((100 * s.value) / parentSlice.value)])
    );
  }, [parentSlice, l2Slices]);

  // Seed values from saved group targets or actuals.
  React.useEffect(() => {
    if (!alloc || remoteTargets === undefined || l2Slices.length === 0) return;
    if (values !== null) return;
    const savedGroup = remoteTargets.groups[focusClass];
    if (savedGroup && savedGroup.length > 0) {
      const savedMap = new Map(savedGroup.map((r) => [r.path.split(".")[1], r.pct]));
      const raw: Record<string, number> = {};
      for (const key of keys) {
        raw[key] = savedMap.get(key) ?? 0;
      }
      setValues(raw);
    } else {
      // Seed from actuals (% of parent).
      const raw: Record<string, number> = { ...actualsMap };
      const total = keys.reduce((a, k) => a + (raw[k] ?? 0), 0);
      if (total !== 100 && total > 0) {
        const diff = 100 - total;
        const largest = [...keys].sort((a, b) => (raw[b] ?? 0) - (raw[a] ?? 0))[0];
        if (largest) raw[largest] = Math.max(0, (raw[largest] ?? 0) + diff);
      }
      setValues(raw);
    }
  }, [alloc, remoteTargets, l2Slices, values, focusClass, keys, actualsMap]);

  const loading =
    allocLoading ||
    targetsLoading ||
    (l2Slices.length > 0 && values === null);

  const absorberKey = React.useMemo(
    () => (values ? displayResidual(keys, touchOrder) : null),
    [values, touchOrder, keys],
  );

  const handleEdit = React.useCallback((key: string, raw: number) => {
    setValues((prev) => {
      if (!prev) return prev;
      const result = applyResidualEdit(prev, keys, key, raw, touchOrder);
      if (result.blocked) return prev;
      return result.values;
    });
    setTouchOrder((prev) => addTouch(prev, key));
  }, [touchOrder, keys]);

  const handleReset = React.useCallback(() => {
    const raw: Record<string, number> = { ...actualsMap };
    const total = keys.reduce((a, k) => a + (raw[k] ?? 0), 0);
    if (total !== 100 && total > 0) {
      const diff = 100 - total;
      const largest = [...keys].sort((a, b) => (raw[b] ?? 0) - (raw[a] ?? 0))[0];
      if (largest) raw[largest] = Math.max(0, (raw[largest] ?? 0) + diff);
    }
    setValues(raw);
    setTouchOrder([]);
  }, [actualsMap, keys]);

  const handleSave = async () => {
    if (!values || !remoteTargets) return;
    setSaving(true);
    setSaveError(null);
    try {
      const freshAlloc = await api.allocation();
      const ps = freshAlloc.by_asset_class.find((s) => s.name === focusClass);
      if (!ps || ps.value <= 0) {
        setSaveError("This asset class has no funded holdings.");
        return;
      }
      const freshSlices = meaningfulChildrenSlice(ps).filter((s) => s.value > 0);
      const freshKeys = freshSlices.map((s) => s.name);
      const merged: Record<string, number> = { ...values };
      for (const k of freshKeys) {
        if (merged[k] === undefined) merged[k] = 0;
      }
      const groupRows = freshKeys.map((k) => ({
        path: `${focusClass}.${k}`,
        pct: merged[k] ?? 0,
      }));
      await api.putTargets({
        root: remoteTargets.root,
        groups: { ...remoteTargets.groups, [focusClass]: groupRows },
      });
      await mutate("/api/allocation");
      await mutate("/api/targets");
      router.push("/");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Donut preview with parent-color lightness ramp.
  const donutData = React.useMemo(() => {
    if (!values) return [];
    return keys
      .filter((k) => (values[k] ?? 0) > 0)
      .map((k, i, arr) => ({
        name: k,
        value: values[k],
        fill: l2Fill(parentColor, i, arr.length),
      }));
  }, [values, keys, parentColor]);

  // No L2 rows from allocation (no funded sub-categories to edit).
  if (!loading && l2Slices.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-h3">No breakdown yet</p>
        <p className="text-body-sm text-muted-foreground">
          There’s no sub-category allocation for {focusClass} yet. Add positions or classifications, then try again.
        </p>
        <Button variant="outline" onClick={() => router.push("/targets")}>Back to targets</Button>
      </div>
    );
  }

  const title = `${focusClass} breakdown`;
  const singleBucket = keys.length === 1;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push("/targets")}
            className="mb-1 flex items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            All targets
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-h2">{title}</h1>
            {!loading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3" aria-hidden />
                Sums to 100%
              </span>
            )}
          </div>
          <p className="text-body-sm text-muted-foreground">
            {singleBucket ? (
              <>
                One taxonomy bucket under {focusClass.toLowerCase()} — it uses 100% of this asset class. Targets below stay fixed at 100%; compare &quot;Now&quot; to see drift vs actual mix.
              </>
            ) : (
              <>
                Set how to split your {focusClass.toLowerCase()} allocation.
                Percentages are % of {focusClass.toLowerCase()}.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/")} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "Saving…" : "Save breakdown"}
          </Button>
        </div>
      </div>

      {saveError && <p className="text-body-sm text-destructive">{saveError}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-body-sm text-muted-foreground">Loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Donut preview */}
          <div className="flex flex-col items-center gap-4 lg:sticky lg:top-6 lg:self-start">
            <p className="text-label uppercase tracking-wide text-muted-foreground">Target mix</p>
            <div className="relative">
              <PieChart width={220} height={220}>
                <Pie
                  data={donutData.length > 0 ? donutData : [{ name: "empty", value: 1, fill: "var(--muted)" }]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={100}
                  strokeWidth={2}
                  stroke="var(--background)"
                  isAnimationActive={false}
                >
                  {donutData.length > 0
                    ? donutData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)
                    : <Cell fill="var(--muted)" />}
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target</span>
                <span className="font-mono text-lg font-medium text-accent">100%</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 w-full px-2">
              {keys.filter((k) => values && (values[k] ?? 0) > 0).map((k, i) => (
                <div key={k} className="flex items-center justify-between gap-2 text-body-sm">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: l2Fill(parentColor, i, keys.length) }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{k}</span>
                  </div>
                  <span className="font-mono tabular-nums text-foreground">{values?.[k] ?? 0}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Editor table */}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[1fr_minmax(120px,1.5fr)_4.5rem_3rem_3.5rem] items-center gap-x-3 px-1 pb-2">
              <span className="text-label text-muted-foreground">Bucket</span>
              <span className="text-label text-muted-foreground">Target</span>
              <span className="text-right text-label text-muted-foreground">%</span>
              <span className="text-right text-label text-muted-foreground">Now</span>
              <span className="text-right text-label text-muted-foreground">Drift</span>
            </div>
            {keys.map((k, i) => (
              <EditorRow
                key={k}
                keyName={k}
                label={k}
                fill={l2Fill(parentColor, i, keys.length)}
                target={values?.[k] ?? 0}
                now={actualsMap[k] ?? 0}
                isAbsorber={k === absorberKey}
                animating={false}
                onEdit={handleEdit}
                editLocked={singleBucket}
              />
            ))}
            <div className="pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-muted-foreground hover:text-foreground"
              >
                Reset to current allocation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
