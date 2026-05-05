"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { api, type AllocationResult } from "@/app/lib/api";
import { humanize } from "@/app/lib/labels";
import { useSandbox } from "@/app/lib/sandbox-context";
import { formatPct, formatUsd } from "../mocks";

type Mode = "deploy" | "rebalance";

type AssetHolding = {
  name: string;
  label: string;
  value: number;
  pct: number;       // 0–100 scale from API
  targetPct: number; // 0–100 scale from API
};

type AssetPlan = AssetHolding & { action: number };

type Plan = {
  assets: AssetPlan[];
  cashExcess: number;
  buyTotal: number;
  sellTotal: number;
  gapsClosed: boolean;
};

function computePlan(
  holdings: AssetHolding[],
  currentTotal: number,
  mode: Mode,
  newCash: number,
  excessCashAmount: number,
): Plan {
  const newTotal = currentTotal + newCash;

  if (mode === "rebalance") {
    const assets = holdings.map((h) => ({
      ...h,
      action: (h.targetPct / 100) * newTotal - h.value,
    }));
    return {
      assets,
      cashExcess: 0,
      buyTotal: assets.reduce((s, a) => s + Math.max(0, a.action), 0),
      sellTotal: assets.reduce((s, a) => s + Math.max(0, -a.action), 0),
      gapsClosed: true,
    };
  }

  // Deploy cash mode — buy-only on non-cash assets
  const cashName =
    holdings.find((h) => h.name.toLowerCase() === "cash")?.name ?? null;
  const cashHolding = holdings.find((h) => h.name === cashName);
  const cashTarget = cashHolding ? (cashHolding.targetPct / 100) * newTotal : 0;
  const cashValue = cashHolding?.value ?? 0;
  const cashOverweight = cashValue > cashTarget;
  const cashExcess = Math.max(0, cashValue - cashTarget);
  // Use exactly what the user requested, clamped to available
  const cashDrawdown = cashOverweight ? Math.min(excessCashAmount, cashExcess) : 0;
  const totalAvailable = newCash + cashDrawdown;

  const getDeficit = (h: AssetHolding) =>
    h.name === cashName && cashOverweight
      ? 0
      : Math.max(0, (h.targetPct / 100) * newTotal - h.value);
  const totalDeficit = holdings.reduce((s, h) => s + getDeficit(h), 0);
  const sumTargets = holdings.reduce((s, h) => s + h.targetPct / 100, 0);

  const buys: Record<string, number> = Object.fromEntries(
    holdings.map((h) => [h.name, 0]),
  );
  if (totalAvailable > 0) {
    if (totalDeficit > 0) {
      const deploy = Math.min(totalAvailable, totalDeficit);
      for (const h of holdings)
        buys[h.name] = (deploy * getDeficit(h)) / totalDeficit;
      const leftover = totalAvailable - totalDeficit;
      if (leftover > 0 && sumTargets > 0)
        for (const h of holdings)
          buys[h.name] += (leftover * (h.targetPct / 100)) / sumTargets;
    } else if (sumTargets > 0) {
      for (const h of holdings)
        buys[h.name] = (totalAvailable * (h.targetPct / 100)) / sumTargets;
    }
  }

  const assets = holdings.map((h) => ({
    ...h,
    action: h.name === cashName ? buys[h.name] - cashDrawdown : buys[h.name],
  }));
  const cashAsset = assets.find((a) => a.name === cashName);
  const buyTotal =
    assets
      .filter((a) => a.name !== cashName)
      .reduce((s, a) => s + Math.max(0, a.action), 0) +
    Math.max(0, cashAsset?.action ?? 0);

  return { assets, cashExcess, buyTotal, sellTotal: 0, gapsClosed: totalAvailable >= totalDeficit };
}

