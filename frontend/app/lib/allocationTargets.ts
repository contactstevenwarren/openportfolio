import type {
  AllocationResult,
  AllocationSlice,
  DriftBand,
  TargetRow,
  TargetsPayload,
} from './api';
import type { Drill } from './drill';

export const EMPTY_TARGETS: TargetsPayload = { root: [], groups: {} };

export function driftThresholds(data: AllocationResult | undefined): {
  minor_pct: number;
  major_pct: number;
} {
  const d = data?.drift_thresholds;
  return {
    minor_pct: d?.minor_pct ?? 1,
    major_pct: d?.major_pct ?? 3,
  };
}

export function bandFromAbs(
  abs: number,
  t: { minor_pct: number; major_pct: number },
): DriftBand {
  if (abs <= t.minor_pct) return 'on_target';
  if (abs <= t.major_pct) return 'minor';
  return 'major';
}

// Backend contract: root rows use bare asset-class paths ("equity"); group
// rows use bare asset-class keys ("equity") with dotted leaf paths
// ("equity.US"). <leaf> is exactly slice.name.
export function rowPath(drill: Drill, sliceName: string): string {
  return drill ? `${drill.assetClass}.${sliceName}` : sliceName;
}

export function getGroupRows(payload: TargetsPayload, drill: Drill): TargetRow[] {
  if (!drill) return payload.root;
  return payload.groups[drill.assetClass] ?? [];
}

export function setGroupRows(
  payload: TargetsPayload,
  drill: Drill,
  rows: TargetRow[],
): TargetsPayload {
  if (!drill) return { ...payload, root: rows };
  return { ...payload, groups: { ...payload.groups, [drill.assetClass]: rows } };
}

export function sumTargetPct(rows: TargetRow[]): number {
  return rows.reduce((a, r) => a + r.pct, 0);
}

export function targetSumOk(rows: TargetRow[]): boolean {
  if (rows.length === 0) return true;
  return sumTargetPct(rows) === 100;
}

export function entirePayloadValid(p: TargetsPayload): boolean {
  if (!targetSumOk(p.root)) return false;
  for (const rows of Object.values(p.groups)) {
    if (rows?.length && !targetSumOk(rows)) return false;
  }
  return true;
}

export function effectiveTarget(
  rows: TargetRow[],
  drill: Drill,
  slice: AllocationSlice,
): number | null {
  const path = rowPath(drill, slice.name);
  const local = rows.find((r) => r.path === path);
  if (local) return local.pct;
  if (slice.target_pct != null) return slice.target_pct;
  return null;
}

export function effectiveDrift(
  rows: TargetRow[],
  drill: Drill,
  slice: AllocationSlice,
): number | null {
  if (slice.drift_pct != null) return slice.drift_pct;
  const t = effectiveTarget(rows, drill, slice);
  if (t == null) return null;
  return slice.pct - t;
}
