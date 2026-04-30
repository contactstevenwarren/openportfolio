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

  const simPctByName = new Map(
    (simulatedSlices ?? []).map((s) => [s.name, s.pct]),
  );
  const moveByPath = new Map(moves.map((m) => [m.path, m.delta_usd]));
  const total = allocationData?.total ?? 0;

  // Multi-asset buy-only solution: find X and per-asset x_i such that
  // (v_i + x_i) / (T + X) = t_i for all underweight i simultaneously.
  // X = (T·Σt_i − Σv_i) / (1 − Σt_i), then x_i = t_i·(T+X) − v_i.
  // Use drift_pct < 0 as the underweight signal (avoids float comparison bugs).
  const baseSlices = allocationData?.by_asset_class ?? [];
  const underweight = baseSlices.filter(
    (s) => s.value > 0 && s.target_pct != null && s.target_pct < 100 &&
      (s.drift_pct != null ? s.drift_pct < 0 : s.target_pct > s.pct + 0.01),
  );
  const sumTargetFrac = underweight.reduce((acc, s) => acc + (s.target_pct ?? 0) / 100, 0);
  const sumValues = underweight.reduce((acc, s) => acc + s.value, 0);
  const totalNeeds =
    sumTargetFrac > 0 && sumTargetFrac < 1 && total > 0
      ? Math.max(0, (total * sumTargetFrac - sumValues) / (1 - sumTargetFrac))
      : null;
  const needsUsdByName = new Map<string, number>(
    totalNeeds != null
      ? underweight.map((s) => [
          s.name,
          Math.max(0, (s.target_pct! / 100) * (total + totalNeeds) - s.value),
        ])
      : [],
  );

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
                  {moves.length > 0 && (
                    <th className="pb-2 text-right text-label text-muted-foreground">
                      Buy
                    </th>
                  )}
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
                    {moves.length > 0 && (
                      <td className="py-2 text-right text-mono-sm tabular-nums text-foreground">
                        {row.buyUsd != null
                          ? `+${formatUsd(row.buyUsd)}`
                          : "—"}
                      </td>
                    )}
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
            <span className="font-medium text-foreground">
              {formatUsd(totalNeeds)}
            </span>{" "}
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
