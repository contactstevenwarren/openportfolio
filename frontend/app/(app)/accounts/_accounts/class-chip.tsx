"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { mutate } from "swr";
import { Button } from "@/app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import {
  api,
  classificationDominantBucket,
  type AssetClass,
} from "@/app/lib/api";
import { ASSET_CLASS_ORDER, ASSET_CLASS_LABEL } from "./mocks";

type ClassChipProps = {
  ticker: string;
  assetClass: string | null;
  source: "yaml" | "user" | null;
  accountId: number;
  accountCountForTicker: number;
};

export function ClassChip({
  ticker,
  assetClass,
  source,
  accountId: _accountId,
  accountCountForTicker,
}: ClassChipProps) {
  const [open, setOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>(assetClass ?? "");
  const [subClass, setSubClass] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: classifications } = useSWR(
    open ? "/api/classifications" : null,
    api.classifications,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!open) return;
    const row = classifications?.find((c) => c.ticker === ticker);
    if (row) {
      const d = classificationDominantBucket(row);
      setSelectedClass(d.asset_class);
      setSubClass(d.sub_class ?? "");
    } else {
      setSelectedClass(assetClass ?? "");
      setSubClass("");
    }
    setError(null);
  }, [open, classifications, ticker, assetClass]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (selectedClass === "") {
        await api.deleteClassification(ticker);
      } else {
        await api.patchClassification(ticker, {
          buckets: [
            {
              asset_class: selectedClass,
              sub_class: subClass.trim() || null,
              weight: 1,
            },
          ],
        });
      }
      await mutate("/api/classifications");
      await mutate("/api/accounts");
      await mutate("/api/allocation");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError(null);
    try {
      await api.deleteClassification(ticker);
      await mutate("/api/classifications");
      await mutate("/api/accounts");
      await mutate("/api/allocation");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset.");
    } finally {
      setSaving(false);
    }
  }

  const chipLabel =
    assetClass != null
      ? (ASSET_CLASS_LABEL[assetClass as AssetClass] ?? assetClass)
      : "Unclassified";

  const chipClass =
    assetClass != null
      ? "text-muted-foreground bg-muted text-xs px-1.5 py-0.5 rounded cursor-pointer hover:bg-muted/80 transition-colors"
      : "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-xs px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className={chipClass}>
          {chipLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 flex flex-col gap-3" align="start">
        {error && (
          <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">
            {ticker} — Asset class
          </label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Unclassified</option>
            {ASSET_CLASS_ORDER.map((cls) => (
              <option key={cls} value={cls}>
                {ASSET_CLASS_LABEL[cls]}
              </option>
            ))}
          </select>
          {accountCountForTicker > 1 && (
            <p className="text-xs text-muted-foreground">
              Applies to {ticker} in all accounts
            </p>
          )}
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors select-none">
            Sub-class
          </summary>
          <div className="mt-2">
            <label className="font-medium text-foreground">Sub-class (optional)</label>
            <input
              type="text"
              value={subClass}
              onChange={(e) => setSubClass(e.target.value)}
              placeholder="e.g. us_large_cap"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-muted-foreground">
              Saved as a single 100% bucket. For multi-bucket funds, use{" "}
              <a href="/classifications" className="underline underline-offset-2">
                Classifications
              </a>
              .
            </p>
          </div>
        </details>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
          {source === "user" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 text-muted-foreground"
              disabled={saving}
              onClick={handleReset}
            >
              Reset to default
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs h-7 px-2"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
