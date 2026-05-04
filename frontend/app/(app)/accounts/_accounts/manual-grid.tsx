"use client";

// Self-contained manual-entry grid for the Manual tab.
// Commits directly via api.commit (no review step / extraction).
// Owned by UpdateForm; all session state is local.

import { useState, Fragment } from "react";
import { mutate } from "swr";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import type { Account } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import { ASSET_CLASS_ORDER, ASSET_CLASS_LABEL } from "./mocks";

// ── Types ──────────────────────────────────────────────────────────────────────

type GridRow = {
  id: string;
  ticker: string;
  asset_class: string;
  shares: string;
  cost_basis: string;
  market_value: string;
};

type ManualGridProps = {
  account: Account;
  onSuccess?: () => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyRow(): GridRow {
  return {
    id: crypto.randomUUID(),
    ticker: "",
    asset_class: "",
    shares: "",
    cost_basis: "",
    market_value: "",
  };
}

function isRowFilled(row: GridRow): boolean {
  return row.ticker.trim() !== "" && row.market_value.trim() !== "";
}

// ── ManualGrid ─────────────────────────────────────────────────────────────────

export function ManualGrid({ account, onSuccess }: ManualGridProps) {
  const [rows, setRows] = useState<GridRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [emptyRow()];
    });
  }

  function updateRow(id: string, field: keyof Omit<GridRow, "id">, val: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
    setSavedCount(null);
  }

  const filledRows = rows.filter(isRowFilled);
  const commitDisabled = saving || filledRows.length === 0;

  async function handleCommit() {
    setSaving(true);
    setSaveError(null);
    setSavedCount(null);
    try {
      await api.commit({
        account_id: account.id,
        source: "manual",
        replace_account: false,
        positions: filledRows.map((r) => ({
          ticker: r.ticker.trim(),
          shares: r.shares !== "" ? Number(r.shares) : 1,
          cost_basis: r.cost_basis !== "" ? Number(r.cost_basis) : null,
          market_value: r.market_value !== "" ? Number(r.market_value) : null,
          confidence: 1.0,
          source_span: "manual",
          classification: r.asset_class
            ? {
                asset_class: r.asset_class,
                sub_class: null,
                sector: null,
                region: null,
                auto_suffix: true,
              }
            : undefined,
        })),
      });
      await mutate("/api/accounts");
      await mutate(`/api/positions?account_id=${account.id}`);
      setSavedCount(filledRows.length);
      setRows([emptyRow()]);
      onSuccess?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Commit failed.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-input bg-background px-2 py-1.5 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-muted-foreground">
        For positions Paste can&apos;t handle — cash, real estate, private equity, or manual
        corrections.
      </p>

      {saveError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
          {saveError}
        </p>
      )}
      {savedCount !== null && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-body-sm text-green-700">
          Saved {savedCount} position{savedCount === 1 ? "" : "s"}.
        </p>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-x-2 items-center">
        <span className="text-label text-muted-foreground">Ticker</span>
        <span className="text-label text-muted-foreground">Asset class</span>
        <span className="text-label text-muted-foreground text-right">Shares</span>
        <span className="text-label text-muted-foreground text-right">Cost basis</span>
        <span className="text-label text-muted-foreground text-right">Market value</span>
        <span />
      </div>

      {/* Rows */}
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-x-2 gap-y-1.5 items-center">
        {rows.map((row) => (
          <Fragment key={row.id}>
            <input
              className={inputCls}
              placeholder="VTI"
              value={row.ticker}
              onChange={(e) => updateRow(row.id, "ticker", e.target.value)}
            />
            <select
              className={cn(inputCls, "bg-background")}
              value={row.asset_class}
              onChange={(e) => updateRow(row.id, "asset_class", e.target.value)}
            >
              <option value="">Unclassified</option>
              {ASSET_CLASS_ORDER.map((ac) => (
                <option key={ac} value={ac}>
                  {ASSET_CLASS_LABEL[ac]}
                </option>
              ))}
            </select>
            <input
              className={cn(inputCls, "text-right tabular-nums")}
              placeholder="100"
              type="number"
              min={0}
              step="any"
              value={row.shares}
              onChange={(e) => updateRow(row.id, "shares", e.target.value)}
            />
            <input
              className={cn(inputCls, "text-right tabular-nums")}
              placeholder="—"
              type="number"
              min={0}
              step="any"
              value={row.cost_basis}
              onChange={(e) => updateRow(row.id, "cost_basis", e.target.value)}
            />
            <input
              className={cn(inputCls, "text-right tabular-nums")}
              placeholder="10000"
              type="number"
              min={0}
              step="any"
              value={row.market_value}
              onChange={(e) => updateRow(row.id, "market_value", e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => removeRow(row.id)}
              aria-label="Remove row"
            >
              <XIcon className="size-3.5" />
            </Button>
          </Fragment>
        ))}
      </div>

      {/* Footer row */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow} className="self-start">
          <PlusIcon className="size-4" /> Add row
        </Button>
        <Button size="sm" disabled={commitDisabled} onClick={handleCommit}>
          {saving ? "Saving…" : "Commit"}
        </Button>
      </div>
    </div>
  );
}
