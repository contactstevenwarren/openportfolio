"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/app/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import type { Account } from "@/app/lib/api";
import { api } from "@/app/lib/api";

type UpdateValueSheetProps = {
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UpdateValueSheet({ account, open, onOpenChange }: UpdateValueSheetProps) {
  const positionsKey = `/api/positions?account_id=${account.id}`;

  const { data: positions, isValidating } = useSWR(
    open ? positionsKey : null,
    () => api.positions(account.id),
    { revalidateOnFocus: false }
  );

  const existingPosition = positions?.[0] ?? null;

  const [currentValue, setCurrentValue] = useState("");
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pre-fill from the fetched position whenever it arrives or sheet re-opens.
  useEffect(() => {
    if (!open) return;
    if (existingPosition) {
      setCurrentValue(existingPosition.market_value != null ? String(existingPosition.market_value) : "");
      setAsOfDate(existingPosition.as_of ? existingPosition.as_of.slice(0, 10) : todayIso());
    } else {
      setCurrentValue("");
      setAsOfDate(todayIso());
    }
    setSaveError(null);
  }, [open, existingPosition]);

  async function handleSave() {
    if (!existingPosition) {
      setSaveError("No position found for this account.");
      return;
    }
    if (currentValue === "" || isNaN(Number(currentValue)) || Number(currentValue) < 0) {
      setSaveError("Current value must be a non-negative number.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.patchPosition(existingPosition.id, {
        market_value: Number(currentValue),
        as_of: asOfDate,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Update value — {account.label}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          {saveError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
              {saveError}
            </p>
          )}

          {/* Current value */}
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium" htmlFor="update-value-current">
              Current value
            </label>
            <input
              id="update-value-current"
              type="number"
              min={0}
              step="any"
              value={currentValue}
              placeholder="0.00"
              onChange={(e) => setCurrentValue(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* As-of date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium" htmlFor="update-value-asof">
              As-of date
            </label>
            <input
              id="update-value-asof"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <SheetFooter className="px-4 pb-4">
          <SheetClose asChild>
            <Button variant="outline" size="sm" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button size="sm" disabled={isValidating || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
