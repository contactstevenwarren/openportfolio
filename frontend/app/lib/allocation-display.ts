import type { AllocationResult, AllocationSlice, AssetClass } from "@/app/lib/api";

/**
 * L1 order for legend / sort (matches backend TAXONOMY_L1_ORDER).
 * Stocks is first (risk-descent order); Private is the fallback in `toAssetClass` for unknown names.
 */
export const CANONICAL_ORDER = [
  "Stocks",
  "Bonds",
  "Cash",
  "Real Estate",
  "Commodities",
  "Crypto",
  "Private",
] as const satisfies readonly AssetClass[];

const L1_NAMES = new Set<string>(CANONICAL_ORDER);

export function toAssetClass(name: string): AssetClass {
  return (L1_NAMES.has(name) ? name : "Private") as AssetClass;
}

/**
 * Mirror `backend/app/allocation.meaningful_children`: collapse single-child
 * chains, then return either the leaf slice or the list of sibling sub_class
 * wedges. Matches Python when a leaf has no children: returns `[cur]`, not `[]`.
 */
export function meaningfulChildren(slice: AllocationSlice): AllocationSlice[] {
  let cur: AllocationSlice = slice;
  while ((cur.children ?? []).length === 1) {
    cur = cur.children![0];
  }
  const kids = cur.children ?? [];
  if (kids.length === 0) {
    return [cur];
  }
  return kids;
}

/**
 * True when the donut should zoom into L2: there is at least one explicit sub-row
 * under this L1 — including a single bucket (e.g. only Primary Residence).
 * False when the API exposes no sub-rows so `meaningfulChildren` folds back to the
 * L1 slice itself (same name), i.e. nothing to drill into.
 */
export function isDrillableL1(slice: AllocationSlice): boolean {
  const mc = meaningfulChildren(slice);
  if (mc.length === 0) return false;
  if (mc.length > 1) return true;
  return mc[0].name !== slice.name;
}

/**
 * Top-level slices with dollars allocated — matches donut `toDisplaySlices` visibility
 * (`value > 0`) and canonical L1 sort (same as non-zoom donut ordering).
 */
export function fundedL1Slices(alloc: AllocationResult): AllocationSlice[] {
  const visible = alloc.by_asset_class.filter((s) => s.value > 0);
  return [...visible].sort((a, b) => {
    const ac = toAssetClass(a.name);
    const bc = toAssetClass(b.name);
    const ai = CANONICAL_ORDER.indexOf(ac);
    const bi = CANONICAL_ORDER.indexOf(bc);
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return b.value - a.value;
  });
}
