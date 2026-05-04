"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import useSWR, { mutate } from "swr";
import { ChevronRightIcon, ChevronDownIcon, UploadIcon, Pencil } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/app/components/ui/sheet";
import { UpdateForm, type UpdateMode, type UpdateFormHandle, type Stage, type ReviewTotals } from "./update-form";
import { UpdateValueSheet } from "./update-value-sheet";
import { ClassChip } from "./class-chip";
import { EditPositionSheet } from "./edit-position-sheet";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/app/components/ui/tooltip";
import { cn } from "@/app/lib/utils";
import type { Account, Institution, ClassificationRow } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import {
  type AccountKind,
  ASSET_CLASS_ORDER,
  ASSET_CLASS_LABEL,
  ASSET_CLASS_COLOR,
  stalenessState,
  formatUsd,
  formatRelativeDate,
  formatProvenance,
} from "./mocks";
import {
  InstitutionCombobox,
  AccountKindCombobox,
  findMatchingKind,
} from "./comboboxes";
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

// ── Labels ────────────────────────────────────────────────────────────────────

const TAX_TREATMENT_LABEL: Record<Account["tax_treatment"], string> = {
  taxable: "Taxable",
  tax_deferred: "Tax-deferred",
  tax_free: "Tax-free",
  hsa: "HSA",
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  brokerage: "Brokerage",
  bank: "Bank",
  crypto: "Crypto",
  real_estate: "Real estate",
  private: "Private",
};

// ── UpdateSheet ───────────────────────────────────────────────────────────────

type UpdateTrigger = {
  mode: UpdateMode;
  autoSubmit: boolean;
  file: File | null;
};

