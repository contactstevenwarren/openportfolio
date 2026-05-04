"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { PieChart, Pie, Cell } from "recharts";
import { CheckCircle2 } from "lucide-react";

import { api, type AllocationResult, type TargetsPayload } from "@/app/lib/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Slider } from "@/app/components/ui/slider";
import { Provenance } from "@/app/lib/provenance";
import {
  ASSET_CLASS_COLOR,
  formatPct,
  type AssetClass,
} from "@/app/(app)/_dashboard/mocks";
import { NAME_TO_CLASS } from "@/app/(app)/_dashboard/sections/donut-card";

// ── L1 canonical class list ────────────────────────────────────────────────

type L1Class = {
  key: string;
  label: string;
  cls: AssetClass;
};

const L1_CLASSES: L1Class[] = [
  { key: "cash", label: "Cash", cls: "cash" },
  { key: "equity", label: "Equity", cls: "us-equity" },
  { key: "fixed_income", label: "Fixed income", cls: "fixed-income" },
  { key: "real_estate", label: "Real estate", cls: "real-estate" },
  { key: "commodity", label: "Commodity", cls: "alts" },
  { key: "crypto", label: "Crypto", cls: "crypto" },
  { key: "private", label: "Private", cls: "other" },
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
    values: { cash: 20, equity: 30, fixed_income: 50, real_estate: 0, commodity: 0, crypto: 0, private: 0 },
  },
  {
    id: "60_40",
    label: "60/40",
    values: { cash: 0, equity: 60, fixed_income: 40, real_estate: 0, commodity: 0, crypto: 0, private: 0 },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    values: { cash: 0, equity: 90, fixed_income: 10, real_estate: 0, commodity: 0, crypto: 0, private: 0 },
  },
  {
    id: "all_weather",
    label: "All-weather",
    values: { cash: 0, equity: 30, fixed_income: 55, real_estate: 0, commodity: 15, crypto: 0, private: 0 },
  },
  {
    id: "diversified",
    label: "Diversified",
    values: { cash: 5, equity: 50, fixed_income: 20, real_estate: 10, commodity: 5, crypto: 5, private: 5 },
  },
];

// ── Residual-row coupling ──────────────────────────────────────────────────
//
// Edit rule: when user changes row X to newPct, exactly one other row (the
// "absorber") takes the full delta; all 5 remaining rows stay put. Absorber
// is the least-recently-edited row (ties break to bottom of L1_CLASSES).
// If the absorber can't legally take the delta (would go <0 or >100), the
// edit is rejected — the slider snaps back to its previous value.

function touchIndex(key: string, touchOrder: string[]): number {
  const idx = touchOrder.lastIndexOf(key);
  return idx === -1 ? -1 : idx;
}

// Least-recently-edited row ≠ editedKey; ties → bottom of L1_CLASSES.
function pickResidual(touchOrder: string[], editedKey: string): string {
  const keys = L1_CLASSES.map((c) => c.key);
  const candidates = keys.filter((k) => k !== editedKey);
  let bestKey = candidates[candidates.length - 1];
  let bestTouch = touchIndex(bestKey, touchOrder);
  let bestPos = keys.indexOf(bestKey);
  for (let i = candidates.length - 2; i >= 0; i--) {
    const k = candidates[i];
    const t = touchIndex(k, touchOrder);
    const pos = keys.indexOf(k);
    // Prefer lower touch index (less-recently edited); ties → higher pos (bottom wins).
    if (t < bestTouch || (t === bestTouch && pos > bestPos)) {
      bestKey = k;
      bestTouch = t;
      bestPos = pos;
    }
  }
  return bestKey;
}

