"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRightIcon, ChevronDownIcon, UploadIcon } from "lucide-react";
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
import { UpdateForm, type UpdateMode } from "./update-form";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/app/components/ui/tooltip";
import {
  Account,
  Institution,
  Position,
  AccountKind,
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

// ── Labels ────────────────────────────────────────────────────────────────────

const TAX_TREATMENT_LABEL: Record<Account["taxTreatment"], string> = {
  taxable: "Taxable",
  tax_deferred: "Tax-deferred",
  tax_free: "Tax-free",
  hsa: "HSA",
};

const ACCOUNT_TYPE_LABEL: Record<Account["accountType"], string> = {
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
  // Track whether the form has been submitted so footer shows Cancel-only.
  const [submitted, setSubmitted] = useState(false);

  // Reset submitted state when sheet opens.
  useEffect(() => {
    if (open) setSubmitted(false);
  }, [open]);

  const handleContinueDisabledChange = useCallback((disabled: boolean) => {
    setContinueDisabled(disabled);
  }, []);

  const handleContinue = useCallback(() => {
    setSubmitted(true);
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle>Update {account.name}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 px-6 py-4">
          <UpdateForm
            key={`${open}-${trigger.mode}-${trigger.autoSubmit}`}
            initialMode={trigger.mode}
            autoSubmit={trigger.autoSubmit}
            initialFile={trigger.file}
            onContinueDisabledChange={handleContinueDisabledChange}
            onContinue={handleContinue}
          />
        </div>

        <SheetFooter className="px-6 pb-6 gap-2">
          <SheetClose asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </SheetClose>
          {!submitted && (
            <Button
              size="sm"
              disabled={continueDisabled}
              onClick={handleContinue}
            >
              Continue
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
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

  // Resolve the current account's (type, tax, manual) tuple to the matching
  // template kind, or synthesize a "Custom" kind if no template matches.
  const initialKind = findMatchingKind(
    account.accountType,
    account.taxTreatment,
    account.isManual,
    account.stalenessThresholdDays
  );

  const [institutionId, setInstitutionId] = useState<string | null>(account.institutionId);
  const [kind, setKind] = useState<AccountKind | null>(initialKind);
  const [name, setName] = useState<string>(account.name);
  const [staleAfterDays, setStaleAfterDays] = useState<number>(account.stalenessThresholdDays);

  // Reset all fields when the sheet opens, so a stale local state doesn't leak
  // between opens (e.g. cancelled changes shouldn't persist).
  useEffect(() => {
    if (open) {
      setInstitutionId(account.institutionId);
      setKind(initialKind);
      setName(account.name);
      setStaleAfterDays(account.stalenessThresholdDays);
    }
    // initialKind is derived from `account` fields already in the deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account]);

  function handleInstitutionChange(id: string) {
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Edit</Button>
      </SheetTrigger>

      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit {account.name}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="rounded-md bg-muted px-3 py-2 text-body-sm text-muted-foreground">
            Design preview — not yet connected to data.
          </div>

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
            <label className="text-body-sm font-medium" htmlFor={`edit-name-${account.id}`}>
              Account name
            </label>
            <input
              id={`edit-name-${account.id}`}
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

        <SheetFooter className="px-4 pb-4">
          <SheetClose asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </SheetClose>
          <Button size="sm">Save (preview)</Button>
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
  positions: Position[];
  isExpanded: boolean;
  onToggle: (id: string) => void;
  isFileDragging: boolean;
  onFileDragEnd: () => void;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
};

export function Row({
  account,
  institution,
  institutions,
  positions,
  isExpanded,
  onToggle,
  isFileDragging,
  onFileDragEnd,
  isFirstInGroup,
  isLastInGroup,
}: RowProps) {
  const staleness = stalenessState(account);

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
    if (account.isArchived || !isFileTransfer(e)) return;
    e.preventDefault();
    setIsDropTarget(true);
  }

  function handleRowDragLeave(e: React.DragEvent) {
    if (account.isArchived || !isFileTransfer(e)) return;
    // Only clear when leaving the actual row element, not a child.
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setIsDropTarget(false);
  }

  function handleRowDragOver(e: React.DragEvent) {
    if (account.isArchived || !isFileTransfer(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleRowDrop(e: React.DragEvent) {
    if (account.isArchived) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    onFileDragEnd();
    const file = e.dataTransfer.files[0] ?? null;
    openUpdate("pdf", true, file);
  }

  // ── Asset breakdown segments ────────────────────────────────────────────────
  const segmentMap = new Map<string, number>();
  for (const pos of positions) {
    segmentMap.set(pos.assetClass, (segmentMap.get(pos.assetClass) ?? 0) + pos.value);
  }
  const totalValue = Array.from(segmentMap.values()).reduce((s, v) => s + v, 0);
  const segments = ASSET_CLASS_ORDER
    .filter((cls) => segmentMap.has(cls))
    .map((cls) => ({ cls, value: segmentMap.get(cls)! }));

  // ── Metadata line ───────────────────────────────────────────────────────────
  const metaParts = [
    institution.name,
    ACCOUNT_TYPE_LABEL[account.accountType],
    TAX_TREATMENT_LABEL[account.taxTreatment],
  ];
  if (account.isManual) metaParts.push("Manual");
  const metaLine = metaParts.join(" · ");

  // ── Staleness pill ──────────────────────────────────────────────────────────
  const relativeDate = formatRelativeDate(account.lastUpdatedAt);
  const provenance = formatProvenance(account.lastUpdatedAt, account.lastUpdateSource);

  // Stale and aging pills are interactive buttons — clicking opens the Update sheet.
  // Fresh state is plain text; no urgency, no click affordance.
  const stalenessPill =
    staleness === "stale" ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openUpdate(); }}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Update ${account.name} — ${relativeDate}`}
      >
        ● {relativeDate}
      </button>
    ) : staleness === "aging" ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openUpdate(); }}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Update ${account.name} — ${relativeDate}`}
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
  const dropClass = !account.isArchived && isFileDragging
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

      <div
        className={[
          account.isArchived ? "opacity-60" : "",
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
          onClick={() => onToggle(account.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle(account.id);
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
            <p className="font-medium text-foreground text-body-sm truncate">{account.name}</p>
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

          {/* Update icon button — opens source picker without expanding the row */}
          {!account.isArchived && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); openUpdate(); }}
                  aria-label={`Update ${account.name}`}
                >
                  <UploadIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Update {account.name}</TooltipContent>
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
            {positions.length > 0 ? (
              <>
                {/* Asset breakdown bar */}
                <div className="h-2 w-full flex rounded-full overflow-hidden bg-muted">
                  {segments.map((seg) => (
                    <div
                      key={seg.cls}
                      style={{
                        width: `${(seg.value / totalValue) * 100}%`,
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
                      {((seg.value / totalValue) * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>

                {/* Positions table — desktop */}
                <table className="w-full mt-3 text-body-sm hidden sm:table">
                  <thead>
                    <tr className="text-muted-foreground text-left border-b border-border">
                      <th className="pb-1 font-medium">Ticker</th>
                      <th className="pb-1 font-medium text-right">Qty</th>
                      <th className="pb-1 font-medium text-right">Value</th>
                      <th className="pb-1 font-medium">Asset class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <tr key={pos.id} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 font-mono text-xs">{pos.ticker}</td>
                        <td className="py-1.5 font-mono text-xs text-right tabular-nums">
                          {pos.quantity.toLocaleString()}
                        </td>
                        <td className="py-1.5 font-mono text-xs text-right tabular-nums">
                          {formatUsd(pos.value)}
                        </td>
                        <td className="py-1.5 text-xs">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: ASSET_CLASS_COLOR[pos.assetClass] }}
                            />
                            {ASSET_CLASS_LABEL[pos.assetClass]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Positions cards — mobile */}
                <div className="sm:hidden mt-3 flex flex-col">
                  {positions.map((pos) => (
                    <div
                      key={pos.id}
                      className="flex justify-between items-center py-2 border-b border-border/50 last:border-0"
                    >
                      <div>
                        <p className="font-mono text-xs text-foreground">{pos.ticker}</p>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: ASSET_CLASS_COLOR[pos.assetClass] }}
                          />
                          {ASSET_CLASS_LABEL[pos.assetClass]}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs tabular-nums text-foreground">
                          {formatUsd(pos.value)}
                        </p>
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">
                          {pos.quantity.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-body-sm text-muted-foreground py-2">
                Never updated. Click Update to add holdings.
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-4">
              {account.isArchived ? (
                <Button variant="outline" size="sm">Unarchive</Button>
              ) : (
                <>
                  <EditSheet account={account} institutions={institutions} />
                  <Button size="sm" onClick={() => openUpdate()}>
                    Update
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
