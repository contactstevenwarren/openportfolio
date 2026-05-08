import type { AllocationSlice, AssetClass } from "@/app/lib/api";

/**
 * L1 order for legend / sort (matches backend TAXONOMY_L1_ORDER).
 * Cash is first; Private is the fallback in `toAssetClass` for unknown names.
 */
export const CANONICAL_ORDER = [
  "Cash",
  "Stocks",
  "Bonds",
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

/** True when the donut should zoom into L2: need 2+ funded sub_class siblings (e.g. only Primary Residence for a house → one bucket, no drill). */
export function isDrillableL1(slice: AllocationSlice): boolean {
  return meaningfulChildren(slice).length > 1;
}
