import type {
  AllocationResult,
  AllocationSlice,
  DriftBand,
  TargetRow,
  TargetsPayload,
} from './api';
import { DRILL_CONFIG, getDrillSlices, type Dim, type Drill } from './drill';

export const EMPTY_TARGETS: TargetsPayload = { root: [], groups: {} };

/** True when no targets have ever been saved (root empty and no group rows). */
export function isTargetsEmpty(p: TargetsPayload): boolean {
  if (p.root.length > 0) return false;
  for (const rows of Object.values(p.groups)) {
    if (rows?.length) return false;
  }
  return true;
}

/** Round percentages to integers that sum to 100 (last row absorbs rounding). */
export function roundRowsTo100(pcts: number[]): number[] {
  if (pcts.length === 0) return [];
  const rounded = pcts.map((x) => Math.round(x));
  const sumOthers = rounded.slice(0, -1).reduce((a, n) => a + n, 0);
  rounded[rounded.length - 1] = 100 - sumOthers;
  return rounded;
}

function primaryDrillDim(assetClass: string): Dim {
  const dims = DRILL_CONFIG[assetClass];
  return dims[0];
}

/** Full payload from current allocation (root + each drillable group with first dim). */
export function seedFromActuals(alloc: AllocationResult): TargetsPayload {
  const rootSlices = alloc.by_asset_class.filter((s) => s.value > 0);
  const rootRounded = roundRowsTo100(rootSlices.map((s) => s.pct));
  const rootRows: TargetRow[] = rootSlices.map((s, i) => ({ path: s.name, pct: rootRounded[i] }));

  const groups: Record<string, TargetRow[]> = {};
  for (const assetClass of Object.keys(DRILL_CONFIG)) {
    const slice = alloc.by_asset_class.find((s) => s.name === assetClass);
    if (!slice || slice.value <= 0) continue;
    const dim = primaryDrillDim(assetClass);
    const drillSlices = getDrillSlices(alloc.by_asset_class, { assetClass, dim });
    if (drillSlices.length === 0) continue;
    const grpRounded = roundRowsTo100(drillSlices.map((s) => s.pct));
    groups[assetClass] = drillSlices.map((s, i) => ({
      path: rowPath({ assetClass, dim }, s.name),
      pct: grpRounded[i],
    }));
  }
  return { root: rootRows, groups };
}

function reconcileSectionPaths(paths: string[], initialPcts: number[], actualPcts: number[]): TargetRow[] {
  if (paths.length === 0) return [];
  const mid = initialPcts.slice(0, -1);
  const last = 100 - mid.reduce((a, b) => a + b, 0);
  if (last < 0 || last > 100) {
    const fallback = roundRowsTo100(actualPcts);
    return paths.map((path, i) => ({ path, pct: fallback[i] }));
  }
  return paths.map((path, i) => (i === paths.length - 1 ? { path, pct: last } : { path, pct: initialPcts[i] }));
}

/** Drop orphan paths, seed missing slices, reconcile each section to sum 100. */
export function mergeTargetsWithActuals(alloc: AllocationResult, saved: TargetsPayload): TargetsPayload {
  const rootSlices = alloc.by_asset_class.filter((s) => s.value > 0);
  const savedRoot = new Map(saved.root.map((r) => [r.path, r.pct]));
  const rootPaths = rootSlices.map((s) => s.name);
  const rootInitial = rootPaths.map((p) =>
    savedRoot.has(p) ? savedRoot.get(p)! : Math.round(rootSlices.find((s) => s.name === p)!.pct),
  );
  const rootRows = reconcileSectionPaths(
    rootPaths,
    rootInitial,
    rootSlices.map((s) => s.pct),
  );

  const groups: Record<string, TargetRow[]> = {};
  for (const assetClass of Object.keys(DRILL_CONFIG)) {
    const slice = alloc.by_asset_class.find((s) => s.name === assetClass);
    if (!slice || slice.value <= 0) continue;
    const dim = primaryDrillDim(assetClass);
    const drillSlices = getDrillSlices(alloc.by_asset_class, { assetClass, dim });
    if (drillSlices.length === 0) continue;
    const savedGroup = new Map((saved.groups[assetClass] ?? []).map((r) => [r.path, r.pct]));
    const paths = drillSlices.map((s) => rowPath({ assetClass, dim }, s.name));
    const initialPcts = drillSlices.map((s) => {
      const path = rowPath({ assetClass, dim }, s.name);
      return savedGroup.has(path) ? savedGroup.get(path)! : Math.round(s.pct);
    });
    groups[assetClass] = reconcileSectionPaths(
      paths,
      initialPcts,
      drillSlices.map((s) => s.pct),
    );
  }
  return { root: rootRows, groups };
}

