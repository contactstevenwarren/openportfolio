"use client";

import { useState, useEffect } from "react";
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
import type { Account, Position } from "@/app/lib/api";
import { api } from "@/app/lib/api";

type EditPositionSheetProps = {
  position: Position;
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

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

  useEffect(() => {
    if (!open) return;
    setShares(String(position.shares));
    setCostBasis(position.cost_basis != null ? String(position.cost_basis) : "");
    setMarketValue(position.market_value != null ? String(position.market_value) : "");
    setAsOf(position.as_of ? position.as_of.slice(0, 10) : "");
    setSaveError(null);
  }, [open, position]);

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
      onOpenChange(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete.");
      setDeleting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
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
                    This will permanently remove {position.ticker} from{" "}
                    {account.label}. This action cannot be undone.
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
  );
}
