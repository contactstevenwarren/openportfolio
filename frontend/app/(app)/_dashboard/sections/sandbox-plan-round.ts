/**
 * Whole-dollar rounding for the deploy / rebalance sandbox plan.
 * Keeps row `action` values and headline `buyTotal` / `sellTotal` aligned with
 * whole-dollar UI (`formatUsd` with `wholeDollars`).
 *
 * Deploy-path `buyTotal` here must stay in sync with `computePlan` in
 * `sandbox-card.tsx` (deploy return): sum of `max(0, action)` for non-cash
 * assets plus `max(0, cash action)` — both after rounding actions.
 */

export type SandboxPlanAsset = {
  name: string;
  label: string;
  value: number;
  pct: number;
  targetPct: number;
  action: number;
};

export type SandboxPlan = {
  assets: SandboxPlanAsset[];
  cashExcess: number;
  buyTotal: number;
  sellTotal: number;
  gapsClosed: boolean;
};

export type SandboxPlanMode = "deploy" | "rebalance";

export function roundPlanToWholeDollars(
  plan: SandboxPlan,
  mode: SandboxPlanMode,
  cashName: string | null,
): SandboxPlan {
  const assets = plan.assets.map((a) => ({
    ...a,
    action: Math.round(a.action),
  }));
  if (mode === "rebalance") {
    const buyTotal = assets.reduce((s, a) => s + Math.max(0, a.action), 0);
    const sellTotal = assets.reduce((s, a) => s + Math.max(0, -a.action), 0);
    return { ...plan, assets, buyTotal, sellTotal };
  }
  const cashAsset = assets.find((a) => a.name === cashName);
  const buyTotal =
    assets
      .filter((a) => a.name !== cashName)
      .reduce((s, a) => s + Math.max(0, a.action), 0) +
    Math.max(0, cashAsset?.action ?? 0);
  return { ...plan, assets, buyTotal, sellTotal: 0 };
}
