"use client";

import useSWR from "swr";
import { Provenance } from "@/app/lib/provenance";
import type { Account, AllocationResult, SnapshotEarliest } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import { formatPct, formatUsd } from "@/app/(app)/_dashboard/mocks";
import {
  daysSince,
  stalenessState,
} from "@/app/(app)/accounts/_accounts/mocks";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatProseDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function isStaleOrNew(a: Account): boolean {
  return a.last_updated_at === null || stalenessState(a) === "stale";
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

  // Derived: investable / net worth
  const investable = allocation?.total ?? 0;
  const netWorth = allocation?.net_worth ?? 0;
  const investablePct = netWorth > 0 ? investable / netWorth : null;

  // Derived: delta vs earliest snapshot
  const hasDelta =
    snapshot != null &&
    snapshot.net_worth_usd > 0 &&
    netWorth > 0;
  const deltaUsd = hasDelta ? netWorth - snapshot!.net_worth_usd : 0;
  const deltaPct = hasDelta ? deltaUsd / snapshot!.net_worth_usd : 0;
  const deltaPositive = deltaUsd >= 0;
  const deltaTone = deltaPositive ? "text-success" : "text-destructive";
  const deltaGlyph = deltaPositive ? "↗" : "↘";

  // Derived: stale counts
  const active = accounts?.filter((a) => !a.is_archived) ?? [];
  const staleRows = active.filter(isStaleOrNew);
  const staleCount = staleRows.length;
  const oldestDays =
    staleCount > 0
      ? Math.max(
          ...staleRows
            .filter((a) => a.last_updated_at !== null)
            .map((a) => daysSince(a.last_updated_at!))
        )
      : 0;
  const freshCount = active.length - staleCount;

  // Provenance: source="computed", capturedAt = max last_updated_at
  const capturedAt = maxLastUpdated(active);
  const provProps = {
    source: "computed",
    confidence: null as null,
    capturedAt,
  };

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
            <Provenance {...provProps}>
              {formatUsd(investable)}
            </Provenance>
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
            <Provenance {...provProps}>
              {formatUsd(netWorth)}
            </Provenance>
          ) : (
            formatUsd(netWorth)
          )}
        </p>
        {hasDelta && !loading && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`text-body font-mono tabular-nums ${deltaTone}`}>
              <Provenance
                source="computed"
                confidence={null}
                capturedAt={snapshot!.taken_at}
              >
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

      {/* Column 3 — Status */}
      <div className="flex flex-col gap-2 @lg/main:col-span-4 @lg/main:border-l @lg/main:border-border @lg/main:pl-6">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Status
        </p>
        <div>
          {staleCount === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-body-sm font-medium text-success">
              <span aria-hidden>▲</span>
              <span>All accounts fresh</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-body-sm font-medium text-warning">
              <span aria-hidden>●</span>
              <span>
                {staleCount} stale
                {oldestDays > 0 ? ` · oldest ${oldestDays}d` : ""}
              </span>
            </span>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground">
          {accountsLoading
            ? "—"
            : `${freshCount} of ${active.length} accounts fresh`}
        </p>
      </div>
    </section>
  );
}
