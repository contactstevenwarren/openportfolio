"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";

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
  includeCashExcess: boolean,
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
  const cashDrawdown = includeCashExcess && cashOverweight ? cashExcess : 0;
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
): { headline: string; sub: string } {
  const { buyTotal, sellTotal, assets, cashExcess } = plan;
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
    const hint = cashExcess > 0 ? " or enable rebalancing of excess cash" : "";
    return { headline: "Nothing to deploy", sub: `Add new cash above${hint} to begin.` };
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

function computeSuggestedCash(
  holdings: AssetHolding[],
  currentTotal: number,
  cashName: string | null,
  includeCashExcess: boolean,
): number {
  const cashHolding = holdings.find((h) => h.name === cashName);
  const cashOverweight = cashHolding
    ? cashHolding.value > (cashHolding.targetPct / 100) * currentTotal
    : false;

  function residual(x: number): number {
    const newTotal = currentTotal + x;
    const cashTarget = cashHolding ? (cashHolding.targetPct / 100) * newTotal : 0;
    const cashExcess = cashHolding ? Math.max(0, cashHolding.value - cashTarget) : 0;
    const cashDrawdown = includeCashExcess ? cashExcess : 0;
    const totalAvailable = x + cashDrawdown;
    const totalDeficit = holdings.reduce((s, h) => {
      if (h.name === cashName && cashOverweight) return s;
      return s + Math.max(0, (h.targetPct / 100) * newTotal - h.value);
    }, 0);
    return totalAvailable - totalDeficit;
  }

  if (residual(0) >= 0) return 0;

  let lo = 0, hi = currentTotal * 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (residual(mid) >= 0) hi = mid;
    else lo = mid;
  }
  return Math.round(hi);
}

function getWhyText(
  mode: Mode,
  plan: Plan,
  newCash: number,
  includeCashExcess: boolean,
): string {
  if (mode === "rebalance")
    return "Full rebalance moves every asset class to its exact target percentage at the current portfolio total. Sells are allowed alongside buys.";
  const { cashExcess } = plan;
  const usingCash = includeCashExcess && cashExcess > 0;
  if (newCash === 0 && !usingCash && cashExcess > 0)
    return "In buy-only mode, fixing a cash overweight requires diluting it with new buys. Without new cash and without permission to draw down existing cash, there is nothing to deploy.";
  if (usingCash && newCash === 0)
    return `Cash above target (${formatUsd(cashExcess)}) is redirected to underweight assets. The portfolio total stays the same — only the mix changes.`;
  return "Available funds first close any underweight gaps. Any leftover is distributed by target weight so the portfolio remains balanced.";
}

export function SandboxCard() {
  const { rebalanceError, isStale, lastAsOf, setNewCash, includeCashExcess, setIncludeCashExcess } = useSandbox();
  const [mode, setMode] = useState<Mode>("deploy");
  const [inputValue, setInputValue] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);

  const { data: allocationData } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
  );

  const newCash = Math.max(
    0,
    parseFloat(inputValue.replace(/[^0-9.]/g, "")) || 0,
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

  const plan = computePlan(holdings, currentTotal, mode, newCash, includeCashExcess);
  const suggestedNewCash = computeSuggestedCash(
    holdings, currentTotal, cashName, includeCashExcess,
  );
  const suggestedCashDrawdown = (() => {
    if (!includeCashExcess || !cashHolding) return 0;
    const cashTarget = (cashHolding.targetPct / 100) * (currentTotal + suggestedNewCash);
    return Math.max(0, cashHolding.value - cashTarget);
  })();
  const suggestedTotal = suggestedNewCash + suggestedCashDrawdown;
  const showActivePlan = mode === "rebalance" || newCash > 0;
  const isToggleOn = includeCashExcess && cashOverweight;
  const hero = getHero(mode, plan, newCash, cashName);

  function handleModeChange(m: Mode) {
    setMode(m);
    setWhyOpen(false);
    setInputValue("");
    setNewCash(0);
    setIncludeCashExcess(false);
  }

  function handleCashChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    const parsed = Math.max(
      0,
      parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0,
    );
    setNewCash(parsed);
  }

  const cashInput = (
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
          value={inputValue}
          onChange={handleCashChange}
          className="w-full rounded-md border border-input bg-transparent py-2 pl-7 pr-3 text-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );

  return (
    <Card className="h-full">
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
        {isStale && (
          <div className="rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            ⚠ Positions last updated {lastAsOf} — older than 30 days. Guidance
            is approximate.
          </div>
        )}

        {rebalanceError && (
          <p className="text-body-sm text-destructive">
            Rebalancing requires targets.{" "}
            <Link
              href="/legacy/targets"
              className="text-accent underline-offset-4 hover:underline"
            >
              Set targets →
            </Link>
          </p>
        )}

        {mode === "deploy" && cashInput}

        {mode === "deploy" && suggestedTotal >= 1 && (
          <button
            type="button"
            onClick={() => {
              const formatted = suggestedNewCash.toFixed(0);
              setInputValue(formatted);
              setNewCash(suggestedNewCash);
            }}
            className="rounded-md bg-accent-soft px-3 py-2 text-left text-body-sm text-accent hover:brightness-95"
          >
            <span className="font-medium tabular-nums">
              {formatUsd(suggestedTotal)}
            </span>{" "}
            closes all allocation gaps
          </button>
        )}

        {mode === "deploy" && (
          <button
            type="button"
            disabled={!cashOverweight}
            onClick={() => setIncludeCashExcess(!includeCashExcess)}
            className="flex items-center justify-between gap-3 py-1.5 text-left text-body-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              Redeploy excess cash
              {cashOverweight && (
                <span className="ml-1.5 text-muted-foreground tabular-nums">
                  ({formatUsd(plan.cashExcess)})
                </span>
              )}
            </span>
            <span
              className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                isToggleOn ? "bg-accent" : "bg-input"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-background shadow transition-transform ${
                  isToggleOn ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </span>
          </button>
        )}

        {showActivePlan && (
          <>
            <div className="rounded-lg bg-muted px-4 py-4">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Plan
              </p>
              <p className="text-xl font-medium leading-snug tracking-tight tabular-nums">
                {hero.headline}
              </p>
              {hero.sub && (
                <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                  {hero.sub}
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
                    {plan.assets.map((asset) => {
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

                      return (
                        <tr key={asset.name}>
                          <td className="py-3 text-body-sm text-foreground">
                            {asset.label}
                          </td>
                          <td className="py-3 text-right text-mono-sm tabular-nums text-muted-foreground">
                            {formatPct((asset.value + asset.action) / (currentTotal + newCash))}
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
                {getWhyText(mode, plan, newCash, includeCashExcess)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
