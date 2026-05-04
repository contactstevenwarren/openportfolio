"use client";

// Review step — inline diff table with classification, replace toggle, and
// removal confirmation. Rendered by UpdateForm when extraction succeeds.
// Parent triggers commit by calling the imperative handle's triggerCommit().

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import useSWR, { mutate } from "swr";
import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { cn } from "@/app/lib/utils";
import type {
  Account,
  ExtractionResult,
  Position,
  ClassificationSuggestItem,
} from "@/app/lib/api";
import { api } from "@/app/lib/api";
import { ASSET_CLASS_ORDER, ASSET_CLASS_LABEL } from "./mocks";
import type { UpdateMode, ReviewTotals } from "./update-form";

// ── Types ──────────────────────────────────────────────────────────────────────

type RowStatus = "new" | "changed" | "removed" | "unchanged";
type ClassSource = "yaml_user" | "llm" | "none";

type ReviewRow = {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number | null;
  market_value: number | null;
  confidence: number;
  source_span: string;
  validation_errors: string[];
  include: boolean;
  status: RowStatus;
  asset_class: string | null;
  sub_class: string | null;
  sector: string | null;
  region: string | null;
  class_source: ClassSource;
  showAdvanced: boolean;
};

export type ReviewStepHandle = {
  triggerCommit: () => void;
};

