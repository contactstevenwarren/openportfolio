"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import useSWR from "swr";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Provenance } from "@/app/lib/provenance";
import { api, type AllocationResult } from "@/app/lib/api";
import { humanize } from "@/app/lib/labels";
import { useSandbox } from "@/app/lib/sandbox-context";
import { formatPct, formatUsd, type DriftRow } from "../mocks";
import { NAME_TO_CLASS } from "./donut-card";

const SCALE_MAX = 0.6;

function tone(gap: number): string {
  if (Math.abs(gap) <= 0.005) return "bg-emerald-500/70";
  if (gap > 0) return "bg-amber-500/70";
  return "bg-slate-400/70";
}

function MiniBar({ row }: { row: DriftRow }) {
  const actualWidth = Math.min(row.actualPct, SCALE_MAX) / SCALE_MAX;
  const targetPos = Math.min(row.targetPct, SCALE_MAX) / SCALE_MAX;
  return (
    <div
      className="relative h-2 w-full rounded-full bg-muted"
      role="img"
      aria-label={`actual ${formatPct(row.actualPct)} vs target ${formatPct(row.targetPct)}`}
    >
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${tone(row.gap)}`}
        style={{ width: `${actualWidth * 100}%` }}
      />
      <div
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background"
        style={{ left: `${targetPos * 100}%` }}
        aria-hidden
      />
    </div>
  );
}

export function DriftDetailCard() {
  const { simulatedSlices, newCash } = useSandbox();
  const { data } = useSWR<AllocationResult>("/api/allocation", api.allocation);

  const isSimulating = simulatedSlices != null;
  const sourceSlices = simulatedSlices ?? data?.by_asset_class ?? [];
  const baseTotal = data?.total ?? 0;
  const total = isSimulating ? baseTotal + newCash : baseTotal;

  const rows: DriftRow[] = sourceSlices
    .map((s) => {
      const actualPct = s.pct / 100;
      const targetPct = (s.target_pct ?? s.pct) / 100;
      return {
        class: NAME_TO_CLASS[s.name] ?? "other",
        label: humanize(s.name),
        actualPct,
        targetPct,
        gap: actualPct - targetPct,
        deltaUsd: (targetPct - actualPct) * total,
      };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">
          Drift detail
          {isSimulating && (
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-body-sm font-medium text-warning">
              <span aria-hidden>◎</span>
              <span>Projected</span>
            </span>
          )}
        </CardTitle>
        <CardDescription>Per-class gap to target</CardDescription>
        <CardAction>
          <a
            href="/?tab=rebalance"
            className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            Open rebalance <span aria-hidden>&rarr;</span>
          </a>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            {data ? "No positions to display." : "Loading…"}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => {
              const isBuy = row.deltaUsd > 0;
              const ArrowIcon = isBuy ? ArrowUp : ArrowDown;
              const arrowClass = isBuy ? "text-emerald-600" : "text-rose-600";
              return (
                <li
                  key={row.class}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-body-sm w-24 shrink-0 truncate">
                    {row.label}
                  </span>
                  <div className="min-w-[120px] flex-1">
                    <MiniBar row={row} />
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Provenance source="drift-engine">
                      <span className="text-mono-sm">
                        {formatPct(row.gap, { signed: true })}
                      </span>
                    </Provenance>
                    <span className="inline-flex items-center gap-1">
                      <ArrowIcon
                        className={`size-3.5 ${arrowClass}`}
                        aria-hidden
                      />
                      <Provenance source="drift-engine">
                        <span className="text-mono-sm">
                          {formatUsd(Math.abs(row.deltaUsd))}
                        </span>
                      </Provenance>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