// Which row will absorb the NEXT edit if the user clicks any other row?
function displayResidual(touchOrder: string[]): string {
  const keys = L1_CLASSES.map((c) => c.key);
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

function applyResidualEdit(
  values: Record<string, number>,
  editedKey: string,
  newPct: number,
  touchOrder: string[],
): { values: Record<string, number>; blocked: boolean } {
  const n = Math.max(0, Math.min(100, Math.round(newPct)));
  if (n === values[editedKey]) return { values, blocked: false };
  const residualKey = pickResidual(touchOrder, editedKey);
  const next = { ...values, [editedKey]: n };
  let sumOthers = 0;
  for (const c of L1_CLASSES) {
    if (c.key !== residualKey) sumOthers += next[c.key] ?? 0;
  }
  const resPct = 100 - sumOthers;
  if (resPct < 0 || resPct > 100) {
    return { values, blocked: true };
  }
  next[residualKey] = resPct;
  return { values: next, blocked: false };
}

// ── Preset active detection ────────────────────────────────────────────────

function activePresetId(values: Record<string, number>): string | null {
  for (const p of PRESETS) {
    if (L1_CLASSES.every((c) => (values[c.key] ?? 0) === (p.values[c.key] ?? 0))) {
      return p.id;
    }
  }
  return null;
}

// ── Seed from allocation actuals ───────────────────────────────────────────

function seedFromActuals(alloc: AllocationResult): Record<string, number> {
  const funded = new Map(
    alloc.by_asset_class.filter((s) => s.value > 0).map((s) => [s.name, s.pct]),
  );
  const raw: Record<string, number> = { ...EMPTY_VALUES };
  for (const c of L1_CLASSES) {
    raw[c.key] = funded.has(c.key) ? Math.round(funded.get(c.key)!) : 0;
  }
  // Reconcile to 100: funded classes may not sum to exactly 100 after rounding.
  const total = L1_CLASSES.reduce((a, c) => a + raw[c.key], 0);
  if (total !== 100 && total > 0) {
    const diff = 100 - total;
    // Dump drift onto largest funded class.
    const largest = L1_CLASSES.filter((c) => raw[c.key] > 0)
      .sort((a, b) => raw[b.key] - raw[a.key])[0];
    if (largest) raw[largest.key] = Math.max(0, raw[largest.key] + diff);
  }
  return raw;
}

// ── Seed from saved targets ────────────────────────────────────────────────

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
  // Ensure exactly 100 (saved data should already be valid; just guard).
  const total = L1_CLASSES.reduce((a, c) => a + raw[c.key], 0);
  if (total !== 100 && total > 0) {
    const diff = 100 - total;
    const nonZero = L1_CLASSES.filter((c) => raw[c.key] > 0).sort((a, b) => raw[b.key] - raw[a.key]);
    if (nonZero[0]) raw[nonZero[0].key] = Math.max(0, raw[nonZero[0].key] + diff);
  }
  return raw;
}

// ── Drift helpers ──────────────────────────────────────────────────────────

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