function lastTouchIndex(path: string, touchOrder: string[]): number {
  for (let i = touchOrder.length - 1; i >= 0; i--) {
    if (touchOrder[i] === path) return i;
  }
  return -1;
}

/** Pick residual path: least recently touched; ties → last row in `rows` order. */
export function residualPathForSection(
  rows: TargetRow[],
  touchOrder: string[],
  excludePath: string,
): string | null {
  const candidates = rows.filter((r) => r.path !== excludePath);
  if (candidates.length === 0) return null;
  let bestPath = candidates[0].path;
  let bestLast = lastTouchIndex(bestPath, touchOrder);
  let bestIdx = rows.findIndex((r) => r.path === bestPath);
  for (let i = 1; i < candidates.length; i++) {
    const p = candidates[i].path;
    const idx = rows.findIndex((r) => r.path === p);
    const last = lastTouchIndex(p, touchOrder);
    if (last < bestLast || (last === bestLast && idx > bestIdx)) {
      bestPath = p;
      bestLast = last;
      bestIdx = idx;
    }
  }
  return bestPath;
}

/** Row that will absorb the next edit (least recently touched; ties → last row). */
export function displayResidualPath(rows: TargetRow[], touchOrder: string[]): string | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0].path;
  let bestPath = rows[0].path;
  let bestLast = lastTouchIndex(rows[0].path, touchOrder);
  let bestIdx = 0;
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i].path;
    const last = lastTouchIndex(p, touchOrder);
    if (last < bestLast || (last === bestLast && i > bestIdx)) {
      bestPath = p;
      bestLast = last;
      bestIdx = i;
    }
  }
  return bestPath;
}

export type AutoBalanceResult = {
  rows: TargetRow[];
  residualPath: string | null;
  blocked: boolean;
};

/**
 * User set `editedPath` to `newPct` (0–100). Residual row absorbs so the section sums to 100.
 * `touchOrder` is oldest → newest path edits (only user edits append).
 */
export function applyAutoBalance(
  rows: TargetRow[],
  editedPath: string,
  newPct: number,
  touchOrder: string[],
): AutoBalanceResult {
  const v = Math.max(0, Math.min(100, Math.round(newPct)));
  if (rows.length === 0) return { rows: [], residualPath: null, blocked: false };
  if (rows.length === 1) {
    const only = rows[0];
    if (only.path !== editedPath) return { rows: [...rows], residualPath: only.path, blocked: true };
    if (v !== 100) return { rows: [...rows], residualPath: only.path, blocked: true };
    return { rows: [{ path: only.path, pct: 100 }], residualPath: only.path, blocked: false };
  }

  const residual = residualPathForSection(rows, touchOrder, editedPath);
  if (residual == null) return { rows: [...rows], residualPath: null, blocked: true };

  const byPath = new Map(rows.map((r) => [r.path, r.pct]));
  byPath.set(editedPath, v);
  let sumOthers = 0;
  for (const r of rows) {
    if (r.path !== residual) sumOthers += byPath.get(r.path) ?? 0;
  }
  const resPct = 100 - sumOthers;
  if (resPct < 0 || resPct > 100) {
    return { rows: rows.map((r) => ({ ...r })), residualPath: residual, blocked: true };
  }
  byPath.set(residual, resPct);
  const next = rows.map((r) => ({ path: r.path, pct: byPath.get(r.path) ?? r.pct }));
  return { rows: next, residualPath: residual, blocked: false };
}

export function driftThresholds(data: AllocationResult | undefined): {
  tolerance_pct: number;
  act_pct: number;
  urgent_pct: number;
} {
  const d = data?.drift_thresholds;
  return {
    tolerance_pct: d?.tolerance_pct ?? 3,
    act_pct: d?.act_pct ?? 5,
    urgent_pct: d?.urgent_pct ?? 10,
  };
}

export function bandFromAbs(
  abs: number,
  t: { tolerance_pct: number; act_pct: number; urgent_pct: number },
): DriftBand {
  if (abs <= t.tolerance_pct) return 'ok';
  if (abs <= t.act_pct) return 'watch';
  if (abs <= t.urgent_pct) return 'act';
  return 'urgent';
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
