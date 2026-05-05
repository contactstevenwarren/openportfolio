"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertCircle, AlertTriangle, CheckCircle2, Database, Target } from "lucide-react";
import { Provenance } from "@/app/lib/provenance";
import type { Account, AllocationResult, DriftBand, SnapshotEarliest } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import { formatPct, formatUsd } from "@/app/(app)/_dashboard/mocks";

// ── Routes (TODO: swap when modern pages ship) ────────────────────────────────

const REBALANCE_HREF = "/?tab=rebalance";
const TARGETS_HREF = "/targets";
const POSITIONS_HREF = "/legacy/positions";

// ── Drift-status helpers (inlined from drift-status-card.tsx) ─────────────────

type DriftStateKind =
  | "loading" | "error" | "no_targets" | "not_enough_data"
  | "ok" | "watch" | "act" | "urgent";

function resolveDriftState(
  data: AllocationResult | undefined,
  error: unknown,
  isLoading: boolean,
): DriftStateKind {
  if (isLoading || (!data && !error)) return "loading";
  if (error) return "error";
  if (!data) return "not_enough_data";
  const hasPositions = data.by_asset_class.some((s) => s.value > 0);
  if (!hasPositions) return "not_enough_data";
  const hasTargets = data.by_asset_class.some(
    (s) => s.target_pct != null && s.target_pct > 0,
  );
  if (!hasTargets) return "no_targets";
  return (data.max_drift_band ?? "ok") as DriftBand;
}

type DriftView = {
  pillClass: string;
  pillLabel: string;
  sub: string;
  ctaLabel?: string;
  ctaHref?: string;
};

function driftViewFor(kind: DriftStateKind): DriftView {
  switch (kind) {
    case "loading":
      return { pillClass: "bg-muted text-muted-foreground", pillLabel: "—", sub: "Loading…" };
    case "error":
      return { pillClass: "bg-destructive/10 text-destructive", pillLabel: "Error", sub: "Reload to retry" };
    case "no_targets":
      return {
        pillClass: "bg-muted text-muted-foreground",
        pillLabel: "No targets",
        sub: "Set targets to track drift",
        ctaLabel: "Set targets",
        ctaHref: TARGETS_HREF,
      };
    case "not_enough_data":
      return {
        pillClass: "bg-muted text-muted-foreground",
        pillLabel: "No data",
        sub: "Add positions to see drift",
        ctaLabel: "Import positions",
        ctaHref: POSITIONS_HREF,
      };
    case "ok":
      return {
        pillClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        pillLabel: "On track",
        sub: "All classes within tolerance",
      };
    case "watch":
      return {
        pillClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        pillLabel: "Watch",
        sub: "Direct new contributions to underweight classes",
      };
    case "act":
      return {
        pillClass: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
        pillLabel: "Act",
        sub: "Drift has crossed the action threshold",
        ctaLabel: "View rebalance",
        ctaHref: REBALANCE_HREF,
      };
    case "urgent":
      return {
        pillClass: "bg-red-500/10 text-red-700 dark:text-red-400",
        pillLabel: "Urgent",
        sub: "Drift is well past the action threshold",
        ctaLabel: "View rebalance",
        ctaHref: REBALANCE_HREF,
      };
  }
}

// ── Other helpers ─────────────────────────────────────────────────────────────

function formatProseDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function maxLastUpdated(accounts: Account[]): string | null {
  return accounts.reduce<string | null>((max, a) => {
    if (!a.last_updated_at) return max;
    if (!max || a.last_updated_at > max) return a.last_updated_at;
    return max;
  }, null);
}

// ── HeroSection ───────────────────────────────────────────────────────────────

