"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { mutate } from "swr";
import { PlusIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/app/components/ui/sheet";
import type { Account, Institution } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import {
  type AccountKind,
  formatUsd,
  stalenessState,
  daysSince,
} from "./mocks";
import { InstitutionCombobox, AccountKindCombobox } from "./comboboxes";
import { UpdateForm, type UpdateFormHandle, type Stage as UpdateStage, type UpdateMode, type ReviewTotals } from "./update-form";
import { cn } from "@/app/lib/utils";

// ── Stage type ─────────────────────────────────────────────────────────────────

type Stage = "closed" | "add" | "update";

// ── Header ────────────────────────────────────────────────────────────────────

type HeaderProps = {
  accounts: Account[];
  institutions: Institution[];
  /** When true, force-open the Add sheet (e.g. triggered from the empty-state button). */
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
};

const FORM_DEFAULTS = {
  institutionId: null as number | null,
  institutionName: "",
  kind: null as AccountKind | null,
  name: "",
  nameWasEdited: false,
  staleAfterDays: 30,
  currentValue: "",
  costBasis: "",
  purchaseDate: "",
};

export function Header({ accounts, institutions, addOpen, onAddOpenChange }: HeaderProps) {
  const activeAccounts = accounts.filter((a) => !a.is_archived);
  const totalNW = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const activeCount = activeAccounts.length;
  const totalCount = accounts.length;

  const maxDays = activeAccounts.reduce((m, a) => {
    if (!a.last_updated_at) return m;
    return Math.max(m, daysSince(a.last_updated_at));
  }, 0);
  const oldestAccount = activeAccounts.find(
    (a) => a.last_updated_at != null && daysSince(a.last_updated_at) === maxDays
  );
  const oldestStaleness = oldestAccount ? stalenessState(oldestAccount) : "fresh";

  // ── State machine ─────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("closed");
  const [pendingName, setPendingName] = useState("");
  const [pendingAccount, setPendingAccount] = useState<Account | null>(null);

  // ── UpdateForm footer state ───────────────────────────────────────────────
  const [updateContinueDisabled, setUpdateContinueDisabled] = useState(true);
  const [updateStage, setUpdateStage] = useState<UpdateStage>("entry");
  const [updateMode, setUpdateMode] = useState<UpdateMode>("pdf");
  const [updateTotals, setUpdateTotals] = useState<ReviewTotals>(null);
  const updateFormRef = useRef<UpdateFormHandle>(null);

  const handleUpdateContinueDisabledChange = useCallback((disabled: boolean) => {
    setUpdateContinueDisabled(disabled);
  }, []);

  // Reset width state when the Update sheet closes
  const isUpdateOpen = stage === "update";
  useEffect(() => {
    if (!isUpdateOpen) {
      setUpdateStage("entry");
      setUpdateMode("pdf");
      setUpdateTotals(null);
    }
  }, [isUpdateOpen]);

  // ── Save state ────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Form fields ───────────────────────────────────────────────────────────
  const [institutionId, setInstitutionId] = useState<number | null>(FORM_DEFAULTS.institutionId);
  const [institutionName, setInstitutionName] = useState(FORM_DEFAULTS.institutionName);
  const [kind, setKind] = useState<AccountKind | null>(FORM_DEFAULTS.kind);
  const [name, setName] = useState(FORM_DEFAULTS.name);
  const [nameWasEdited, setNameWasEdited] = useState(FORM_DEFAULTS.nameWasEdited);
  const [staleAfterDays, setStaleAfterDays] = useState(FORM_DEFAULTS.staleAfterDays);
  const [currentValue, setCurrentValue] = useState(FORM_DEFAULTS.currentValue);
  const [costBasis, setCostBasis] = useState(FORM_DEFAULTS.costBasis);
  const [purchaseDate, setPurchaseDate] = useState(FORM_DEFAULTS.purchaseDate);

  const isManual = kind?.isManual ?? false;

  // Auto-derived name: "${institution} ${kind}" unless the user has manually typed.
  const derivedName =
    institutionName && kind?.label ? `${institutionName} ${kind.label}` : "";
  const displayedName = nameWasEdited ? name : derivedName;

  function handleInstitutionChange(id: number, iName: string) {
    setInstitutionId(id);
    setInstitutionName(iName);
  }

  function handleKindChange(k: AccountKind) {
    setKind(k);
    setStaleAfterDays(k.defaultStaleness);
  }

  function handleNameChange(v: string) {
    setName(v);
    setNameWasEdited(true);
  }

  function resetForm() {
    setInstitutionId(FORM_DEFAULTS.institutionId);
    setInstitutionName(FORM_DEFAULTS.institutionName);
    setKind(FORM_DEFAULTS.kind);
    setName(FORM_DEFAULTS.name);
    setNameWasEdited(FORM_DEFAULTS.nameWasEdited);
    setStaleAfterDays(FORM_DEFAULTS.staleAfterDays);
    setCurrentValue(FORM_DEFAULTS.currentValue);
    setCostBasis(FORM_DEFAULTS.costBasis);
    setPurchaseDate(FORM_DEFAULTS.purchaseDate);
    setPendingName("");
    setPendingAccount(null);
    setSaveError(null);
  }

  function handleAddOpenChange(open: boolean) {
    if (open) {
      setStage("add");
    } else {
      setStage("closed");
      resetForm();
    }
    onAddOpenChange?.(open);
  }

  function handleUpdateOpenChange(open: boolean) {
    if (!open) {
      setStage("closed");
      resetForm();
      setPendingAccount(null);
    }
  }

  async function handleSave() {
    if (!kind) {
      setSaveError("Pick an account kind before saving.");
      return;
    }
    if (isManual && (currentValue === "" || isNaN(Number(currentValue)) || Number(currentValue) < 0)) {
      setSaveError("Current value must be a non-negative number.");
      return;
    }
    const resolvedName = displayedName || kind.label || "New account";
    setSaving(true);
    setSaveError(null);
    try {
      if (isManual) {
        await api.createAccount({
          label: resolvedName,
          type: kind.accountType,
          tax_treatment: kind.taxTreatment,
          staleness_threshold_days: staleAfterDays,
          initial_position: {
            market_value: Number(currentValue),
            cost_basis: costBasis !== "" ? Number(costBasis) : null,
            purchase_date: purchaseDate !== "" ? purchaseDate : null,
          },
        });
        await mutate("/api/accounts");
        setStage("closed");
        resetForm();
      } else {
        const created = await api.createAccount({
          label: resolvedName,
          type: kind.accountType,
          // institutionId > 0 = real DB row; 0/negative = synthetic placeholder not yet in DB
          institution_id: institutionId != null && institutionId > 0 ? institutionId : null,
          tax_treatment: kind.taxTreatment,
          staleness_threshold_days: staleAfterDays,
        });
        await mutate("/api/accounts");
        setPendingName(resolvedName);
        setPendingAccount(created);
        setStage("update");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      {/* ── Totals strip ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        {/* TODO: upgrade to <HeroNumber> for AAA contrast */}
        <span className="font-mono tabular-nums text-h1 text-foreground">
          {formatUsd(totalNW)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-muted-foreground">
            {activeCount} of {totalCount} accounts
          </span>
          {oldestStaleness === "stale" && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-body-sm text-destructive">
              ● Oldest update: {maxDays} days ago
            </span>
          )}
          {oldestStaleness === "aging" && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-body-sm text-warning">
              ● Oldest update: {maxDays} days ago
            </span>
          )}
          {oldestStaleness === "fresh" && (
            <span className="text-body-sm text-muted-foreground">All accounts up to date</span>
          )}
        </div>
      </div>

      {/* ── Add account button + Add Sheet ───────────────────────────────── */}
      <Sheet open={stage === "add" || addOpen === true} onOpenChange={handleAddOpenChange}>
        <Button size="sm" onClick={() => setStage("add")}>
          <PlusIcon className="size-4" />
          Add account
        </Button>

        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add account</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 py-4">
            {saveError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
                {saveError}
              </p>
            )}

            {/* Institution — hidden for manual (real_estate / private) kinds */}
            {!isManual && (
              <div className="flex flex-col gap-1.5">
                <label className="text-body-sm font-medium">Institution</label>
                <InstitutionCombobox
                  institutions={institutions}
                  value={institutionId}
                  onChange={handleInstitutionChange}
                />
              </div>
            )}

            {/* Account kind */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium">Account kind</label>
              <AccountKindCombobox value={kind} onChange={handleKindChange} />
            </div>

            {/* Asset/Account name — optional for non-manual, required for manual */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium" htmlFor="add-account-name">
                {isManual ? "Asset name" : "Account name"}
                {!isManual && (
                  <span className="ml-1.5 text-body-sm font-normal text-muted-foreground">
                    (optional)
                  </span>
                )}
              </label>
              <input
                id="add-account-name"
                type="text"
                value={displayedName}
                placeholder={derivedName || (isManual ? "e.g. 123 Main St" : "e.g. Vanguard Roth IRA")}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Current value — only for manual kinds */}
            {isManual && (
              <div className="flex flex-col gap-1.5">
                <label className="text-body-sm font-medium" htmlFor="add-current-value">
                  Current value
                </label>
                <input
                  id="add-current-value"
                  type="number"
                  min={0}
                  step="any"
                  value={currentValue}
                  placeholder="0.00"
                  onChange={(e) => setCurrentValue(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {/* Cost basis — only for manual kinds */}
            {isManual && (
              <div className="flex flex-col gap-1.5">
                <label className="text-body-sm font-medium" htmlFor="add-cost-basis">
                  Cost basis
                  <span className="ml-1.5 text-body-sm font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="add-cost-basis"
                  type="number"
                  min={0}
                  step="any"
                  value={costBasis}
                  placeholder="0.00"
                  onChange={(e) => setCostBasis(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {/* Purchase date — only for manual kinds */}
            {isManual && (
              <div className="flex flex-col gap-1.5">
                <label className="text-body-sm font-medium" htmlFor="add-purchase-date">
                  Purchase date
                  <span className="ml-1.5 text-body-sm font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  id="add-purchase-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {/* Mark as stale after N days — hidden for manual kinds */}
            {!isManual && (
              <div className="flex items-center gap-2 py-1">
                <label htmlFor="stale-after" className="text-body-sm text-foreground shrink-0">
                  Mark as stale after
                </label>
                <input
                  id="stale-after"
                  type="number"
                  min={1}
                  value={staleAfterDays}
                  onChange={(e) => setStaleAfterDays(Number(e.target.value))}
                  className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="text-body-sm text-muted-foreground shrink-0">days</span>
              </div>
            )}
          </div>

          <SheetFooter className="px-4 pb-4">
            <SheetClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </SheetClose>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Update Sheet (auto-opened after Save) ────────────────────────── */}
      <Sheet open={stage === "update"} onOpenChange={handleUpdateOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            "overflow-y-auto flex flex-col transition-[max-width] duration-500 ease-out",
            updateStage === "review" || updateMode === "manual"
              ? "sm:max-w-none lg:max-w-4xl"
              : "sm:max-w-sm"
          )}
        >
          <SheetHeader>
            <SheetTitle>Import positions — {pendingName}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 px-4 py-4">
            {pendingAccount && (
              <UpdateForm
                ref={updateFormRef}
                key={stage === "update" ? "update-open" : "update-closed"}
                account={pendingAccount}
                initialMode="pdf"
                onContinueDisabledChange={handleUpdateContinueDisabledChange}
                onStageChange={setUpdateStage}
                onModeChange={setUpdateMode}
                onTotalsChange={setUpdateTotals}
                onContinue={() => handleUpdateOpenChange(false)}
              />
            )}
          </div>

          <SheetFooter className="px-4 pb-4 gap-2">
            {updateTotals && (
              <div className="text-body-sm tabular-nums text-muted-foreground border-t border-border pt-3 pb-1">
                <span>Before: {formatUsd(updateTotals.before)}</span>
                <span className="mx-2 text-muted-foreground">→</span>
                <span>After: {formatUsd(updateTotals.after)}</span>
                <span className={cn("ml-2 font-medium", updateTotals.delta >= 0 ? "text-green-600" : "text-destructive")}>
                  ({updateTotals.delta >= 0 ? "+" : ""}{formatUsd(updateTotals.delta)})
                </span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <SheetClose asChild>
                <Button variant="outline" size="sm">
                  Cancel
                </Button>
              </SheetClose>
              <Button
                size="sm"
                disabled={updateContinueDisabled}
                onClick={() => updateFormRef.current?.handleContinue()}
              >
                Continue
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
