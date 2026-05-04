"use client";

import { useState, useCallback } from "react";
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
import {
  type Account,
  type Institution,
  type AccountKind,
  formatUsd,
  oldestUpdatedDays,
  stalenessState,
  daysSince,
} from "./mocks";
import { InstitutionCombobox, AccountKindCombobox } from "./comboboxes";
import { UpdateForm } from "./update-form";

// ── Stage type ─────────────────────────────────────────────────────────────────

type Stage = "closed" | "add" | "update";

// ── Header ────────────────────────────────────────────────────────────────────

type HeaderProps = {
  accounts: Account[];
  institutions: Institution[];
};

const FORM_DEFAULTS = {
  institutionId: null as string | null,
  institutionName: "",
  kind: null as AccountKind | null,
  name: "",
  nameWasEdited: false,
  staleAfterDays: 30,
};

export function Header({ accounts, institutions }: HeaderProps) {
  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const totalNW = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const activeCount = activeAccounts.length;
  const totalCount = accounts.length;

  const maxDays = oldestUpdatedDays(accounts);
  const oldestAccount = activeAccounts.find((a) => daysSince(a.lastUpdatedAt) === maxDays);
  const oldestStaleness = oldestAccount ? stalenessState(oldestAccount) : "fresh";

  // ── State machine ─────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("closed");
  const [pendingName, setPendingName] = useState("");

  // ── UpdateForm footer state ───────────────────────────────────────────────
  const [updateContinueDisabled, setUpdateContinueDisabled] = useState(true);
  const [updateSubmitted, setUpdateSubmitted] = useState(false);

  const handleUpdateContinueDisabledChange = useCallback((disabled: boolean) => {
    setUpdateContinueDisabled(disabled);
  }, []);

  const handleUpdateContinue = useCallback(() => {
    setUpdateSubmitted(true);
  }, []);

  // ── Form fields ───────────────────────────────────────────────────────────
  const [institutionId, setInstitutionId] = useState<string | null>(FORM_DEFAULTS.institutionId);
  const [institutionName, setInstitutionName] = useState(FORM_DEFAULTS.institutionName);
  const [kind, setKind] = useState<AccountKind | null>(FORM_DEFAULTS.kind);
  const [name, setName] = useState(FORM_DEFAULTS.name);
  const [nameWasEdited, setNameWasEdited] = useState(FORM_DEFAULTS.nameWasEdited);
  const [staleAfterDays, setStaleAfterDays] = useState(FORM_DEFAULTS.staleAfterDays);

  // Auto-derived name: "${institution} ${kind}" unless the user has manually typed.
  const derivedName =
    institutionName && kind?.label ? `${institutionName} ${kind.label}` : "";
  const displayedName = nameWasEdited ? name : derivedName;

  function handleInstitutionChange(id: string, iName: string) {
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
    setPendingName("");
  }

  function handleAddOpenChange(open: boolean) {
    if (open) {
      setStage("add");
    } else {
      setStage("closed");
      resetForm();
    }
  }

  function handleUpdateOpenChange(open: boolean) {
    if (!open) {
      setStage("closed");
      resetForm();
      setUpdateSubmitted(false);
    }
  }

  function handleSave() {
    const resolvedName = displayedName || kind?.label || "New account";
    setPendingName(resolvedName);
    setStage("update");
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
      <Sheet open={stage === "add"} onOpenChange={handleAddOpenChange}>
        <Button size="sm" onClick={() => setStage("add")}>
          <PlusIcon className="size-4" />
          Add account
        </Button>

        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add account</SheetTitle>
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

            {/* Account name — optional, auto-filled */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-medium" htmlFor="add-account-name">
                Account name
                <span className="ml-1.5 text-body-sm font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <input
                id="add-account-name"
                type="text"
                value={displayedName}
                placeholder={derivedName || "e.g. Vanguard Roth IRA"}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Mark as stale after N days */}
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
          </div>

          <SheetFooter className="px-4 pb-4">
            <SheetClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </SheetClose>
            <Button size="sm" onClick={handleSave}>
              Save (preview)
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Update Sheet (auto-opened after Save) ────────────────────────── */}
      <Sheet open={stage === "update"} onOpenChange={handleUpdateOpenChange}>
        <SheetContent side="right" className="overflow-y-auto flex flex-col">
          <SheetHeader>
            <SheetTitle>Update {pendingName}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 px-4 py-4">
            <UpdateForm
              key={stage === "update" ? "update-open" : "update-closed"}
              initialMode="pdf"
              onContinueDisabledChange={handleUpdateContinueDisabledChange}
              onContinue={handleUpdateContinue}
            />
          </div>

          <SheetFooter className="px-4 pb-4 gap-2">
            <SheetClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </SheetClose>
            {!updateSubmitted && (
              <Button
                size="sm"
                disabled={updateContinueDisabled}
                onClick={handleUpdateContinue}
              >
                Continue
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