function getHero(
  mode: Mode,
  plan: Plan,
  newCash: number,
  cashName: string | null,
  excessCashAmount: number,
): { headline: string; sub: string } {
  const { buyTotal, sellTotal, assets } = plan;
  const cashAction = assets.find((a) => a.name === cashName)?.action ?? 0;
  const usedCash = -cashAction;

  if (mode === "rebalance") {
    if (buyTotal < 1 && sellTotal < 1)
      return { headline: "No moves needed", sub: "Portfolio matches target allocation." };
    const headline =
      buyTotal >= 1 && sellTotal >= 1
        ? `Buy ${formatUsd(buyTotal)}, sell ${formatUsd(sellTotal)}`
        : buyTotal >= 1
          ? `Buy ${formatUsd(buyTotal)}`
          : `Sell ${formatUsd(sellTotal)}`;
    return { headline, sub: "Brings every asset class to target." };
  }

  if (buyTotal < 1 && Math.abs(cashAction) < 1) {
    return { headline: "Nothing to deploy", sub: "Add new cash or excess cash to begin." };
  }
  if (newCash > 0 && usedCash > 0.5)
    return {
      headline: `Deploy ${formatUsd(newCash + usedCash)}`,
      sub: `${formatUsd(newCash)} new + ${formatUsd(usedCash)} from cash.`,
    };
  if (newCash > 0)
    return {
      headline: `Deploy ${formatUsd(newCash)}`,
      sub: "Distributed across underweight assets.",
    };
  if (usedCash > 0.5)
    return {
      headline: `Rebalance ${formatUsd(usedCash)} from cash`,
      sub: plan.gapsClosed
        ? "No new money needed — your existing excess cash closes the gaps."
        : "Deploys available excess cash toward underweight assets.",
    };
  return { headline: `Buy ${formatUsd(buyTotal)}`, sub: "" };
}

function getWhyText(
  mode: Mode,
  plan: Plan,
  newCash: number,
  excessCashAmount: number,
): string {
  if (mode === "rebalance")
    return "Full rebalance moves every asset class to its exact target percentage at the current portfolio total. Sells are allowed alongside buys.";
  const { cashExcess } = plan;
  const usingCash = excessCashAmount > 0 && cashExcess > 0;
  if (newCash === 0 && !usingCash && cashExcess > 0)
    return "In buy-only mode, fixing a cash overweight requires diluting it with new buys. Without new cash and without permission to draw down existing cash, there is nothing to deploy.";
  if (usingCash && newCash === 0)
    return `Cash above target (${formatUsd(Math.min(excessCashAmount, cashExcess))}) is redirected to underweight assets. The portfolio total stays the same — only the mix changes.`;
  return "Available funds first close any underweight gaps. Any leftover is distributed by target weight so the portfolio remains balanced.";
}

