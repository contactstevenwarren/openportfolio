"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/app/components/ui/sheet";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  api,
  type PositionContribution,
  type PositionContributionsResponse,
} from "@/app/lib/api";
import { humanize } from "@/app/lib/labels";
import { cn } from "@/app/lib/utils";
import { formatPct, formatUsd } from "../mocks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelScope = {
  assetClass: string;
  l2?: string;
  /** L1-level target and drift, shown in panel header when present. */
  targetPct?: number | null;
  driftPct?: number | null;
  /** True when sandbox simulation is active. */
  isSimulating?: boolean;
};

type SortKey = "contributing_value" | "ticker" | "account_name" | "share_of_portfolio";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DonutDrillPanel({
  scope,
  open,
  onClose,
}: {
  scope: PanelScope | null;
  open: boolean;
  onClose: () => void;
}) {
  const swrKey = scope
    ? scope.l2
      ? `/api/allocation/positions/${scope.assetClass}?l2=${scope.l2}`
      : `/api/allocation/positions/${scope.assetClass}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<PositionContributionsResponse>(
    open && scope ? swrKey : null,
    () => api.allocationPositions(scope!.assetClass, scope?.l2),
    { revalidateOnFocus: false },
  );

  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("contributing_value");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  // Reset search when scope changes.
  React.useEffect(() => {
    setSearch("");
    setSortKey("contributing_value");
    setSortDir("desc");
  }, [scope?.assetClass, scope?.l2]);

  // Debounced search filter.
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(t);
  }, [search]);

  const title = scope
    ? scope.l2
      ? `${humanize(scope.assetClass)} › ${humanize(scope.l2)}`
      : humanize(scope.assetClass)
    : "";

  const filtered = React.useMemo(() => {
    if (!data?.positions) return [];
    const q = debouncedSearch.toLowerCase();
    let rows = q
      ? data.positions.filter(
          (p) =>
            p.ticker.toLowerCase().includes(q) ||
            p.account_name.toLowerCase().includes(q),
        )
      : data.positions;
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "contributing_value" || sortKey === "share_of_portfolio") {
        cmp = a[sortKey] - b[sortKey];
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return rows;
  }, [data?.positions, debouncedSearch, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "account_name" ? "asc" : "desc");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-hidden p-0 sm:max-w-none lg:max-w-2xl"
        showCloseButton={false}
      >
        <PanelHeader
          title={title}
          scope={scope}
          data={data}
          onClose={onClose}
        />

        {/* Search */}
        <div className="px-6 pb-3 pt-0">
          <Input
            placeholder="Search ticker or account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6">
          {isLoading && <LoadingSkeleton />}
          {error && <ErrorState onRetry={() => mutate()} />}
          {!isLoading && !error && data && (
            <HoldingsTable
              rows={filtered}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              isFiltered={debouncedSearch.length > 0}
              total={filtered.length}
              isPartialPresent={filtered.some((p) => p.is_partial)}
            />
          )}
        </div>

        {/* Footer */}
        {data && (
          <PanelFooter
            sourceCounts={data.source_counts}
            unclassifiedCount={data.unclassified_count}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function PanelHeader({
  title,
  scope,
  data,
  onClose,
}: {
  title: string;
  scope: PanelScope | null;
  data: PositionContributionsResponse | undefined;
  onClose: () => void;
}) {
  const value = data?.total ?? 0;
  const shareOfPortfolio = data
    ? data.positions.reduce((acc, p) => acc + p.share_of_portfolio, 0)
    : null;

  const showDrift =
    !scope?.l2 && scope?.targetPct != null && scope?.driftPct != null;

  return (
    <SheetHeader className="border-b px-6 pb-4 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <SheetTitle className="text-base font-semibold leading-none">
            {title}
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm tabular-nums text-muted-foreground">
            {data ? (
              <>
                {formatUsd(value)} ·{" "}
                {shareOfPortfolio != null
                  ? formatPct(shareOfPortfolio, { digits: 1 })
                  : "—"}{" "}
                of portfolio
                {showDrift && (
                  <> · target {Math.round(scope!.targetPct!)}% · {formatDrift(scope!.driftPct!)}</>
                )}
              </>
            ) : (
              <span className="animate-pulse">Loading…</span>
            )}
          </SheetDescription>
          {scope?.isSimulating && (
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              Showing live holdings — simulation does not affect positions.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close holdings panel"
          className="mt-0.5 shrink-0 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ✕
        </button>
      </div>
    </SheetHeader>
  );
}

// ---------------------------------------------------------------------------
// Holdings table
// ---------------------------------------------------------------------------

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active) return <span className="ml-0.5 text-muted-foreground/30">↕</span>;
  return dir === "desc" ? (
    <ChevronDownIcon className="ml-0.5 inline h-3 w-3 text-muted-foreground" />
  ) : (
    <ChevronUpIcon className="ml-0.5 inline h-3 w-3 text-muted-foreground" />
  );
}

function HoldingsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  isFiltered,
  total,
  isPartialPresent,
}: {
  rows: PositionContribution[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  isFiltered: boolean;
  total: number;
  isPartialPresent: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {isFiltered
          ? "No holdings match your search."
          : "No direct holdings in this slice."}
      </div>
    );
  }

  const thClass =
    "py-2 text-label text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors";

  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-x-3 border-b px-1 pb-1">
        <button
          type="button"
          className={cn(thClass, "text-left")}
          onClick={() => onSort("ticker")}
        >
          Ticker
          <SortIcon active={sortKey === "ticker"} dir={sortDir} />
        </button>
        <button
          type="button"
          className={cn(thClass, "text-left")}
          onClick={() => onSort("account_name")}
        >
          Account
          <SortIcon active={sortKey === "account_name"} dir={sortDir} />
        </button>
        <button
          type="button"
          className={cn(thClass, "text-right w-20")}
          onClick={() => onSort("contributing_value")}
        >
          Value
          <SortIcon active={sortKey === "contributing_value"} dir={sortDir} />
        </button>
        <span className={cn(thClass, "text-right w-16 cursor-default")}>
          % Slice
        </span>
        <button
          type="button"
          className={cn(thClass, "text-right w-16")}
          onClick={() => onSort("share_of_portfolio")}
        >
          % Port.
          <SortIcon active={sortKey === "share_of_portfolio"} dir={sortDir} />
        </button>
      </div>

      {/* Rows */}
      <div className="divide-y">
        {rows.map((p) => (
          <div
            key={`${p.account_id}-${p.ticker}`}
            className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-x-3 px-1 py-2 text-sm"
          >
            <span className="font-mono text-xs font-medium text-foreground">
              {p.ticker}
            </span>
            <span className="truncate text-muted-foreground">
              {p.account_name}
            </span>
            <span className="w-20 text-right tabular-nums text-foreground">
              {formatUsd(p.contributing_value, { compact: true })}
              {p.is_partial && (
                <span className="ml-0.5 text-[10px] text-muted-foreground">*</span>
              )}
            </span>
            <span className="w-16 text-right tabular-nums text-muted-foreground">
              {formatPct(p.share_of_slice, { digits: 1 })}
            </span>
            <span className="w-16 text-right tabular-nums text-muted-foreground">
              {formatPct(p.share_of_portfolio, { digits: 1 })}
            </span>
          </div>
        ))}
      </div>

      {isPartialPresent && (
        <p className="mt-3 text-xs text-muted-foreground/70">
          * partial — only the portion of this fund attributed to this slice.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load holdings.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function PanelFooter({
  sourceCounts,
  unclassifiedCount,
}: {
  sourceCounts: Record<string, number>;
  unclassifiedCount: number;
}) {
  const parts = Object.entries(sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([src, count]) => `${count} ${src}`);

  return (
    <div className="border-t px-6 py-3 text-xs text-muted-foreground">
      {parts.length > 0 && (
        <span>Sources: {parts.join(" · ")}</span>
      )}
      {unclassifiedCount > 0 && (
        <Link
          href="/health"
          className="ml-3 underline underline-offset-2 hover:text-foreground"
        >
          Review {unclassifiedCount} unclassified →
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDrift(pp: number): string {
  const sign = pp > 0 ? "+" : pp < 0 ? "−" : "";
  return `${sign}${Math.abs(pp).toFixed(1)}pp`;
}
