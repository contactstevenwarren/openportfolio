"use client";

// Liabilities page (v0.1.7). Track debts so the hero "Net worth" is
// assets minus liabilities. Manual entry only (paste/broker import not
// in scope). kind is free-form — datalist provides common suggestions.

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";

import { api, type Liability, type LiabilityCreate, type LiabilityPatch } from "@/app/lib/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { formatUsd } from "@/app/(app)/_dashboard/mocks";
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

// ── Constants ──────────────────────────────────────────────────────────────

const KIND_SUGGESTIONS = [
  "mortgage",
  "credit_card",
  "student_loan",
  "auto_loan",
  "heloc",
  "medical",
  "other",
];

function todayIso(): string {
  return new Date().toISOString();
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

// ── Add-row form ───────────────────────────────────────────────────────────

type AddFormProps = {
  onSaved: () => void;
};

function AddForm({ onSaved }: AddFormProps) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [balance, setBalance] = React.useState("");
  const [asOf, setAsOf] = React.useState(todayIso().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setLabel("");
    setKind("");
    setBalance("");
    setAsOf(todayIso().slice(0, 10));
    setNotes("");
    setError(null);
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bal = parseFloat(balance);
    if (isNaN(bal) || bal < 0) {
      setError("Balance must be a number ≥ 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: LiabilityCreate = {
        label: label.trim(),
        kind: kind.trim(),
        balance: bal,
        as_of: new Date(asOf).toISOString(),
        notes: notes.trim() || null,
      };
      await api.createLiability(body);
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" />
        Add liability
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
    >
      <p className="text-label uppercase tracking-wide text-muted-foreground">
        New liability
      </p>

      {error && (
        <p className="text-body-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-body-sm font-medium">Label</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Primary mortgage"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-body-sm font-medium">Kind</label>
          <Input
            list="liability-kind-list"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="mortgage, credit_card, …"
            required
          />
          <datalist id="liability-kind-list">
            {KIND_SUGGESTIONS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-body-sm font-medium">Balance (USD)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-body-sm font-medium">As of</label>
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-body-sm font-medium">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 30yr fixed at 6.75%"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Inline edit row ────────────────────────────────────────────────────────

type EditRowProps = {
  row: Liability;
  onSaved: () => void;
  onDeleted: () => void;
};

function EditRow({ row, onSaved, onDeleted }: EditRowProps) {
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(row.label);
  const [kind, setKind] = React.useState(row.kind);
  const [balance, setBalance] = React.useState(String(row.balance));
  const [asOf, setAsOf] = React.useState(row.as_of.slice(0, 10));
  const [notes, setNotes] = React.useState(row.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function cancelEdit() {
    setLabel(row.label);
    setKind(row.kind);
    setBalance(String(row.balance));
    setAsOf(row.as_of.slice(0, 10));
    setNotes(row.notes ?? "");
    setError(null);
    setEditing(false);
  }

  async function handleSave() {
    const bal = parseFloat(balance);
    if (isNaN(bal) || bal < 0) {
      setError("Balance must be ≥ 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const patch: LiabilityPatch = {};
      if (label.trim() !== row.label) patch.label = label.trim();
      if (kind.trim() !== row.kind) patch.kind = kind.trim();
      if (bal !== row.balance) patch.balance = bal;
      const newAsOf = new Date(asOf).toISOString();
      if (newAsOf !== row.as_of) patch.as_of = newAsOf;
      const newNotes = notes.trim() || null;
      if (newNotes !== row.notes) patch.notes = newNotes;

      if (Object.keys(patch).length > 0) {
        await api.patchLiability(row.id, patch);
      }
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteLiability(row.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td className="py-3 pr-4 text-body-sm font-medium">{row.label}</td>
        <td className="py-3 pr-4 text-body-sm text-muted-foreground">{row.kind}</td>
        <td className="py-3 pr-4 text-body-sm font-mono tabular-nums text-right">
          {formatUsd(row.balance)}
        </td>
        <td className="py-3 pr-4 text-body-sm text-muted-foreground whitespace-nowrap">
          {fmtDate(row.as_of)}
        </td>
        <td className="py-3 text-body-sm text-muted-foreground hidden md:table-cell">
          {row.notes ?? "—"}
        </td>
        <td className="py-3 pl-4">
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditing(true)}
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label="Delete"
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete liability?</AlertDialogTitle>
                  <AlertDialogDescription>
                    &ldquo;{row.label}&rdquo; ({formatUsd(row.balance)}) will be
                    permanently removed and your net worth will be updated.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0 bg-muted/30">
      <td className="py-2 pr-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-body-sm"
          placeholder="Label"
        />
      </td>
      <td className="py-2 pr-2">
        <Input
          list="liability-kind-list-edit"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-8 text-body-sm"
          placeholder="Kind"
        />
        <datalist id="liability-kind-list-edit">
          {KIND_SUGGESTIONS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </td>
      <td className="py-2 pr-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          className="h-8 text-body-sm font-mono text-right"
        />
      </td>
      <td className="py-2 pr-2">
        <Input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          className="h-8 text-body-sm"
        />
      </td>
      <td className="py-2 pr-2 hidden md:table-cell">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-8 text-body-sm"
          placeholder="Notes"
        />
      </td>
      <td className="py-2 pl-2">
        <div className="flex items-center gap-1 justify-end">
          {error && (
            <span className="text-body-sm text-destructive mr-1">{error}</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={busy}
            aria-label="Save"
          >
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={cancelEdit}
            disabled={busy}
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LiabilitiesPage() {
  const { mutate } = useSWRConfig();
  const {
    data: liabilities = [],
    error,
    isLoading,
    mutate: mutateLiabilities,
  } = useSWR<Liability[]>("/api/liabilities", api.liabilities, {
    revalidateOnFocus: false,
  });

  function refresh() {
    mutateLiabilities();
    // Invalidate allocation so the hero net-worth updates immediately.
    mutate("/api/allocation");
  }

  const total = liabilities.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Liabilities
        </p>
        <h1 className="text-h2">Liabilities</h1>
        <p className="text-body-sm text-muted-foreground">
          Debts subtracted from your assets to compute true net worth. Does not
          affect portfolio allocation, drift, or rebalance.
        </p>
      </header>

      {liabilities.length > 0 && (
        <div className="flex gap-6">
          <div className="flex flex-col gap-0.5">
            <p className="text-label uppercase tracking-wide text-muted-foreground">
              Total liabilities
            </p>
            <p className="text-display font-mono tabular-nums text-destructive">
              {formatUsd(total)}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-label uppercase tracking-wide text-muted-foreground">
              Count
            </p>
            <p className="text-display font-mono tabular-nums">
              {liabilities.length}
            </p>
          </div>
        </div>
      )}

      <AddForm onSaved={refresh} />

      {error && (
        <p className="text-body-sm text-destructive">
          Could not load liabilities: {error.message}
        </p>
      )}

      {isLoading && (
        <p className="text-body-sm text-muted-foreground py-8 text-center">
          Loading…
        </p>
      )}

      {!isLoading && !error && liabilities.length === 0 && (
        <div className="rounded-lg border border-border py-12 text-center">
          <p className="text-body-sm text-muted-foreground">
            No liabilities yet. Add a mortgage, credit card, or any other debt.
          </p>
        </div>
      )}

      {liabilities.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="py-2.5 pr-4 pl-4 text-label uppercase tracking-wide text-muted-foreground">
                  Label
                </th>
                <th className="py-2.5 pr-4 text-label uppercase tracking-wide text-muted-foreground">
                  Kind
                </th>
                <th className="py-2.5 pr-4 text-right text-label uppercase tracking-wide text-muted-foreground">
                  Balance
                </th>
                <th className="py-2.5 pr-4 text-label uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  As of
                </th>
                <th className="py-2.5 pr-4 text-label uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                  Notes
                </th>
                <th className="py-2.5 pl-4 text-right text-label uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
              {liabilities.map((row) => (
                <EditRow
                  key={row.id}
                  row={row}
                  onSaved={refresh}
                  onDeleted={refresh}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={2} className="py-2.5 pl-4 text-body-sm font-medium">
                  Total
                </td>
                <td className="py-2.5 pr-4 text-body-sm font-mono tabular-nums text-right font-medium text-destructive">
                  {formatUsd(total)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