function SandboxCardInner() {
  const { rebalanceError, isStale: positionsStale, lastAsOf, setNewCash, setExcessCashRedeploy } = useSandbox();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get("tab") === "rebalance" ? "rebalance" : "deploy"
  );
  const [newCashInput, setNewCashInput] = useState("");
  const [excessCashInput, setExcessCashInput] = useState("");
  const [isPlanBuilt, setIsPlanBuilt] = useState(false);
  const [isPlanStale, setIsPlanStale] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  // React to ?tab=rebalance being added/changed after initial mount
  useEffect(() => {
    if (searchParams.get("tab") === "rebalance") {
      setMode("rebalance");
      document.getElementById("rebalance")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams]);

  const { data: allocationData } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
  );

  const parsedNewCash = Math.max(
    0,
    parseFloat(newCashInput.replace(/[^0-9.]/g, "")) || 0,
  );
  const parsedExcessCash = Math.max(
    0,
    parseFloat(excessCashInput.replace(/[^0-9.]/g, "")) || 0,
  );

  const currentTotal = allocationData?.total ?? 0;

  const holdings: AssetHolding[] = (allocationData?.by_asset_class ?? [])
    .filter((s) => s.value > 0)
    .map((s) => ({
      name: s.name,
      label: humanize(s.name),
      value: s.value,
      pct: s.pct,
      targetPct: s.target_pct ?? 0,
    }));

  const cashName =
    holdings.find((h) => h.name.toLowerCase() === "cash")?.name ?? null;
  const cashHolding = holdings.find((h) => h.name === cashName);
  const cashOverweight = cashHolding
    ? cashHolding.value > (cashHolding.targetPct / 100) * currentTotal
    : false;
  const excessCap = cashHolding && cashOverweight
    ? Math.max(0, cashHolding.value - (cashHolding.targetPct / 100) * currentTotal)
    : 0;

  // Plan computed from the last committed context values (via useSandbox newCash / excessCashRedeploy)
  // For display we use parsedNewCash / parsedExcessCash only after Build is clicked — but
  // we keep a committed copy for the plan display. The plan itself is kept in local state
  // to freeze it until Rebuild is clicked.
  const [committedNewCash, setCommittedNewCash] = useState(0);
  const [committedExcess, setCommittedExcess] = useState(0);

  const plan = computePlan(holdings, currentTotal, mode, committedNewCash, committedExcess);
  const hero = getHero(mode, plan, committedNewCash, cashName, committedExcess);

  const inEmptyState = parsedNewCash === 0 && parsedExcessCash === 0;
  const showPlan = mode === "rebalance" || (isPlanBuilt && !inEmptyState);

  // For rebalance mode, compute plan directly from current (no committed values needed)
  const rebalancePlan = mode === "rebalance"
    ? computePlan(holdings, currentTotal, "rebalance", 0, 0)
    : null;
  const rebalanceHero = rebalancePlan
    ? getHero("rebalance", rebalancePlan, 0, cashName, 0)
    : null;

  const displayPlan = mode === "rebalance" ? (rebalancePlan ?? plan) : plan;
  const displayHero = mode === "rebalance" ? (rebalanceHero ?? hero) : hero;

  function handleModeChange(m: Mode) {
    setMode(m);
    setWhyOpen(false);
    setNewCashInput("");
    setExcessCashInput("");
    setIsPlanBuilt(false);
    setIsPlanStale(false);
    setCommittedNewCash(0);
    setCommittedExcess(0);
    setNewCash(0);
    setExcessCashRedeploy(0);
  }

  function handleNewCashChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNewCashInput(e.target.value);
    if (isPlanBuilt) setIsPlanStale(true);
  }

  function handleExcessCashChange(e: React.ChangeEvent<HTMLInputElement>) {
    setExcessCashInput(e.target.value);
    if (isPlanBuilt) setIsPlanStale(true);
  }

  function handleExcessCashBlur() {
    if (parsedExcessCash > excessCap) {
      setExcessCashInput(excessCap.toFixed(0));
    }
  }

  function handleBuildPlan() {
    const clampedExcess = Math.min(parsedExcessCash, excessCap);
    setCommittedNewCash(parsedNewCash);
    setCommittedExcess(clampedExcess);
    setNewCash(parsedNewCash);
    setExcessCashRedeploy(clampedExcess);
    setIsPlanBuilt(true);
    setIsPlanStale(false);
    setWhyOpen(false);
  }

  const ctaDisabled = inEmptyState;
  const ctaLabel = isPlanStale ? "Rebuild plan" : "Build plan";
  const showCta = !isPlanBuilt || isPlanStale || inEmptyState;

  return (
    <Card id="rebalance" className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-h3">
              {mode === "deploy" ? "Deploy cash" : "Full rebalance"}
            </CardTitle>
            <CardDescription className="tabular-nums">
              Portfolio: {formatUsd(currentTotal)}
              {mode === "rebalance" && " · Sells allowed across all assets"}
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-1">
            {(["deploy", "rebalance"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "deploy" ? "Deploy cash" : "Full rebalance"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {positionsStale && (
          <div className="rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            ⚠ Positions last updated {lastAsOf} — older than 30 days. Guidance
            is approximate.
          </div>
        )}

        {rebalanceError && (
          <p className="text-body-sm text-destructive">
            Rebalancing requires targets.{" "}
            <Link
              href="/targets"
              className="text-accent underline-offset-4 hover:underline"
            >
              Set targets →
            </Link>
          </p>
        )}

        {mode === "deploy" && (
          <div className="grid grid-cols-2 gap-3">
            {/* New cash to deploy */}
            <div>
              <label
                htmlFor="sandbox-cash"
                className="mb-1.5 block text-label text-muted-foreground"
              >
                New cash to deploy
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mono text-muted-foreground">
                  $
                </span>
                <input
                  id="sandbox-cash"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={newCashInput}
                  onChange={handleNewCashChange}
                  className="w-full rounded-md border border-input bg-transparent py-2 pl-7 pr-3 text-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            {/* Excess cash to redeploy */}
            <div>
              <label
                htmlFor="sandbox-excess"
                className="mb-1.5 block text-label text-muted-foreground"
              >
                Excess cash to redeploy
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mono text-muted-foreground">
                  $
                </span>
                <input
                  id="sandbox-excess"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={excessCashInput}
                  onChange={handleExcessCashChange}
                  onBlur={handleExcessCashBlur}
                  disabled={!cashOverweight}
                  className="w-full rounded-md border border-input bg-transparent py-2 pl-7 pr-3 text-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {cashOverweight
                  ? `up to ${formatUsd(excessCap)} above target`
                  : "No excess cash currently"}
              </p>
            </div>
          </div>
        )}

        {mode === "deploy" && showCta && (
          <Button
            type="button"
            disabled={ctaDisabled}
            onClick={handleBuildPlan}
            className="w-full"
          >
            {ctaLabel}
          </Button>
        )}

        {mode === "deploy" && !isPlanBuilt && (
          <p className="text-center text-body-sm text-muted-foreground">
            Enter an amount and click Build plan to see your action plan.
          </p>
        )}

        {showPlan && (
          <>
            {mode === "deploy" && isPlanStale && !inEmptyState && (
              <p className="text-body-sm text-muted-foreground">
                Based on previous inputs — click Rebuild to refresh.
              </p>
            )}

            <div className={mode === "deploy" && isPlanStale && !inEmptyState ? "opacity-50" : ""}>
              <div className="rounded-lg bg-muted px-4 py-4">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Plan
                </p>
                <p className="text-xl font-medium leading-snug tracking-tight tabular-nums">
                  {displayHero.headline}
                </p>
                {displayHero.sub && (
                  <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                    {displayHero.sub}
                  </p>
                )}
              </div>

              {holdings.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-label text-muted-foreground">
                          Asset class
                        </th>
                        <th className="pb-2 text-right text-label text-muted-foreground">
                          After
                        </th>
                        <th className="pb-2 text-right text-label text-muted-foreground">
                          Target
                        </th>
                        <th className="pb-2 text-right text-label text-muted-foreground">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayPlan.assets.map((asset) => {
                        const { action } = asset;
                        const isCash = asset.name === cashName;
                        let actionNode: React.ReactNode;
                        if (Math.abs(action) < 1) {
                          actionNode = (
                            <span className="text-muted-foreground">—</span>
                          );
                        } else if (isCash) {
                          if (action > 0)
                            actionNode = (
                              <span className="font-medium text-muted-foreground">
                                Add {formatUsd(action)}
                              </span>
                            );
                          else if (mode === "rebalance")
                            actionNode = (
                              <span className="font-medium text-destructive">
                                Sell {formatUsd(-action)}
                              </span>
                            );
                          else
                            actionNode = (
                              <span className="font-medium text-muted-foreground">
                                Use {formatUsd(-action)}
                              </span>
                            );
                        } else if (action > 0) {
                          actionNode = (
                            <span className="font-medium text-foreground">
                              Buy {formatUsd(action)}
                            </span>
                          );
                        } else {
                          actionNode = (
                            <span className="font-medium text-destructive">
                              Sell {formatUsd(-action)}
                            </span>
                          );
                        }

                        const afterTotal = mode === "deploy"
                          ? currentTotal + committedNewCash
                          : currentTotal;

                        return (
                          <tr key={asset.name}>
                            <td className="py-3 text-body-sm text-foreground">
                              {asset.label}
                            </td>
                            <td className="py-3 text-right text-mono-sm tabular-nums text-muted-foreground">
                              {formatPct(afterTotal > 0 ? (asset.value + asset.action) / afterTotal : 0)}
                            </td>
                            <td className="py-3 text-right text-mono-sm tabular-nums text-muted-foreground">
                              {formatPct(asset.targetPct / 100)}
                            </td>
                            <td className="py-3 text-right text-mono-sm tabular-nums">
                              {actionNode}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setWhyOpen((v) => !v)}
                className="text-body-sm text-accent underline-offset-4 hover:underline"
              >
                {whyOpen ? "Hide explanation" : "Why these amounts?"}
              </button>
              <span className="text-right text-label text-muted-foreground">
                Execute at your broker, then re-upload your statement
              </span>
            </div>

            {whyOpen && (
              <p className="rounded-lg bg-muted px-4 py-3 text-body-sm text-muted-foreground">
                {getWhyText(mode, displayPlan, committedNewCash, committedExcess)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SandboxCard() {
  return (
    <Suspense fallback={null}>
      <SandboxCardInner />
    </Suspense>
  );
}