export function HeroSection() {
  const {
    data: allocation,
    error: allocError,
    isLoading: allocLoading,
  } = useSWR<AllocationResult>("/api/allocation", api.allocation, {
    revalidateOnFocus: false,
  });

  const { data: accounts, isLoading: accountsLoading } = useSWR<Account[]>(
    "/api/accounts",
    api.accounts,
    { revalidateOnFocus: false }
  );

  const { data: snapshot } = useSWR<SnapshotEarliest | null>(
    "/api/snapshots/earliest",
    api.snapshotsEarliest,
    { revalidateOnFocus: false }
  );

  const loading = allocLoading || accountsLoading;

  // Derived: investable / net worth / liabilities
  const investable = allocation?.total ?? 0;
  const netWorth = allocation?.net_worth ?? 0;
  const assetsTotal = allocation?.assets_total ?? netWorth;
  const liabilitiesTotal = allocation?.liabilities_total ?? 0;
  const investablePct = netWorth > 0 ? investable / netWorth : null;

  // Derived: delta vs earliest snapshot
  const hasDelta = snapshot != null && snapshot.net_worth_usd > 0 && netWorth > 0;
  const deltaUsd = hasDelta ? netWorth - snapshot!.net_worth_usd : 0;
  const deltaPct = hasDelta ? deltaUsd / snapshot!.net_worth_usd : 0;
  const deltaPositive = deltaUsd >= 0;
  const deltaTone = deltaPositive ? "text-success" : "text-destructive";
  const deltaGlyph = deltaPositive ? "↗" : "↘";

  // Derived: drift state for column 3
  const driftKind = resolveDriftState(allocation, allocError, allocLoading);
  const driftView = driftViewFor(driftKind);

  // Provenance: source="computed", capturedAt = max last_updated_at
  const active = accounts?.filter((a) => !a.is_archived) ?? [];
  const capturedAt = maxLastUpdated(active);
  const provProps = { source: "computed", confidence: null as null, capturedAt };

  if (allocError) {
    return (
      <section className="px-1 py-2">
        <p className="text-body-sm text-muted-foreground">
          Couldn&apos;t load dashboard data.
        </p>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-6 px-1 py-2 @lg/main:grid-cols-12">

      {/* Column 1 — Investable portfolio */}
      <div className="flex flex-col gap-2 @lg/main:col-span-4">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Investable portfolio
        </p>
        <p className="text-display font-mono tabular-nums">
          {loading ? (
            <span className="text-muted-foreground">—</span>
          ) : capturedAt ? (
            <Provenance {...provProps}>{formatUsd(investable)}</Provenance>
          ) : (
            formatUsd(investable)
          )}
        </p>
        <p className="text-body-sm text-muted-foreground">
          {investablePct != null
            ? `${formatPct(investablePct, { digits: 0 })} of net worth`
            : "—"}
        </p>
      </div>

      {/* Column 2 — Net worth */}
      <div className="flex flex-col gap-2 @lg/main:col-span-4 @lg/main:border-l @lg/main:border-border @lg/main:pl-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Net worth
        </p>
        <p className="text-display font-mono tabular-nums">
          {loading ? (
            <span className="text-muted-foreground">—</span>
          ) : capturedAt ? (
            <Provenance
              {...provProps}
              footnote={
                liabilitiesTotal > 0
                  ? `${formatUsd(assetsTotal)} assets − ${formatUsd(liabilitiesTotal)} liabilities`
                  : undefined
              }
            >
              {formatUsd(netWorth)}
            </Provenance>
          ) : (
            formatUsd(netWorth)
          )}
        </p>
        {hasDelta && !loading && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`text-body font-mono tabular-nums ${deltaTone}`}>
              <Provenance source="computed" confidence={null} capturedAt={snapshot!.taken_at}>
                {formatUsd(deltaUsd, { signed: true })} ·{" "}
                {formatPct(deltaPct, { signed: true, digits: 2 })}{" "}
                <span aria-hidden>{deltaGlyph}</span>
              </Provenance>
            </span>
            <span className="text-body-sm text-muted-foreground">
              since {formatProseDate(snapshot!.taken_at)}
            </span>
          </div>
        )}
      </div>

      {/* Column 3 — Drift status */}
      <div className="flex flex-col gap-2 @lg/main:col-span-4 @lg/main:border-l @lg/main:border-border @lg/main:pl-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Drift status
        </p>
        <div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-body-sm font-medium ${driftView.pillClass}`}
          >
            {driftView.pillLabel}
          </span>
        </div>
        <p className="text-body-sm text-muted-foreground">{driftView.sub}</p>
        {driftView.ctaLabel && driftView.ctaHref && (
          <div className="mt-auto pt-1">
            <Link
              href={driftView.ctaHref}
              className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
            >
              {driftView.ctaLabel} <span aria-hidden>&rarr;</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
