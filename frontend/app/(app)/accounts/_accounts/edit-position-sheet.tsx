"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { mutate } from "swr";
import { Button } from "@/app/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import {
  BucketEditor,
  normalizeBucketsForTaxonomy,
} from "@/app/components/bucket-editor";
import type {
  Account,
  AssetClass,
  ClassificationBucketPayload,
  ClassificationRow,
  Position,
} from "@/app/lib/api";
import { api } from "@/app/lib/api";
import { formatPct } from "@/app/lib/format";
import { ASSET_CLASS_LABEL } from "./mocks";

type EditPositionSheetProps = {
  position: Position;
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function bucketSum(buckets: ClassificationBucketPayload[]): number {
  return buckets.reduce((s, b) => s + (Number.isFinite(b.weight) ? b.weight : 0), 0);
}

function ClassificationSectionLoadingBar() {
  return (
    <div
      className="h-0.5 w-full overflow-hidden bg-transparent rounded-full"
      role="status"
      aria-label="Loading classification"
    >
      <div className="h-full w-1/2 bg-border motion-safe:animate-[slide_1.2s_ease-in-out_infinite]" />
    </div>
  );
}

export function EditPositionSheet({
  position,
  account,
  open,
  onOpenChange,
}: EditPositionSheetProps) {
  const positionsKey = `/api/positions?account_id=${position.account_id}`;

  const [shares, setShares] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [asOf, setAsOf] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [classificationDialogOpen, setClassificationDialogOpen] = useState(false);
  const [editBuckets, setEditBuckets] = useState<ClassificationBucketPayload[]>([]);
  const [clsSaving, setClsSaving] = useState(false);
  const [clsError, setClsError] = useState<string | null>(null);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const clsInitTickerRef = useRef<string | null>(null);

  const { data: classificationRows, isLoading: classificationsLoading } = useSWR(
    open ? "/api/classifications" : null,
    () => api.classifications(),
    { revalidateOnFocus: false },
  );

  const { data: taxonomy } = useSWR(
    open && classificationDialogOpen ? "/api/classifications/taxonomy" : null,
    () => api.taxonomy(),
    { revalidateOnFocus: false },
  );

  const { data: allPositions = [], isLoading: allPositionsLoading } = useSWR(
    open ? "/api/positions" : null,
    () => api.positions(),
    { revalidateOnFocus: false },
  );

  const mergedClassificationRow = useMemo(() => {
    if (!classificationRows?.length) return undefined;
    const t = position.ticker;
    return (
      classificationRows.find((c) => c.ticker === t) ??
      classificationRows.find((c) => c.ticker.toUpperCase() === t.toUpperCase())
    );
  }, [classificationRows, position.ticker]);

  const tickerAccountCount = useMemo(() => {
    const u = position.ticker.toUpperCase();
    let n = 0;
    for (const p of allPositions) {
      if (p.ticker.toUpperCase() === u) n += 1;
    }
    return n;
  }, [allPositions, position.ticker]);

  useEffect(() => {
    if (!open) return;
    setShares(String(position.shares));
    setCostBasis(position.cost_basis != null ? String(position.cost_basis) : "");
    setMarketValue(position.market_value != null ? String(position.market_value) : "");
    setAsOf(position.as_of ? position.as_of.slice(0, 10) : "");
    setSaveError(null);
  }, [open, position]);

  useEffect(() => {
    if (!open) {
      setClassificationDialogOpen(false);
      setClsError(null);
      clsInitTickerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!classificationDialogOpen) {
      clsInitTickerRef.current = null;
      setClsError(null);
      return;
    }
    if (!taxonomy || !classificationRows) return;
    const t = position.ticker;
    if (clsInitTickerRef.current === t) return;
    clsInitTickerRef.current = t;
    const row =
      classificationRows.find((c) => c.ticker === t) ??
      classificationRows.find((c) => c.ticker.toUpperCase() === t.toUpperCase());
    if (row?.buckets?.length) {
      setEditBuckets(
        normalizeBucketsForTaxonomy(row.buckets.map((b) => ({ ...b })), taxonomy),
      );
    } else {
      setEditBuckets(
        normalizeBucketsForTaxonomy(
          [{ asset_class: "Stocks", sub_class: "US Stocks", weight: 1 }],
          taxonomy,
        ),
      );
    }
  }, [classificationDialogOpen, taxonomy, classificationRows, position.ticker]);

  async function handleSave() {
    const sharesNum = Number(shares);
    if (!shares || isNaN(sharesNum) || sharesNum <= 0) {
      setSaveError("Shares must be greater than 0.");
      return;
    }
    const mvNum = marketValue !== "" ? Number(marketValue) : null;
    if (mvNum != null && (isNaN(mvNum) || mvNum < 0)) {
      setSaveError("Market value must be 0 or greater.");
      return;
    }
    const cbNum = costBasis !== "" ? Number(costBasis) : null;
    if (cbNum !== null && cbNum < 0) {
      setSaveError("Cost basis cannot be negative.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await api.patchPosition(position.id, {
        shares: sharesNum,
        cost_basis: cbNum,
        market_value: mvNum,
        as_of: asOf || undefined,
      });
      await mutate("/api/accounts");
      await mutate(positionsKey);
      await mutate("/api/positions");
      onOpenChange(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setSaveError(null);
    try {
      await api.deletePosition(position.id);
      await mutate("/api/accounts");
      await mutate(positionsKey);
      await mutate("/api/positions");
      onOpenChange(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete.");
      setDeleting(false);
    }
  }

  async function mutateAfterClassificationChange() {
    await mutate("/api/classifications");
    await mutate("/api/accounts");
    await mutate("/api/allocation");
    await mutate(positionsKey);
    await mutate("/api/positions");
  }

  async function saveClassificationEdit() {
    if (!taxonomy) return;
    const s = bucketSum(editBuckets);
    if (Math.abs(s - 1) > 0.02) {
      setClsError("Weights must sum to 100% (±2%).");
      return;
    }
    setClsSaving(true);
    setClsError(null);
    try {
      await api.patchClassification(position.ticker, { buckets: editBuckets });
      await mutateAfterClassificationChange();
      setClassificationDialogOpen(false);
    } catch (e) {
      setClsError(e instanceof Error ? e.message : "Failed to save classification.");
    } finally {
      setClsSaving(false);
    }
  }

  async function confirmRevertClassification() {
    setClsSaving(true);
    setClsError(null);
    try {
      await api.deleteClassification(position.ticker);
      await mutateAfterClassificationChange();
      setRevertDialogOpen(false);
      setClassificationDialogOpen(false);
    } catch (e) {
      setClsError(e instanceof Error ? e.message : "Could not revert classification.");
    } finally {
      setClsSaving(false);
    }
  }

  function openClassificationDialog() {
    clsInitTickerRef.current = null;
    setClsError(null);
    setClassificationDialogOpen(true);
  }

  function classificationSplitLine(row: ClassificationRow): string | null {
    if (row.buckets.length > 1) {
      return "This ticker is split across more than one asset type—typical for a fund or blended holding.";
    }
    return null;
  }

  function userClassificationNote(row: ClassificationRow): string | null {
    if (row.source !== "user") return null;
    return row.overrides_yaml
      ? "You customized this mapping; it replaces the default for this ticker."
      : "You set this classification.";
  }

  function classificationProvenanceShort(row: ClassificationRow): string {
    if (row.source === "user") return "Based on your saved mapping.";
    return "From the default OpenPortfolio mapping for this ticker.";
  }

  const classificationSectionLoading = classificationsLoading || allPositionsLoading;
  const hasBreakdownRows =
    mergedClassificationRow &&
    mergedClassificationRow.buckets &&
    mergedClassificationRow.buckets.length > 0;

  const classificationSplitExplain =
    mergedClassificationRow && hasBreakdownRows
      ? classificationSplitLine(mergedClassificationRow)
      : null;

  const userClassificationNoteText =
    mergedClassificationRow && hasBreakdownRows
      ? userClassificationNote(mergedClassificationRow)
      : null;

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <TooltipProvider delayDuration={0}>
      <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="overflow-y-auto flex flex-col">
          <SheetHeader>
            <SheetTitle>
              Edit position — {position.ticker} · {account.label}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 py-4 flex-1">
            {saveError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
                {saveError}
              </p>
            )}

            {/* Ticker — read-only */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium">Ticker</label>
              <p className="font-mono text-sm px-3 py-2 rounded-md bg-muted text-muted-foreground">
                {position.ticker}
              </p>
            </div>

            {/* Shares */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium" htmlFor={`ep-shares-${position.id}`}>
                Shares
              </label>
              <input
                id={`ep-shares-${position.id}`}
                type="number"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Cost basis */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium" htmlFor={`ep-cb-${position.id}`}>
                Cost basis
                <span className="text-muted-foreground font-normal"> (optional)</span>
              </label>
              <input
                id={`ep-cb-${position.id}`}
                type="number"
                min={0}
                step="any"
                value={costBasis}
                placeholder="—"
                onChange={(e) => setCostBasis(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Market value */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium" htmlFor={`ep-mv-${position.id}`}>
                Market value
                <span className="text-muted-foreground font-normal"> (optional)</span>
              </label>
              <input
                id={`ep-mv-${position.id}`}
                type="number"
                min={0}
                step="any"
                value={marketValue}
                placeholder="—"
                onChange={(e) => setMarketValue(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* As-of date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium" htmlFor={`ep-asof-${position.id}`}>
                As-of date
              </label>
              <input
                id={`ep-asof-${position.id}`}
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Classification */}
            <div className="border-t border-border pt-4 flex flex-col gap-3">
              <h3 className="text-h3 font-semibold text-foreground">Classification</h3>
              {classificationSectionLoading && <ClassificationSectionLoadingBar />}
              {!classificationSectionLoading && !hasBreakdownRows && (
                <p className="text-body-sm text-muted-foreground">
                  Unclassified — there is no mapping for this ticker yet. Set a classification so it
                  counts in your allocation.
                </p>
              )}
              {!classificationSectionLoading && hasBreakdownRows && mergedClassificationRow && (
                <>
                  {userClassificationNoteText && (
                    <p className="text-body-sm text-muted-foreground">{userClassificationNoteText}</p>
                  )}
                  {classificationSplitExplain && (
                    <p className="text-body-sm text-muted-foreground">{classificationSplitExplain}</p>
                  )}
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-body-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Asset class</th>
                          <th className="px-3 py-2 font-medium">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default border-b border-dotted border-muted-foreground/60">
                                  Sub-type
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-body-sm" side="top">
                                More specific category inside the asset class (for example US stocks
                                vs international).
                              </TooltipContent>
                            </Tooltip>
                          </th>
                          <th className="px-3 py-2 font-medium text-right">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mergedClassificationRow.buckets.map((b, i) => {
                          const acLabel =
                            ASSET_CLASS_LABEL[b.asset_class as AssetClass] ?? b.asset_class;
                          const pct = formatPct(b.weight, { digits: 1 });
                          const tip = `${pct} of how ${position.ticker} maps to your allocation (all rows sum to 100%). ${classificationProvenanceShort(mergedClassificationRow)}`;
                          return (
                            <tr
                              key={`${b.asset_class}-${b.sub_class ?? "none"}-${i}`}
                              className="border-b border-border/60 last:border-0"
                            >
                              <td className="px-3 py-2 align-top">{acLabel}</td>
                              <td className="px-3 py-2 align-top font-mono text-mono-sm text-muted-foreground">
                                {b.sub_class ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-mono-sm tabular-nums">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="cursor-default border-b border-dotted border-muted-foreground/50 text-foreground"
                                    >
                                      {pct}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-body-sm" side="left">
                                    {tip}
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={saving || deleting || classificationSectionLoading}
                onClick={() => openClassificationDialog()}
              >
                {hasBreakdownRows ? "Edit classification…" : "Set classification…"}
              </Button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="border-t border-border px-4 py-4 flex flex-col gap-3">
            <p className="text-label uppercase tracking-wider text-muted-foreground">
              Danger zone
            </p>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-body-sm font-medium">Delete position</p>
                <p className="text-body-sm text-muted-foreground">
                  Removes {position.ticker} from this account. Cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deleting || saving}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                  >
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {position.ticker}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove {position.ticker} from {account.label}. This action
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={deleting}
                      onClick={(e) => {
                        e.preventDefault();
                        handleDelete();
                      }}
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <SheetFooter className="px-4 pb-4">
            <SheetClose asChild>
              <Button variant="outline" size="sm" disabled={saving || deleting}>
                Cancel
              </Button>
            </SheetClose>
            <Button size="sm" disabled={saving || deleting} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog
        open={classificationDialogOpen}
        onOpenChange={(next) => {
          if (!next) setClassificationDialogOpen(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-h3">
              Edit classification · <span className="font-mono">{position.ticker}</span>
            </DialogTitle>
            <DialogDescription className="text-body-sm space-y-2">
              <p>
                Weights must sum to 100% (±2%). Saving applies portfolio-wide for this ticker across
                every account that holds it.
              </p>
              {tickerAccountCount > 1 && (
                <p>
                  This ticker appears in {tickerAccountCount} accounts. One saved classification
                  applies to all of them.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          {clsError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
              {clsError}
            </p>
          )}
          {taxonomy && (
            <BucketEditor
              buckets={editBuckets}
              taxonomy={taxonomy}
              disabled={clsSaving}
              onChange={setEditBuckets}
            />
          )}
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <div className="flex flex-wrap gap-2">
              {mergedClassificationRow?.source === "user" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={clsSaving}
                  onClick={() => setRevertDialogOpen(true)}
                >
                  Remove your override
                </Button>
              )}
            </div>
            <div className="flex gap-2 sm:ml-auto">
              <Button
                type="button"
                variant="outline"
                disabled={clsSaving}
                onClick={() => setClassificationDialogOpen(false)}
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert {position.ticker}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes your custom classification. OpenPortfolio uses the built-in mapping when one
              exists for this ticker. Otherwise the ticker is unclassified until you set it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clsSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clsSaving}
              onClick={(e) => {
                e.preventDefault();
                void confirmRevertClassification();
              }}
            >
              {clsSaving ? "Reverting…" : "Revert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    </TooltipProvider>
  );
}