type ReviewStepProps = {
  account: Account;
  extractionResult: ExtractionResult;
  source: UpdateMode;
  onCommitSuccess: () => void;
  onBack: () => void;
  onCommitDisabledChange: (disabled: boolean) => void;
  onTotalsChange?: (totals: ReviewTotals) => void;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const REGION_OPTIONS = [
  { value: "", label: "—" },
  { value: "us", label: "US" },
  { value: "intl_developed", label: "Intl developed" },
  { value: "intl_emerging", label: "Intl emerging" },
  { value: "global", label: "Global" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatUsdCompact(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const neg = n < 0 ? "\u2212" : "";
  const decimals = abs >= 10_000 ? 0 : 2;
  return neg + new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(abs);
}

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ── ReviewStep (forwardRef) ────────────────────────────────────────────────────

export const ReviewStep = forwardRef<ReviewStepHandle, ReviewStepProps>(
  function ReviewStep(
    { account, extractionResult, source, onCommitSuccess, onBack, onCommitDisabledChange, onTotalsChange },
    ref
  ) {
    const [rows, setRows] = useState<ReviewRow[]>([]);
    const [replaceAccount, setReplaceAccount] = useState(true);
    const suggestFiredRef = useRef(false);
    const [committing, setCommitting] = useState(false);
    const [commitError, setCommitError] = useState<string | null>(null);
    const [showRemoveDialog, setShowRemoveDialog] = useState(false);
    const [pendingReplace, setPendingReplace] = useState(true);

    // Fetch current positions for diff
    const { data: currentPositions, error: positionsError } = useSWR(
      `/api/positions?account_id=${account.id}`,
      () => api.positions(account.id),
      { revalidateOnFocus: false }
    );

    // Fetch accounts list for mismatched-account warning
    const { data: allAccounts } = useSWR("/api/accounts", api.accounts, {
      revalidateOnFocus: false,
    });

    // Build diff rows once currentPositions arrives
    useEffect(() => {
      if (currentPositions === undefined) return;
      if (rows.length > 0) return;

      const currentByTicker = new Map<string, Position>();
      for (const p of currentPositions) {
        currentByTicker.set(p.ticker.toUpperCase(), p);
      }

      const extracted: ReviewRow[] = extractionResult.positions.map((p) => {
        const existing = currentByTicker.get(p.ticker.toUpperCase());
        let status: RowStatus = "new";
        if (existing) {
          const changed =
            existing.shares !== p.shares ||
            existing.market_value !== p.market_value ||
            existing.cost_basis !== p.cost_basis;
          status = changed ? "changed" : "unchanged";
        }
        return {
          id: crypto.randomUUID(),
          ticker: p.ticker,
          shares: p.shares,
          cost_basis: p.cost_basis,
          market_value: p.market_value,
          confidence: p.confidence,
          source_span: p.source_span,
          validation_errors: p.validation_errors,
          include: true,
          status,
          asset_class: null,
          sub_class: null,
          sector: null,
          region: null,
          class_source: "none",
          showAdvanced: false,
        };
      });

      const extractedTickers = new Set(
        extractionResult.positions.map((p) => p.ticker.toUpperCase())
      );
      const removedRows: ReviewRow[] = currentPositions
        .filter((p) => !extractedTickers.has(p.ticker.toUpperCase()))
        .map((p) => ({
          id: crypto.randomUUID(),
          ticker: p.ticker,
          shares: p.shares,
          cost_basis: p.cost_basis,
          market_value: p.market_value,
          confidence: 1.0,
          source_span: "",
          validation_errors: [],
          include: true,
          status: "removed" as RowStatus,
          asset_class: null,
          sub_class: null,
          sector: null,
          region: null,
          class_source: "none" as ClassSource,
          showAdvanced: false,
        }));

      setRows([
        ...extracted.sort((a, b) => a.confidence - b.confidence),
        ...removedRows,
      ]);
    }, [currentPositions, extractionResult, rows.length]);

    // Batch-suggest classifications once rows are built
    useEffect(() => {
      if (suggestFiredRef.current || rows.length === 0) return;
      suggestFiredRef.current = true;
      const tickers = rows
        .filter((r) => r.status !== "removed" && r.asset_class === null)
        .map((r) => r.ticker);
      if (tickers.length === 0) return;

      void api
        .suggestClassifications(tickers)
        .then((suggestions: ClassificationSuggestItem[]) => {
          const byTicker = new Map<string, ClassificationSuggestItem>();
          for (const s of suggestions) byTicker.set(s.ticker.toUpperCase(), s);
          setRows((prev) =>
            prev.map((r) => {
              const s = byTicker.get(r.ticker.toUpperCase());
              if (!s || r.asset_class !== null) return r;
              const classSource: ClassSource =
                s.source === "existing" ? "yaml_user" : s.source === "llm" ? "llm" : "none";
              return {
                ...r,
                asset_class: s.asset_class ?? null,
                sub_class: s.sub_class ?? null,
                sector: s.sector ?? null,
                region: s.region ?? null,
                class_source: classSource,
              };
            })
          );
        });
    }, [rows]);

    // Notify parent of commit-disabled state
    const commitDisabled = committing || rows.length === 0;
    useEffect(() => {
      onCommitDisabledChange(commitDisabled);
    }, [commitDisabled, onCommitDisabledChange]);

    // Notify parent of running totals (for footer display)
    useEffect(() => {
      if (rows.length === 0) return;
      const visible = replaceAccount ? rows : rows.filter((r) => r.status !== "removed");
      const afterTotal = visible
        .filter((r) => r.include && r.status !== "removed")
        .reduce((acc, r) => acc + (r.market_value ?? 0), 0);
      const beforeTotal = account.balance;
      onTotalsChange?.({ before: beforeTotal, after: afterTotal, delta: afterTotal - beforeTotal });
    }, [rows, replaceAccount, account.balance, onTotalsChange]);

    // Clear totals on unmount
    useEffect(() => {
      return () => { onTotalsChange?.(null); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function updateRow<K extends keyof ReviewRow>(id: string, field: K, value: ReviewRow[K]) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    }

    async function handleTickerBlur(rowId: string, newTicker: string) {
      const trimmed = newTicker.trim();
      if (!trimmed) return;
      const currentRow = rows.find((r) => r.id === rowId);
      if (!currentRow || currentRow.ticker === trimmed) return;

      try {
        const suggestions = await api.suggestClassifications([trimmed]);
        const sug = suggestions.find(s => s.ticker.toUpperCase() === trimmed.toUpperCase());
        if (!sug || sug.source === "none") {
          setRows((prev) =>
            prev.map((r) =>
              r.id === rowId ? { ...r, asset_class: null, class_source: "none" } : r
            )
          );
        } else {
          setRows((prev) =>
            prev.map((r) =>
              r.id === rowId
                ? {
                    ...r,
                    asset_class: sug.asset_class ?? null,
                    sub_class: sug.sub_class ?? null,
                    sector: sug.sector ?? null,
                    region: sug.region ?? null,
                    class_source: sug.source === "existing" ? "yaml_user" : "llm",
                  }
                : r
            )
          );
        }
      } catch {
        // silent — user can still manually pick a class
      }
    }

    async function doCommit(useReplace: boolean) {
      setCommitting(true);
      setCommitError(null);
      try {
        const positions = rows
          .filter((r) => r.include && r.status !== "removed")
          .map((r) => ({
            ticker: r.ticker,
            shares: r.shares,
            cost_basis: r.cost_basis,
            market_value: r.market_value,
            confidence: r.confidence,
            source_span: r.source_span,
            classification: r.asset_class
              ? {
                  asset_class: r.asset_class,
                  sub_class: r.sub_class ?? null,
                  sector: r.sector ?? null,
                  region: r.region ?? null,
                  auto_suffix: false,
                }
              : undefined,
          }));
        await api.commit({
          account_id: account.id,
          source: source === "pdf" ? "pdf" : "paste",
          replace_account: useReplace,
          positions,
        });
        await mutate("/api/accounts");
        await mutate(`/api/positions?account_id=${account.id}`);
        await mutate("/api/classifications");
        onCommitSuccess();
      } catch (e) {
        setCommitError(e instanceof Error ? e.message : "Commit failed.");
      } finally {
        setCommitting(false);
      }
    }

    function handleCommitRequest() {
      const removedCount = rows.filter((r) => r.include && r.status === "removed").length;
      if (replaceAccount && removedCount > 0) {
        setPendingReplace(replaceAccount);
        setShowRemoveDialog(true);
      } else {
        void doCommit(replaceAccount);
      }
    }

    // Expose triggerCommit to parent via ref
    useImperativeHandle(ref, () => ({
      triggerCommit: handleCommitRequest,
    }));

    // Derived values
    const visibleRows = replaceAccount ? rows : rows.filter((r) => r.status !== "removed");
    const unclassifiedCount = visibleRows.filter(
      (r) => r.include && r.status !== "removed" && r.asset_class === null
    ).length;

    const matchedAccountId = extractionResult.matched_account_id;
    const matchedAccount =
      matchedAccountId != null && matchedAccountId !== account.id && allAccounts
        ? allAccounts.find((a) => a.id === matchedAccountId)
        : null;

    const removedRows = rows.filter((r) => r.include && r.status === "removed");

    if (positionsError) {
      return (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-body-sm text-destructive">Failed to load current positions.</p>
          <Button size="sm" variant="outline" onClick={() => mutate(`/api/positions?account_id=${account.id}`)}>
            Retry
          </Button>
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="flex items-center justify-center py-8 text-body-sm text-muted-foreground">
          Loading…
        </div>
      );
    }

    // ── Row Details Popover (shared by table + cards) ─────────────────────────

    function RowDetailsPopover({ row }: { row: ReviewRow }) {
      const noteworthy =
        row.validation_errors.length > 0 ||
        row.class_source === "llm" ||
        (row.confidence < 0.7 && row.status !== "removed");

      const dotColor = row.validation_errors.length > 0 ? "bg-destructive" : "bg-warning";

      const classSourceLabel =
        row.class_source === "yaml_user"
          ? "From your saved classifications"
          : row.class_source === "llm"
          ? "Suggested by LLM — please verify"
          : "No suggestion yet — pick a class";

      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
              aria-label="Row details"
            >
              <InfoIcon className="size-3.5" />
              {noteworthy && (
                <span className={cn("absolute top-0.5 right-0.5 size-1.5 rounded-full", dotColor)} />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 text-xs space-y-2">
            {row.status !== "removed" && (
              <div>
                <span className="text-muted-foreground">Confidence: </span>
                <span className={cn("tabular-nums font-medium", row.confidence < 0.7 ? "text-warning" : "")}>
                  {formatPct(row.confidence)}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Classification: </span>
              <span className={cn(row.class_source === "llm" ? "text-warning" : "")}>{classSourceLabel}</span>
            </div>
            {row.source_span && (
              <div>
                <p className="text-muted-foreground mb-0.5">Extracted from:</p>
                <p className="font-mono whitespace-pre-wrap break-all text-foreground">{row.source_span}</p>
              </div>
            )}
            {row.validation_errors.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-0.5">Errors:</p>
                <ul className="list-disc pl-3 space-y-0.5 text-destructive">
                  {row.validation_errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </PopoverContent>
        </Popover>
      );
    }

    // ── Asset class + Advanced (shared by table + cards) ──────────────────────

    function AssetClassField({ row }: { row: ReviewRow }) {
      return (
        <div className="flex flex-col gap-1">
          <select
            className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-body-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={row.asset_class ?? ""}
            onChange={(e) => updateRow(row.id, "asset_class", e.target.value || null)}
          >
            <option value="">Unclassified</option>
            {ASSET_CLASS_ORDER.map((ac) => (
              <option key={ac} value={ac}>{ASSET_CLASS_LABEL[ac]}</option>
            ))}
          </select>
          <button
            type="button"
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => updateRow(row.id, "showAdvanced", !row.showAdvanced)}
          >
            {row.showAdvanced ? "Hide advanced" : "Advanced"}
          </button>
          {row.showAdvanced && (
            <div className="flex flex-col gap-1 pl-1 border-l-2 border-border">
              <input
                className="rounded border border-input bg-background px-1.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Sub-class"
                value={row.sub_class ?? ""}
                onChange={(e) => updateRow(row.id, "sub_class", e.target.value || null)}
              />
              <input
                className="rounded border border-input bg-background px-1.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Sector"
                value={row.sector ?? ""}
                onChange={(e) => updateRow(row.id, "sector", e.target.value || null)}
              />
              <select
                className="rounded border border-input bg-background px-1.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={row.region ?? ""}
                onChange={(e) => updateRow(row.id, "region", e.target.value || null)}
              >
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      );
    }

    // ── Row tint ──────────────────────────────────────────────────────────────

    function rowBg(row: ReviewRow): string {
      if (row.validation_errors.length > 0) return "bg-destructive/10";
      if (row.class_source === "llm") return "bg-warning/10";
      if (row.class_source === "none" && row.asset_class === null) return "bg-destructive/10";
      return "";
    }

    // ── Mobile status pill ────────────────────────────────────────────────────

    function StatusPill({ status }: { status: RowStatus }) {
      const label = status === "new" ? "NEW"
        : status === "changed" ? "CHANGED"
        : status === "unchanged" ? "UNCHANGED"
        : "REMOVED";
      const cls = status === "new" ? "bg-green-500/10 text-green-600"
        : status === "changed" ? "bg-warning/10 text-warning"
        : status === "unchanged" ? "bg-muted text-muted-foreground"
        : "bg-destructive/10 text-destructive";
      return (
        <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none", cls)}>
          {label}
        </span>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="self-start -ml-2"
          onClick={onBack}
          disabled={committing}
        >
          <ArrowLeftIcon className="size-4" /> Back
        </Button>

        {/* Mismatched-account warning */}
        {matchedAccount && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-body-sm text-warning">
            This statement looks like it&apos;s for <strong>{matchedAccount.label}</strong>. Still
            importing into <strong>{account.label}</strong>?
          </div>
        )}

        {commitError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
            {commitError}
          </p>
        )}

        {/* Replace toggle */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceAccount}
              onChange={(e) => setReplaceAccount(e.target.checked)}
              className="size-4 rounded"
            />
            <span className="text-body-sm font-medium">Replace all positions in this account</span>
          </label>
          <span className="text-body-sm text-muted-foreground">
            {replaceAccount
              ? "Positions not in this import will be removed."
              : "Add/update only — keep positions not in this import."}
          </span>
        </div>

        {/* Unclassified info */}
        {unclassifiedCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-body-sm text-muted-foreground">
            <InfoIcon className="size-4 shrink-0" />
            {unclassifiedCount} position{unclassifiedCount === 1 ? "" : "s"} will commit without a
            class and appear unclassified.
          </div>
        )}

        {/* ── Desktop table (lg and up) ──────────────────────────────────────── */}
        <div className="hidden lg:block overflow-x-auto rounded-md border border-border">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="px-2 py-1.5 w-8" />
                <th className="px-2 py-1.5 w-8 text-center">St.</th>
                <th className="px-2 py-1.5">Ticker</th>
                <th className="px-2 py-1.5">Asset class</th>
                <th className="px-2 py-1.5 text-right">Shares</th>
                <th className="px-2 py-1.5 text-right">Cost basis</th>
                <th className="px-2 py-1.5 text-right">Mkt value</th>
                <th className="px-2 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    !row.include && "opacity-50",
                    row.status === "removed" && "opacity-60",
                    rowBg(row)
                  )}
                >
                  {/* Include */}
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) => updateRow(row.id, "include", e.target.checked)}
                      className="size-4 rounded"
                    />
                  </td>

                  {/* Status symbol */}
                  <td className="px-2 py-1.5 text-center font-semibold">
                    {row.status === "new" && <span className="text-green-600">+</span>}
                    {row.status === "changed" && <span className="text-warning">△</span>}
                    {row.status === "unchanged" && <span className="text-muted-foreground">=</span>}
                    {row.status === "removed" && <span className="text-destructive">−</span>}
                  </td>

                  {/* Ticker */}
                  <td className="px-2 py-1">
                    <input
                      className="w-20 rounded border border-transparent px-1 py-0.5 text-body-sm bg-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={row.ticker}
                      onChange={(e) => updateRow(row.id, "ticker", e.target.value)}
                      onBlur={(e) => void handleTickerBlur(row.id, e.target.value)}
                      disabled={row.status === "removed"}
                    />
                  </td>

                  {/* Asset class + Advanced */}
                  <td className="px-2 py-1 min-w-[160px]">
                    <AssetClassField row={row} />
                  </td>

                  {/* Shares */}
                  <td className="px-2 py-1 text-right">
                    <input
                      className="w-20 rounded border border-transparent px-1 py-0.5 text-right text-body-sm tabular-nums bg-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      type="number"
                      min={0}
                      step="any"
                      value={row.shares}
                      onChange={(e) => updateRow(row.id, "shares", Number(e.target.value))}
                      disabled={row.status === "removed"}
                    />
                  </td>

                  {/* Cost basis */}
                  <td className="px-2 py-1 text-right">
                    <input
                      className="w-24 rounded border border-transparent px-1 py-0.5 text-right text-body-sm tabular-nums bg-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      type="number"
                      min={0}
                      step="any"
                      value={row.cost_basis ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateRow(row.id, "cost_basis", e.target.value !== "" ? Number(e.target.value) : null)
                      }
                      disabled={row.status === "removed"}
                    />
                  </td>

                  {/* Market value */}
                  <td className="px-2 py-1 text-right">
                    <input
                      className="w-24 rounded border border-transparent px-1 py-0.5 text-right text-body-sm tabular-nums bg-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      type="number"
                      min={0}
                      step="any"
                      value={row.market_value ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateRow(row.id, "market_value", e.target.value !== "" ? Number(e.target.value) : null)
                      }
                      disabled={row.status === "removed"}
                    />
                  </td>

                  {/* Info popover */}
                  <td className="px-2 py-1 text-center">
                    <RowDetailsPopover row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Mobile / tablet cards (below lg) ──────────────────────────────── */}
        <div className="lg:hidden flex flex-col gap-2">
          {visibleRows.map((row) => {
            const isCompact = row.status === "unchanged" || row.status === "removed";
            return (
              <div
                key={row.id}
                className={cn(
                  "rounded-md border border-border p-3",
                  !row.include && "opacity-50",
                  rowBg(row)
                )}
              >
                {/* Top row: include, status pill, ticker, info */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) => updateRow(row.id, "include", e.target.checked)}
                    className="size-4 rounded shrink-0"
                  />
                  <StatusPill status={row.status} />
                  {isCompact ? (
                    <span className={cn("flex-1 text-body-sm font-medium tabular-nums", row.status === "removed" && "line-through text-muted-foreground")}>
                      {row.ticker} · {formatUsdCompact(row.market_value)}
                    </span>
                  ) : (
                    <input
                      className="flex-1 rounded border border-transparent px-1 py-0.5 text-body-sm font-medium bg-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={row.ticker}
                      onChange={(e) => updateRow(row.id, "ticker", e.target.value)}
                      onBlur={(e) => void handleTickerBlur(row.id, e.target.value)}
                    />
                  )}
                  <RowDetailsPopover row={row} />
                </div>

                {/* Full card body for new/changed rows */}
                {!isCompact && (
                  <div className="mt-2 flex flex-col gap-2 pl-6">
                    {/* Asset class */}
                    <AssetClassField row={row} />
                    {/* Shares + Cost */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Shares</label>
                        <input
                          className="rounded border border-input bg-background px-1.5 py-0.5 text-body-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          type="number"
                          min={0}
                          step="any"
                          value={row.shares}
                          onChange={(e) => updateRow(row.id, "shares", Number(e.target.value))}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Cost basis</label>
                        <input
                          className="rounded border border-input bg-background px-1.5 py-0.5 text-body-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          type="number"
                          min={0}
                          step="any"
                          value={row.cost_basis ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            updateRow(row.id, "cost_basis", e.target.value !== "" ? Number(e.target.value) : null)
                          }
                        />
                      </div>
                    </div>
                    {/* Value */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Market value</label>
                      <input
                        className="rounded border border-input bg-background px-1.5 py-0.5 text-body-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        type="number"
                        min={0}
                        step="any"
                        value={row.market_value ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          updateRow(row.id, "market_value", e.target.value !== "" ? Number(e.target.value) : null)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* R1 removal confirmation */}
        <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {removedRows.length} position{removedRows.length === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This import will permanently remove {removedRows.length} position
                {removedRows.length === 1 ? "" : "s"} from {account.label}. Removed:{" "}
                {removedRows.map((r) => r.ticker).join(", ")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setReplaceAccount(false);
                  setShowRemoveDialog(false);
                  void doCommit(false);
                }}
              >
                Keep them
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowRemoveDialog(false);
                  void doCommit(pendingReplace);
                }}
              >
                Proceed
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
);
