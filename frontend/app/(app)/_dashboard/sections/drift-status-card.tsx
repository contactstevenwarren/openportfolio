"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertCircle, AlertTriangle, CheckCircle2, Database, Target } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { api, type AllocationResult, type DriftBand } from "@/app/lib/api";

// Modern dashboard routes for rebalance / targets do not exist yet — only the
// legacy pages. Leaving these pointed at /legacy/... until the modern routes
// land. TODO(routes): swap when /(app)/rebalance and /(app)/targets ship.
const REBALANCE_HREF = "/legacy/rebalance";
const TARGETS_HREF = "/legacy/targets";
const POSITIONS_HREF = "/legacy/positions";

type StateKind =
  | "loading"
  | "error"
  | "no_targets"
  | "not_enough_data"
  | "ok"
  | "watch"
  | "act"
  | "urgent";

type View = {
  Icon: typeof AlertCircle;
  iconClass: string;
  pillClass: string;
  pillLabel: string;
  headline: string;
  sub: React.ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  ctaPrimary?: boolean;
  emphasized?: boolean;
};

// Band → drift card state. Loading / error / empty states are computed
// outside this map so they never silently fall through to "On track."
function resolveState(
  data: AllocationResult | undefined,
  error: unknown,
  isLoading: boolean,
): StateKind {
  if (isLoading || (!data && !error)) return "loading";
  if (error) return "error";
  if (!data) return "not_enough_data";

  const hasPositions = data.by_asset_class.some((s) => s.value > 0);
  if (!hasPositions) return "not_enough_data";

  // Backend exposes the configured-targets signal via summary; absence of any
  // target_pct on the asset-class slices is the same signal. Either is enough
  // to branch into "no targets set."
  const hasTargets = data.by_asset_class.some(
    (s) => s.target_pct != null && s.target_pct > 0,
  );
  if (!hasTargets) return "no_targets";

  const band: DriftBand = data.max_drift_band ?? "ok";
  return band;
}

function viewFor(kind: StateKind): View {
  switch (kind) {
    case "loading":
      return {
        Icon: Database,
        iconClass: "text-muted-foreground",
        pillClass: "bg-muted text-muted-foreground",
        pillLabel: "Loading",
        headline: "Loading drift…",
        sub: "Fetching latest allocation",
      };
    case "error":
      return {
        Icon: AlertCircle,
        iconClass: "text-destructive",
        pillClass: "bg-destructive/10 text-destructive",
        pillLabel: "Error",
        headline: "Couldn't load drift",
        sub: "Reload to try again",
      };
    case "no_targets":
      return {
        Icon: Target,
        iconClass: "text-muted-foreground",
        pillClass: "bg-muted text-muted-foreground",
        pillLabel: "No targets",
        headline: "No targets set",
        sub: "Set targets to track drift over time",
        ctaLabel: "Set targets",
        ctaHref: TARGETS_HREF,
      };
    case "not_enough_data":
      return {
        Icon: Database,
        iconClass: "text-muted-foreground",
        pillClass: "bg-muted text-muted-foreground",
        pillLabel: "No data",
        headline: "Not enough data",
        sub: "Add at least one snapshot with positions to see drift",
        ctaLabel: "Import positions",
        ctaHref: POSITIONS_HREF,
      };
    case "ok":
      return {
        Icon: CheckCircle2,
        iconClass: "text-emerald-500",
        pillClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        pillLabel: "On track",
        headline: "On track",
        sub: "All classes within tolerance",
      };
    case "watch":
      return {
        Icon: AlertCircle,
        iconClass: "text-amber-500",
        pillClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        pillLabel: "Watch",
        headline: "Drift detected",
        sub: "Direct new contributions to your underweight classes — no trades needed yet.",
      };
    case "act":
      return {
        Icon: AlertCircle,
        iconClass: "text-orange-500",
        pillClass: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
        pillLabel: "Act",
        headline: "Rebalance recommended",
        sub: "Drift has crossed the action threshold.",
        ctaLabel: "View rebalance",
        ctaHref: REBALANCE_HREF,
        ctaPrimary: true,
      };
    case "urgent":
      return {
        Icon: AlertTriangle,
        iconClass: "text-red-500",
        pillClass: "bg-red-500/10 text-red-700 dark:text-red-400",
        pillLabel: "Urgent",
        headline: "Rebalance strongly recommended",
        sub: "Drift is well past the action threshold.",
        ctaLabel: "View rebalance",
        ctaHref: REBALANCE_HREF,
        ctaPrimary: true,
        emphasized: true,
      };
  }
}

export function DriftStatusCard() {
  const { data, error, isLoading } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
  );

  const kind = resolveState(data, error, isLoading);
  const view = viewFor(kind);
  const { Icon, iconClass, pillClass, pillLabel, headline, sub, ctaLabel, ctaHref, ctaPrimary, emphasized } =
    view;

  return (
    <Card className={"h-full" + (emphasized ? " ring-1 ring-red-500/40" : "")}>
      <CardHeader>
        <CardTitle className="text-h3">Drift status</CardTitle>
        <CardDescription>Vs. target allocation</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-[160px] flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-5 shrink-0 ${iconClass}`} aria-hidden />
          <div className="text-h2 leading-tight">{headline}</div>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${pillClass}`}
          >
            {pillLabel}
          </span>
        </div>
        <div className="text-body text-muted-foreground">{sub}</div>
        {ctaLabel && ctaHref ? (
          <div className="mt-auto pt-2">
            <Link
              href={ctaHref}
              className={
                ctaPrimary
                  ? "inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-body-sm font-medium text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  : "inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
              }
            >
              {ctaLabel} <span aria-hidden>&rarr;</span>
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
