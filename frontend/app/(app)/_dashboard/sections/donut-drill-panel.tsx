"use client";

import * as React from "react";
import Link from "next/link";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/app/components/ui/sheet";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { BucketEditor, normalizeBucketsForTaxonomy } from "@/app/components/bucket-editor";
import {
  api,
  type ClassificationBucketPayload,
  type ClassificationRow,
  type PositionContribution,
  type PositionContributionsResponse,
  type Taxonomy,
} from "@/app/lib/api";
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
  // Tuple key keeps assetClass/l2 as typed values so SWR caches per scope
  // without any URL round-tripping. api.allocationPositions handles encoding.
  const swrKey = open && scope
    ? (["allocation-positions", scope.assetClass, scope.l2 ?? null] as const)
    : null;

  const { data, error, isLoading, mutate: revalidatePositions } = useSWR<PositionContributionsResponse>(
    swrKey,
    ([, assetClass, l2]: readonly ["allocation-positions", string, string | null]) =>
      api.allocationPositions(assetClass, l2 ?? undefined),
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

  const [editTicker, setEditTicker] = React.useState<string | null>(null);
  const [editBuckets, setEditBuckets] = React.useState<ClassificationBucketPayload[]>([]);
  const editInitRef = React.useRef<string | null>(null);

  const { data: taxonomy } = useSWR<Taxonomy>(
    editTicker ? "/api/classifications/taxonomy" : null,
    api.taxonomy,
    { revalidateOnFocus: false },
  );
  const { data: classificationRows = [] } = useSWR<ClassificationRow[]>(
    editTicker ? "/api/classifications" : null,
    api.classifications,
    { revalidateOnFocus: false },
  );

  React.useEffect(() => {
    if (!editTicker) {
      editInitRef.current = null;
      return;
    }
    if (!classificationRows.length || !taxonomy) return;
    if (editInitRef.current === editTicker) return;
    const row = classificationRows.find((c) => c.ticker === editTicker);
    if (row) {
      setEditBuckets(
        normalizeBucketsForTaxonomy(row.buckets.map((b) => ({ ...b })), taxonomy),
      );
      editInitRef.current = editTicker;
    } else {
      editInitRef.current = editTicker;
      setEditBuckets(
        normalizeBucketsForTaxonomy(
          [{ asset_class: "Stocks", sub_class: "US Stocks", weight: 1 }],
          taxonomy,
        ),
      );
    }
  }, [editTicker, classificationRows, taxonomy]);

  const [clsSaving, setClsSaving] = React.useState(false);

  async function saveClassificationEdit() {
    if (!editTicker || !taxonomy) return;
    const s = editBuckets.reduce((acc, b) => acc + b.weight, 0);
    if (Math.abs(s - 1) > 0.02) return;
    setClsSaving(true);
    try {
      await api.patchClassification(editTicker, { buckets: editBuckets });
      await globalMutate("/api/classifications");
      await globalMutate("/api/allocation");
      if (swrKey) await revalidatePositions();
      setEditTicker(null);
    } finally {
      setClsSaving(false);
    }
  }

  function openClassificationEditor(ticker: string) {
    editInitRef.current = null;
    setEditTicker(ticker);
  }

  const title = scope
    ?     scope.l2
      ? `${scope.assetClass} → ${scope.l2}`
      : scope.assetClass
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
    <>
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
          {isLoading && <LoadingBar />}
          {error && <ErrorState onRetry={() => revalidatePositions()} />}
          {!isLoading && !error && data && (
            <HoldingsTable
              rows={filtered}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              isFiltered={debouncedSearch.length > 0}
              total={filtered.length}
              isPartialPresent={filtered.some((p) => p.is_partial)}
              onEditTicker={openClassificationEditor}
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

    <Dialog open={editTicker !== null} onOpenChange={(o) => !o && setEditTicker(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-h3">
            Edit classification ·{" "}
            <span className="font-mono">{editTicker}</span>
          </DialogTitle>
          <DialogDescription className="text-body-sm">
            Weights must sum to 100% (±2%). Saves apply portfolio-wide for this ticker.
          </DialogDescription>
        </DialogHeader>
        {taxonomy && (
          <BucketEditor
            buckets={editBuckets}
            taxonomy={taxonomy}
            disabled={clsSaving}
            onChange={setEditBuckets}
          />
        )}
        <DialogFooter className="gap-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={clsSaving}
            onClick={() => setEditTicker(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={clsSaving || !taxonomy}
            onClick={() => void saveClassificationEdit()}
          >
            {clsSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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
              <span className="inline-block h-0.5 w-16 rounded-full bg-border" aria-hidden />
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

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return (
    <span className="ml-1 text-[10px] text-muted-foreground" aria-hidden>
      {dir === "desc" ? "▼" : "▲"}
    </span>
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
  onEditTicker,
}: {
  rows: PositionContribution[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  isFiltered: boolean;
  total: number;
  isPartialPresent: boolean;
  onEditTicker: (ticker: string) => void;
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

  // Label style: Inter 500, 13px/18px — brand typography scale
  const thClass =
    "py-2 text-[13px] leading-[18px] font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors";

  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-x-3 border-b px-1 pb-1">
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
        <span className={cn(thClass, "w-14 text-right text-[11px] cursor-default")}>
          Class
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y">
        {rows.map((p) => (
          <div
            key={`${p.account_id}-${p.ticker}`}
            className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-x-3 px-1 py-2 text-[14px] leading-[20px]"
          >
            <span className="font-mono text-[13px] leading-[18px] font-medium text-foreground">
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
            <span className="w-14 text-right">
              <button
                type="button"
                className="text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
                onClick={() => onEditTicker(p.ticker)}
              >
                Edit
              </button>
            </span>
          </div>
        ))}
      </div>

      {isPartialPresent && (
        <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground/70">
          * partial — only the portion of this fund attributed to this slice.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------

function LoadingBar() {
  return (
    <div className="h-0.5 w-full overflow-hidden bg-transparent" role="status" aria-label="Loading holdings">
      <div className="h-full w-1/2 bg-border motion-safe:animate-[slide_1.2s_ease-in-out_infinite]" />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-destructive">
        ✕ Couldn&apos;t load holdings.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-sm text-foreground underline underline-offset-[0.15em] hover:decoration-2"
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
          href="/classifications"
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