// ── Animation helpers ──────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TargetsPage() {
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

  // Seed state once we have both alloc + targets data.
  React.useEffect(() => {
    if (!alloc || remoteTargets === undefined) return;
    if (values !== null) return; // already seeded
    const seeded =
      remoteTargets.root.length > 0
        ? seedFromTargets(remoteTargets, alloc)
        : seedFromActuals(alloc);
    setValues(seeded);
  }, [alloc, remoteTargets, values]);

  const loading = allocLoading || targetsLoading || values === null;
  const noPositions = !allocLoading && alloc && alloc.total === 0;

  // Actuals map from allocation for the "Now" column.
  const actualsMap = React.useMemo<Record<string, number>>(() => {
    if (!alloc) return {};
    return Object.fromEntries(
      alloc.by_asset_class.map((s) => [s.name, Math.round(s.pct)]),
    );
  }, [alloc]);

  const activePreset = values ? activePresetId(values) : null;
  // Which row will absorb the next edit? Used to render a subtle indicator.
  const absorberKey = React.useMemo(
    () => (values ? displayResidual(touchOrder) : null),
    [values, touchOrder],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleEdit = React.useCallback((key: string, raw: number) => {
    setValues((prev) => {
      if (!prev) return prev;
      const result = applyResidualEdit(prev, key, raw, touchOrder);
      if (result.blocked) return prev; // slider snaps back on next render
      return result.values;
    });
    setTouchOrder((prev) => addTouch(prev, key));
  }, [touchOrder]);

  const handlePreset = React.useCallback((preset: Preset) => {
    if (animating || !values) return;
    setAnimating(true);
    const start = { ...values };
    const end = preset.values;
    const duration = 500;
    const startTime = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out quad
      const frame: Record<string, number> = {};
      for (const c of L1_CLASSES) {
        frame[c.key] = lerp(start[c.key] ?? 0, end[c.key] ?? 0, eased);
      }
      // Ensure sum=100 every frame: dump drift onto largest target row.
      const sum = L1_CLASSES.reduce((a, c) => a + frame[c.key], 0);
      if (sum !== 100) {
        const largest = L1_CLASSES.sort((a, b) => frame[b.key] - frame[a.key])[0];
        frame[largest.key] = Math.max(0, frame[largest.key] + (100 - sum));
      }
      setValues({ ...frame });
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setValues({ ...end });
        setTouchOrder([]); // fresh slate: next manual edit absorbs into bottom row
        setAnimating(false);
      }
    }
    requestAnimationFrame(tick);
  }, [animating, values]);

  const handleReset = React.useCallback(() => {
    if (!alloc) return;
    setValues(seedFromActuals(alloc));
    setTouchOrder([]);
  }, [alloc]);

  const handleSave = async () => {
    if (!values || !remoteTargets) return;
    setSaving(true);
    setSaveError(null);
    try {
      const root = L1_CLASSES.map((c) => ({ path: c.key, pct: values[c.key] ?? 0 }));
      await api.putTargets({ root, groups: remoteTargets.groups });
      await mutate("/api/allocation");
      await mutate("/api/targets");
      router.push("/");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Donut preview data ────────────────────────────────────────────────────

  const donutData = React.useMemo(() => {
    if (!values) return [];
    return L1_CLASSES.filter((c) => (values[c.key] ?? 0) > 0).map((c) => ({
      name: c.key,
      cls: c.cls,
      value: values[c.key],
      fill: ASSET_CLASS_COLOR[c.cls],
    }));
  }, [values]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (noPositions) {
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-h3">No positions yet</p>
        <p className="text-body-sm text-muted-foreground">
          Add positions to your accounts before setting targets.
        </p>
        <Button variant="outline" onClick={() => router.push("/accounts")}>
          Go to Accounts
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 lg:px-6">
      {/* Page header */}
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
            Define the asset mix you&apos;re aiming at. Edits adjust one other row (marked
            <span className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">absorbs</span>)
            to keep the total at 100%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving || animating}>
            {saving ? "Saving…" : "Save targets"}
          </Button>
        </div>
      </div>

      {saveError && (
        <p className="text-body-sm text-destructive">{saveError}</p>
      )}

      {/* Preset chip row */}
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
            title={L1_CLASSES.filter((c) => (preset.values[c.key] ?? 0) > 0)
              .map((c) => `${c.label} ${preset.values[c.key]}%`)
              .join(" · ")}
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
          {/* Left: donut preview */}
          <div className="flex flex-col items-center gap-4 lg:sticky lg:top-6 lg:self-start">
            <p className="text-label uppercase tracking-wide text-muted-foreground">
              Target mix
            </p>
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
                    ? donutData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))
                    : <Cell fill="var(--muted)" />}
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Target
                </span>
                <span className="font-mono text-lg font-medium text-accent">100%</span>
              </div>
            </div>
            {/* Color legend */}
            <div className="flex flex-col gap-1 w-full px-2">
              {L1_CLASSES.filter((c) => values && (values[c.key] ?? 0) > 0).map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 text-body-sm">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: ASSET_CLASS_COLOR[c.cls] }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{c.label}</span>
                  </div>
                  <span className="font-mono tabular-nums text-foreground">
                    {values?.[c.key] ?? 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: editor table */}
          <div className="flex flex-col gap-1">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_minmax(120px,1.5fr)_4.5rem_3rem_3.5rem] items-center gap-x-3 px-1 pb-2">
              <span className="text-label text-muted-foreground">Class</span>
              <span className="text-label text-muted-foreground">Target</span>
              <span className="text-right text-label text-muted-foreground">%</span>
              <span className="text-right text-label text-muted-foreground">Now</span>
              <span className="text-right text-label text-muted-foreground">Drift</span>
            </div>

            {L1_CLASSES.map((c) => {
              const target = values?.[c.key] ?? 0;
              const now = actualsMap[c.key] ?? 0;
              const drift = target - now;
              const isAbsorber = c.key === absorberKey;
              return (
                <div
                  key={c.key}
                  className={
                    "grid grid-cols-[1fr_minmax(120px,1.5fr)_4.5rem_3rem_3.5rem] items-center gap-x-3 rounded-md px-1 py-2 " +
                    (isAbsorber ? "bg-muted/40" : "hover:bg-muted/40")
                  }
                  title={isAbsorber ? "Absorbs change from your next edit" : undefined}
                >
                  {/* Class label */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: ASSET_CLASS_COLOR[c.cls] }}
                      aria-hidden
                    />
                    <span className="truncate text-body-sm text-foreground">{c.label}</span>
                    {isAbsorber && (
                      <span
                        className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        aria-label="Absorbs next edit"
                      >
                        absorbs
                      </span>
                    )}
                  </div>

                  {/* Slider */}
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[target]}
                    onValueChange={([v]) => handleEdit(c.key, v)}
                    disabled={animating}
                    aria-label={`${c.label} target percentage`}
                  />

                  {/* Number input */}
                  <div className="relative flex items-center">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={target}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) handleEdit(c.key, v);
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) handleEdit(c.key, Math.max(0, Math.min(100, v)));
                      }}
                      disabled={animating}
                      className="h-8 w-full pl-2 pr-6 text-right text-mono-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label={`${c.label} target %`}
                    />
                    <span className="pointer-events-none absolute right-2 text-mono-sm text-muted-foreground">
                      %
                    </span>
                  </div>

                  {/* Current % */}
                  <span className="text-right text-mono-sm tabular-nums text-muted-foreground">
                    <Provenance source="computed">
                      {now > 0 ? `${now}%` : "—"}
                    </Provenance>
                  </span>

                  {/* Drift */}
                  <span className={`text-right text-mono-sm tabular-nums ${driftColor(drift)}`}>
                    <Provenance source="computed">
                      {formatPp(drift)}
                    </Provenance>
                  </span>
                </div>
              );
            })}

            {/* Reset button */}
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
