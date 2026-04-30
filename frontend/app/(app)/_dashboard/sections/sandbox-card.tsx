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

type TableRow = {
  path: string;
  label: string;
  afterPct: number;
  targetPct: number | null;
  needsUsd: number | null;
  buyUsd: number | null;
};

function SimBadge({ label }: { label: string }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-body-sm font-medium text-warning">
      <span aria-hidden>◎</span>
      <span>{label}</span>
    </span>
  );
}

export function SandboxCard() {
  const { moves, rebalanceError, isStale, lastAsOf, setNewCash, simulatedSlices } =
    useSandbox();
  const [inputValue, setInputValue] = useState("");
  const { data: allocationData } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
  );

  const isSimulating = simulatedSlices != null;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setInputValue(raw);
    const parsed = parseFloat(raw.replace(/[^0-9.]/g, ""));
    setNewCash(isNaN(parsed) ? 0 : parsed);
  }

  function handleSuggestionClick(amount: number) {
    const rounded = Math.round(amount);
    setInputValue(String(rounded));
    setNewCash(rounded);
  }

  const simPctByName = new Map(
    (simulatedSlices ?? []).map((s) => [s.name, s.pct]),
  );
  const moveByPath = new Map(moves.map((m) => [m.path, m.delta_usd]));
  const total = allocationData?.total ?? 0;

  // Buy-only rebalancing solver.
  //
  // Injecting cash X grows the total, diluting even at-target assets. We solve
  // for the set S of assets to buy and the total X such that every per-asset
  // amount x_i = t_i·(T+X) − v_i is strictly positive.
  //
  // Strategy: sort by v_i/t_i descending (most overweight first), then try
  // progressively smaller subsets — dropping one asset from the front each
  // round — until all x_i are positive. The most overweight asset is always
  // the one whose x_i goes negative first, so this converges in at most
  // O(n) iterations.
  const baseSlices = allocationData?.by_asset_class ?? [];
  const targeted = baseSlices
    .filter((s): s is typeof s & { target_pct: number } =>
      s.value > 0 && s.target_pct != null && s.target_pct > 0,
    )
    .sort((a, b) => b.value / b.target_pct - a.value / a.target_pct);

  let totalNeeds: number | null = null;
  const needsUsdByName = new Map<string, number>();

  for (let drop = 0; drop < targeted.length; drop++) {
    const subset = targeted.slice(drop);
    const sumT = subset.reduce((acc, s) => acc + s.target_pct / 100, 0);
    if (sumT >= 1) continue; // denominator collapses; drop another asset

    const sumV = subset.reduce((acc, s) => acc + s.value, 0);
    const X = (total * sumT - sumV) / (1 - sumT);
    if (X <= 0) continue;

    const perAsset = subset.map(
      (s) => [s.name, (s.target_pct / 100) * (total + X) - s.value] as const,
    );
    if (perAsset.every(([, x]) => x > 0)) {
      totalNeeds = X;
      for (const [name, x] of perAsset) needsUsdByName.set(name, x);
      break;
    }
  }

  const rows: TableRow[] = baseSlices
    .filter((s) => s.value > 0)
    .map((s) => {
      const afterPct = isSimulating
        ? (simPctByName.get(s.name) ?? s.pct)
        : s.pct;
      const targetPct = s.target_pct ?? null;
      const needsUsd = needsUsdByName.get(s.name) ?? null;
      const buyUsd = moveByPath.get(s.name) ?? null;
      return {
        path: s.name,
        label: humanize(s.name),
        afterPct,
        targetPct,
        needsUsd,
        buyUsd,
      };
    })
    .sort((a, b) => (b.needsUsd ?? 0) - (a.needsUsd ?? 0));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">
          Sandbox
          {isSimulating && <SimBadge label="Active" />}
        </CardTitle>
        <CardDescription>Deploy new cash, buy-only</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Currency input */}
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
              onChange={handleChange}
              className="w-full rounded-md border border-input bg-transparent py-2 pl-7 pr-3 text-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Stale banner */}
        {isStale && (
          <div className="rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning">
            ⚠ Positions last updated {lastAsOf} — older than 30 days. Guidance
            is approximate.
          </div>
        )}

        {/* Error: no targets */}
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

        {/* Allocation table */}
        {rows.length > 0 && (
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
                    Needs
                  </th>
                  <th className="pb-2 text-right text-label text-muted-foreground">
                    Buy
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.path}>
                    <td className="py-2 text-body-sm text-foreground">
                      {row.label}
                    </td>
                    <td className="py-2 text-right text-mono-sm tabular-nums text-muted-foreground">
                      {formatPct(row.afterPct / 100)}
                    </td>
                    <td className="py-2 text-right text-mono-sm tabular-nums text-muted-foreground">
                      {row.targetPct != null
                        ? formatPct(row.targetPct / 100)
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-mono-sm tabular-nums text-foreground">
                      {row.needsUsd != null
                        ? `+${formatUsd(row.needsUsd)}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-mono-sm tabular-nums text-foreground">
                      {row.buyUsd != null
                        ? `+${formatUsd(row.buyUsd)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Suggested total */}
        {totalNeeds != null && totalNeeds > 1 && (
          <p className="text-body-sm text-muted-foreground">
            To close all gaps simultaneously, deploy{" "}
            <button
              type="button"
              onClick={() => handleSuggestionClick(totalNeeds)}
              className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/70"
            >
              {formatUsd(totalNeeds)}
            </button>{" "}
            total.
          </p>
        )}

        {/* Footer */}
        <p className="mt-auto text-label text-muted-foreground">
          Buy-only · Asset-class level · Execute at your broker, then re-upload
          your statement.
        </p>
      </CardContent>
    </Card>
  );
}
