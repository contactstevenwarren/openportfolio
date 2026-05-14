/**
 * Map persisted snapshot API rows + live allocation into timeline chart rows.
 * Stacks use canonical AssetClass keys (same as allocation / donut).
 */

import type { AllocationResult, AssetClass, SnapshotListItem } from "@/app/lib/api";
import {
  ASSET_CLASS_LABEL,
  ASSET_CLASS_ORDER,
} from "@/app/(app)/accounts/_accounts/mocks";
import { ASSET_CLASS_COLOR } from "./mocks";

export type RealSnapshotPoint = {
  /** Chart X-axis: snapshot save time. */
  date: string;
  /** When this snapshot row was written (provenance / "saved at"). */
  snapshotTakenAt: string;
  investable_total_usd: number;
} & Record<AssetClass, number>;

function chartInstantFromSnapshot(s: SnapshotListItem): { ms: number; iso: string } {
  const raw = s.taken_at.includes("T") ? s.taken_at : `${s.taken_at}T12:00:00Z`;
  let t = Date.parse(raw);
  if (Number.isNaN(t)) t = Date.now();
  return { ms: t, iso: new Date(t).toISOString() };
}

function parseTakenAtIso(s: SnapshotListItem): string {
  const raw = s.taken_at.includes("T") ? s.taken_at : `${s.taken_at}T12:00:00Z`;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

function emptyStacks(): Record<AssetClass, number> {
  return Object.fromEntries(ASSET_CLASS_ORDER.map((ac) => [ac, 0])) as Record<
    AssetClass,
    number
  >;
}

export function snapshotsToSeries(snaps: SnapshotListItem[]): RealSnapshotPoint[] {
  const sorted = [...snaps].sort((a, b) => {
    const ca = chartInstantFromSnapshot(a).ms;
    const cb = chartInstantFromSnapshot(b).ms;
    if (ca !== cb) return ca - cb;
    return parseTakenAtIso(a).localeCompare(parseTakenAtIso(b));
  });
  const rows: RealSnapshotPoint[] = sorted.map((s) => {
    const stacks = emptyStacks();
    for (const ac of ASSET_CLASS_ORDER) {
      const v = s.by_asset_class[ac];
      if (typeof v === "number") stacks[ac] = v;
    }
    const { iso: date } = chartInstantFromSnapshot(s);
    return {
      date,
      snapshotTakenAt: parseTakenAtIso(s),
      investable_total_usd: s.investable_total_usd,
      ...stacks,
    };
  });
  let lastMs = 0;
  return rows.map((row) => {
    let ms = Date.parse(row.date);
    if (!Number.isFinite(ms)) ms = Date.parse(row.snapshotTakenAt);
    if (!Number.isFinite(ms)) ms = Date.now();
    if (ms <= lastMs) ms = lastMs + 1;
    lastMs = ms;
    const nextIso = new Date(ms).toISOString();
    return nextIso === row.date ? row : { ...row, date: nextIso };
  });
}

/** Single-point series from live allocation when no snapshots exist yet. */
export function allocationToAnchorSeries(allocation: AllocationResult): RealSnapshotPoint[] {
  const stacks = emptyStacks();
  for (const slice of allocation.by_asset_class) {
    const name = slice.name as AssetClass;
    if (ASSET_CLASS_ORDER.includes(name)) stacks[name] = slice.value;
  }
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  return [
    {
      date: `${day}T12:00:00.000Z`,
      snapshotTakenAt: d.toISOString(),
      investable_total_usd: allocation.total,
      ...stacks,
    },
  ];
}

export function realSnapshotTotal(p: RealSnapshotPoint): number {
  return p.investable_total_usd;
}

export function isRealSnapshotPoint(p: unknown): p is RealSnapshotPoint {
  return (
    typeof p === "object" &&
    p !== null &&
    "investable_total_usd" in p &&
    typeof (p as RealSnapshotPoint).investable_total_usd === "number" &&
    "snapshotTakenAt" in p &&
    typeof (p as RealSnapshotPoint).snapshotTakenAt === "string"
  );
}

export const REAL_STACK_ORDER: { key: AssetClass; label: string }[] = ASSET_CLASS_ORDER.map(
  (ac) => ({ key: ac, label: ASSET_CLASS_LABEL[ac] }),
);

/** Last in draw order (top of stack) — sparse vertex dots. */
export const SPARSE_DOT_STACK_KEY_REAL: AssetClass =
  REAL_STACK_ORDER[REAL_STACK_ORDER.length - 1]!.key;

/** Match `chart.tsx` ChartStyle so `var(--color-…)` lines up with `dataKey`. */
export function chartColorVarSegment(key: string): string {
  return key.replace(/\s+/g, "-");
}

export function stackColor(ac: AssetClass): string {
  return ASSET_CLASS_COLOR[ac];
}