function UpdateSheet({
  account,
  open,
  onOpenChange,
  trigger,
}: {
  account: Account;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  trigger: UpdateTrigger;
}) {
  const [continueDisabled, setContinueDisabled] = useState(true);
  const [stage, setStage] = useState<Stage>("entry");
  const [mode, setMode] = useState<UpdateMode>(trigger.mode);
  const [totals, setTotals] = useState<ReviewTotals>(null);
  const formRef = useRef<UpdateFormHandle>(null);

  const handleContinueDisabledChange = useCallback((disabled: boolean) => {
    setContinueDisabled(disabled);
  }, []);

  // Reset to narrow + clear totals when sheet closes
  useEffect(() => {
    if (!open) {
      setStage("entry");
      setMode(trigger.mode);
      setTotals(null);
    }
  }, [open, trigger.mode]);

  // Widen when review stage or manual tab is active
  const widen = stage === "review" || mode === "manual";
  const widthClass = widen ? "sm:max-w-none lg:max-w-4xl" : "sm:max-w-sm";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "overflow-y-auto flex flex-col transition-[max-width] duration-500 ease-out",
          widthClass
        )}
      >
        <SheetHeader>
          <SheetTitle>Import positions — {account.label}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 px-6 py-4">
          <UpdateForm
            ref={formRef}
            key={`${open}-${trigger.mode}-${trigger.autoSubmit}`}
            account={account}
            initialMode={trigger.mode}
            autoSubmit={trigger.autoSubmit}
            initialFile={trigger.file}
            onContinueDisabledChange={handleContinueDisabledChange}
            onStageChange={setStage}
            onModeChange={setMode}
            onTotalsChange={setTotals}
            onContinue={() => onOpenChange(false)}
          />
        </div>

        <SheetFooter className="px-6 pb-6 gap-2">
          {totals && (
            <div className="text-body-sm tabular-nums text-muted-foreground border-t border-border pt-3 pb-1">
              <span>Before: {formatUsd(totals.before)}</span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span>After: {formatUsd(totals.after)}</span>
              <span className={cn("ml-2 font-medium", totals.delta >= 0 ? "text-green-600" : "text-destructive")}>
                ({totals.delta >= 0 ? "+" : ""}{formatUsd(totals.delta)})
              </span>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <SheetClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </SheetClose>
            <Button
              size="sm"
              disabled={continueDisabled}
              onClick={() => formRef.current?.handleContinue()}
            >
              Continue
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── DangerZone ────────────────────────────────────────────────────────────────
// Rendered inside EditSheet. Provides Archive/Unarchive and Delete permanently.

function DangerZone({
  account,
  onDone,
}: {
  account: Account;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setBusy(true);
    setError(null);
    try {
      await api.patchAccount(account.id, { is_archived: !account.is_archived });
      await mutate("/api/accounts");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(account.id);
      await mutate("/api/accounts");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border px-4 py-4 flex flex-col gap-4">
      <p className="text-label uppercase tracking-wider text-muted-foreground">
        Danger zone
      </p>

      {error && (
        <p className="text-body-sm text-destructive">{error}</p>
      )}

      {/* Archive / Unarchive */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-body-sm font-medium">
            {account.is_archived ? "Unarchive account" : "Archive account"}
          </p>
          <p className="text-body-sm text-muted-foreground">
            {account.is_archived
              ? "Show in the active list again."
              : "Hide from the active list. Reversible."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={handleArchive}
        >
          {account.is_archived ? "Unarchive" : "Archive"}
        </Button>
      </div>

      {/* Delete permanently */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-body-sm font-medium">Delete permanently</p>
          <p className="text-body-sm text-muted-foreground">
            Removes the account
            {account.position_count > 0
              ? ` and ${account.position_count} position${account.position_count === 1 ? "" : "s"}`
              : ""}
            . This cannot be undone.
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {account.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                {account.position_count > 0
                  ? `This will also remove ${account.position_count} position${account.position_count === 1 ? "" : "s"}. `
                  : ""}
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
              >
                {busy ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}


// ── EditSheet ─────────────────────────────────────────────────────────────────
// Mirrors the Add form (Institution, Account kind, Account name, Mark as stale
// after) so the same account looks the same whether you're creating or editing.
// All four fields are pre-filled from the existing account.

type EditSheetProps = {
  account: Account;
  institutions: Institution[];
};

function EditSheet({ account, institutions }: EditSheetProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Resolve the current account's (type, tax, manual) tuple to the matching
  // template kind, or synthesize a "Custom" kind if no template matches.
  const initialKind = findMatchingKind(
    account.type as Parameters<typeof findMatchingKind>[0],
    account.tax_treatment as Parameters<typeof findMatchingKind>[1],
    account.is_manual,
    account.staleness_threshold_days
  );

  const [institutionId, setInstitutionId] = useState<number | null>(account.institution_id);
  const [kind, setKind] = useState<AccountKind | null>(initialKind);
  const [name, setName] = useState<string>(account.label);
  const [staleAfterDays, setStaleAfterDays] = useState<number>(account.staleness_threshold_days);

  // Reset all fields when the sheet opens.
  useEffect(() => {
    if (open) {
      setInstitutionId(account.institution_id);
      setKind(initialKind);
      setName(account.label);
      setStaleAfterDays(account.staleness_threshold_days);
      setSaveError(null);
    }
    // initialKind is derived from `account` fields already in the deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account]);

  function handleInstitutionChange(id: number, _name: string) {
    setInstitutionId(id);
  }

  // When the user picks a different kind in Edit, keep their existing
  // staleness threshold (could be customized) — only reset if it matches
  // the previous kind's default, which means they hadn't customized it.
  function handleKindChange(k: AccountKind) {
    setKind((prev) => {
      if (prev && staleAfterDays === prev.defaultStaleness) {
        setStaleAfterDays(k.defaultStaleness);
      }
      return k;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.patchAccount(account.id, {
        label: name.trim() || account.label,
        type: kind?.accountType ?? account.type,
        institution_id: institutionId != null && institutionId > 0 ? institutionId : null,
        tax_treatment: (kind?.taxTreatment ?? account.tax_treatment) as
          'taxable' | 'tax_deferred' | 'tax_free' | 'hsa',
        staleness_threshold_days: staleAfterDays,
      });
      await mutate("/api/accounts");
      setOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Edit</Button>
      </SheetTrigger>

      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit {account.label}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          {saveError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
              {saveError}
            </p>
          )}

          {/* Institution */}
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium">Institution</label>
            <InstitutionCombobox
              institutions={institutions}
              value={institutionId}
              onChange={handleInstitutionChange}
            />
          </div>

          {/* Account kind */}
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium">Account kind</label>
            <AccountKindCombobox value={kind} onChange={handleKindChange} />
          </div>

          {/* Account name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium" htmlFor={`edit-label-${account.id}`}>
              Account name
            </label>
            <input
              id={`edit-label-${account.id}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Mark as stale after N days */}
          <div className="flex items-center gap-2 py-1">
            <label htmlFor={`edit-stale-${account.id}`} className="text-body-sm text-foreground shrink-0">
              Mark as stale after
            </label>
            <input
              id={`edit-stale-${account.id}`}
              type="number"
              min={1}
              value={staleAfterDays}
              onChange={(e) => setStaleAfterDays(Number(e.target.value))}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-body-sm text-muted-foreground shrink-0">days</span>
          </div>
        </div>

        <DangerZone account={account} onDone={() => setOpen(false)} />

        <SheetFooter className="px-4 pb-4">
          <SheetClose asChild>
            <Button variant="outline" size="sm" disabled={saving}>Cancel</Button>
          </SheetClose>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

export type RowProps = {
  account: Account;
  institution: Institution;
  institutions: Institution[];
  isExpanded: boolean;
  onToggle: (id: number) => void;
  isFileDragging: boolean;
  onFileDragEnd: () => void;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
};

export function Row({
  account,
  institution,
  institutions,
  isExpanded,
  onToggle,
  isFileDragging,
  onFileDragEnd,
  isFirstInGroup,
  isLastInGroup,
}: RowProps) {
  const staleness = stalenessState(account);

  // ── Lazy-fetch positions on first expand ──────────────────────────────────
  const { data: positions = [] } = useSWR(
    isExpanded ? `/api/positions?account_id=${account.id}` : null,
    () => api.positions(account.id),
    { revalidateOnFocus: false }
  );

  // ── Lazy-fetch classifications for non-manual accounts ────────────────────
  const { data: classifications = [] } = useSWR<ClassificationRow[]>(
    isExpanded && !account.is_manual ? "/api/classifications" : null,
    () => api.classifications(),
    { revalidateOnFocus: false }
  );
  const classMap = new Map(classifications.map((c) => [c.ticker, c]));

  // ── Unclassified filter state ──────────────────────────────────────────────
  const [unclassifiedFilter, setUnclassifiedFilter] = useState(false);
  const visiblePositions = unclassifiedFilter
    ? positions.filter((pos) => {
        const row = classMap.get(pos.ticker);
        return !row || row.asset_class == null;
      })
    : positions;

  // ── Edit position sheet state ──────────────────────────────────────────────
  const [editPositionId, setEditPositionId] = useState<number | null>(null);
  const editPosition = positions.find((p) => p.id === editPositionId) ?? null;

  // ── UpdateSheet state ──────────────────────────────────────────────────────
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateTrigger, setUpdateTrigger] = useState<UpdateTrigger>({
    mode: "pdf",
    autoSubmit: false,
    file: null,
  });

  function openUpdate(mode: UpdateMode = "pdf", autoSubmit = false, file: File | null = null) {
    setUpdateTrigger({ mode, autoSubmit, file });
    setUpdateOpen(true);
  }

  // ── UpdateValueSheet state (real_estate / private) ─────────────────────────
  const [updateValueOpen, setUpdateValueOpen] = useState(false);

  // ── Drop target state ──────────────────────────────────────────────────────
  const [isDropTarget, setIsDropTarget] = useState(false);

  function isFileTransfer(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  // NOTE: dragEnter/dragOver/dragLeave intentionally do NOT call stopPropagation
  // — they need to bubble up to the list wrapper so its counter-based
  // isFileDragging detection works. Only `drop` stops propagation so the list's
  // drop fallback doesn't also fire.
  function handleRowDragEnter(e: React.DragEvent) {
    if (account.is_archived || !isFileTransfer(e)) return;
    e.preventDefault();
    setIsDropTarget(true);
  }

  function handleRowDragLeave(e: React.DragEvent) {
    if (account.is_archived || !isFileTransfer(e)) return;
    // Only clear when leaving the actual row element, not a child.
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setIsDropTarget(false);
  }

  function handleRowDragOver(e: React.DragEvent) {
    if (account.is_archived || !isFileTransfer(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleRowDrop(e: React.DragEvent) {
    if (account.is_archived) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    onFileDragEnd();
    if (account.is_manual) return;
    const file = e.dataTransfer.files[0] ?? null;
    openUpdate("pdf", true, file);
  }

  // ── Asset breakdown segments from server-computed class_breakdown ────────────
  const breakdownMap = new Map(
    account.class_breakdown.map((b) => [b.asset_class, b.value])
  );
  const totalBreakdownValue = Array.from(breakdownMap.values()).reduce((s, v) => s + v, 0);
  const segments = ASSET_CLASS_ORDER
    .filter((cls) => breakdownMap.has(cls))
    .map((cls) => ({ cls, value: breakdownMap.get(cls)! }));
  const unclassifiedCount = account.position_count - account.classified_position_count;

  // ── Metadata line ───────────────────────────────────────────────────────────
  const metaParts = [
    institution.name,
    ACCOUNT_TYPE_LABEL[account.type] ?? account.type,
    TAX_TREATMENT_LABEL[account.tax_treatment],
  ];
  if (account.is_manual) metaParts.push("Manual");
  const metaLine = metaParts.join(" · ");

  // ── Staleness pill ──────────────────────────────────────────────────────────
  const relativeDate = account.last_updated_at
    ? formatRelativeDate(account.last_updated_at)
    : "Never updated";
  const provenance =
    account.last_updated_at && account.last_update_source
      ? formatProvenance(account.last_updated_at, account.last_update_source)
      : "Never updated";

  // Stale and aging pills are interactive buttons — clicking opens the Update sheet.
  // Fresh state is plain text; no urgency, no click affordance.
  const stalenessPill =
    staleness === "stale" ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openUpdate(); }}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Import positions — ${account.label} (${relativeDate})`}
      >
        ● {relativeDate}
      </button>
    ) : staleness === "aging" ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openUpdate(); }}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Import positions — ${account.label} (${relativeDate})`}
      >
        ● {relativeDate}
      </button>
    ) : (
      <span className="text-body-sm text-muted-foreground">{relativeDate}</span>
    );

  // ── Drop-target visual classes ───────────────────────────────────────────────
  // Receptive rows during drag get a faint accent tint. The row under the
  // cursor gets a stronger tint plus a 2px dashed accent outline — the universal
  // "drop here" affordance. `-outline-offset-2` insets it 2px so it sits inside
  // the row rather than overlapping siblings, and modern browsers respect the
  // outer wrapper's border-radius so the outline follows rounded corners.
  const dropClass = !account.is_archived && isFileDragging
    ? isDropTarget
      ? "bg-accent/10 outline outline-2 outline-dashed outline-accent -outline-offset-2"
      : "bg-accent/5"
    : "";

  // ── Corner rounding ────────────────────────────────────────────────────────
  // Matches the group container's `rounded-lg` on first/last rows so the drop
  // highlight (and the row's hover/expand backgrounds) follow the rounded shape.
  const cornerClass = [
    isFirstInGroup ? "rounded-t-lg" : "",
    isLastInGroup ? "rounded-b-lg" : "",
  ].filter(Boolean).join(" ");

  return (
    <TooltipProvider>
      <UpdateSheet
        account={account}
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        trigger={updateTrigger}
      />
      <UpdateValueSheet
        account={account}
        open={updateValueOpen}
        onOpenChange={setUpdateValueOpen}
      />
      {editPosition && (
        <EditPositionSheet
          position={editPosition}
          account={account}
          open={editPositionId !== null}
          onOpenChange={(open) => { if (!open) setEditPositionId(null); }}
        />
      )}

      <div
        className={[
          account.is_archived ? "opacity-60" : "",
          cornerClass,
          dropClass,
          "transition-colors",
        ].filter(Boolean).join(" ")}
        onDragEnter={handleRowDragEnter}
        onDragLeave={handleRowDragLeave}
        onDragOver={handleRowDragOver}
        onDrop={handleRowDrop}
      >
        {/* Collapsed row — <div role="button"> to allow interactive children */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onToggle(account.id as number)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle(account.id as number);
            }
          }}
          className={[
            "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none cursor-pointer",
            cornerClass,
          ].join(" ")}
        >
          {/* Name + metadata */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-body-sm truncate">{account.label}</p>
            <p className="text-body-sm text-muted-foreground truncate">{metaLine}</p>
          </div>

          {/* Staleness pill — wrapped in Tooltip for provenance, interactive when stale/aging */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">{stalenessPill}</span>
            </TooltipTrigger>
            <TooltipContent>{provenance}</TooltipContent>
          </Tooltip>

          {/* Balance with provenance tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono tabular-nums text-body-sm font-medium text-foreground shrink-0">
                {formatUsd(account.balance)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{provenance}</TooltipContent>
          </Tooltip>

          {/* Action icon button — Import or Update value depending on account type */}
          {!account.is_archived && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (account.is_manual) {
                      setUpdateValueOpen(true);
                    } else {
                      openUpdate();
                    }
                  }}
                  aria-label={account.is_manual ? `Update value — ${account.label}` : `Import positions — ${account.label}`}
                >
                  <UploadIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {account.is_manual ? `Update value — ${account.label}` : `Import positions — ${account.label}`}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Expand/collapse chevron */}
          {isExpanded ? (
            <ChevronDownIcon className="size-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRightIcon className="size-4 text-muted-foreground shrink-0" />
          )}
        </div>

        {/* Expanded panel */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-0">
            {segments.length > 0 ? (
              <>
                {/* Asset breakdown bar — from server-computed class_breakdown */}
                <div className="h-2 w-full flex rounded-full overflow-hidden bg-muted">
                  {segments.map((seg) => (
                    <div
                      key={seg.cls}
                      style={{
                        width: `${(seg.value / totalBreakdownValue) * 100}%`,
                        backgroundColor: ASSET_CLASS_COLOR[seg.cls],
                      }}
                      title={ASSET_CLASS_LABEL[seg.cls]}
                    />
                  ))}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {segments.map((seg) => (
                    <span
                      key={seg.cls}
                      className="inline-flex items-center gap-1 text-body-sm text-muted-foreground"
                    >
                      <span
                        className="size-2 rounded-full inline-block"
                        style={{ backgroundColor: ASSET_CLASS_COLOR[seg.cls] }}
                      />
                      {ASSET_CLASS_LABEL[seg.cls]}{" "}
                      {((seg.value / totalBreakdownValue) * 100).toFixed(1)}%
                    </span>
                  ))}
                  {unclassifiedCount > 0 && !account.is_manual && (
                    <button
                      type="button"
                      onClick={() => setUnclassifiedFilter((f) => !f)}
                      className={[
                        "text-body-sm px-1.5 py-0.5 rounded transition-colors",
                        unclassifiedFilter
                          ? "bg-amber-200 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                          : "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50",
                      ].join(" ")}
                    >
                      {unclassifiedCount} unclassified
                    </button>
                  )}
                </div>

                {/* Positions table — lazy-loaded from /api/positions?account_id */}
                {positions.length > 0 ? (
                  <>
                    {/* Desktop */}
                    <table className="w-full mt-3 text-body-sm hidden sm:table">
                      <thead>
                        <tr className="text-muted-foreground text-left border-b border-border">
                          <th className="pb-1 font-medium">Ticker</th>
                          {!account.is_manual && (
                            <th className="pb-1 font-medium text-left pl-2">Class</th>
                          )}
                          <th className="pb-1 font-medium text-right">Qty</th>
                          <th className="pb-1 font-medium text-right">Value</th>
                          {!account.is_manual && (
                            <th className="pb-1 w-6" />
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePositions.map((pos) => {
                          const classRow = classMap.get(pos.ticker) ?? null;
                          return (
                            <tr key={pos.id} className="border-b border-border/50 last:border-0">
                              <td className="py-1.5 font-mono text-xs">{pos.ticker}</td>
                              {!account.is_manual && (
                                <td className="py-1.5 pl-2">
                                  {/* TODO(G3): derive cross-account ticker count once accounts prop is threaded to Row */}
                                  <ClassChip
                                    ticker={pos.ticker}
                                    assetClass={classRow?.asset_class ?? null}
                                    source={classRow?.source ?? null}
                                    accountId={account.id}
                                    accountCountForTicker={0}
                                  />
                                </td>
                              )}
                              <td className="py-1.5 font-mono text-xs text-right tabular-nums">
                                {pos.shares.toLocaleString("en-US")}
                              </td>
                              <td className="py-1.5 font-mono text-xs text-right tabular-nums">
                                {pos.market_value != null ? formatUsd(pos.market_value) : "—"}
                              </td>
                              {!account.is_manual && (
                                <td className="py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditPositionId(pos.id)}
                                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    aria-label={`Edit ${pos.ticker}`}
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {/* Mobile */}
                    <div className="sm:hidden mt-3 flex flex-col">
                      {visiblePositions.map((pos) => {
                        const classRow = classMap.get(pos.ticker) ?? null;
                        return (
                          <div
                            key={pos.id}
                            className="flex justify-between items-center py-2 border-b border-border/50 last:border-0"
                          >
                            <div className="flex flex-col gap-1">
                              <p className="font-mono text-xs text-foreground">{pos.ticker}</p>
                              {!account.is_manual && (
                                // TODO(G3): derive cross-account ticker count once accounts prop is threaded to Row
                                <ClassChip
                                  ticker={pos.ticker}
                                  assetClass={classRow?.asset_class ?? null}
                                  source={classRow?.source ?? null}
                                  accountId={account.id}
                                  accountCountForTicker={0}
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="font-mono text-xs tabular-nums text-foreground">
                                  {pos.market_value != null ? formatUsd(pos.market_value) : "—"}
                                </p>
                                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                                  {pos.shares.toLocaleString("en-US")}
                                </p>
                              </div>
                              {!account.is_manual && (
                                <button
                                  type="button"
                                  onClick={() => setEditPositionId(pos.id)}
                                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  aria-label={`Edit ${pos.ticker}`}
                                >
                                  <Pencil className="size-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-body-sm text-muted-foreground py-2">Loading…</p>
                )}
              </>
            ) : (
              <p className="text-body-sm text-muted-foreground py-2">
                Never updated. Click Update to add holdings.
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-4">
              {account.is_archived ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await api.patchAccount(account.id, { is_archived: false });
                    await mutate("/api/accounts");
                  }}
                >
                  Unarchive
                </Button>
              ) : (
                <>
                  <EditSheet account={account} institutions={institutions} />
                  {account.is_manual ? (
                    <Button size="sm" onClick={() => setUpdateValueOpen(true)}>
                      Update value
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => openUpdate()}>
                      Import positions
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
