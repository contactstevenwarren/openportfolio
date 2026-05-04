"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { Account, Institution } from "@/app/lib/api";
import type { ChipFilter, SortKey } from "./filters";
import {
  daysSince,
  groupByInstitution,
  stalenessState,
} from "./mocks";
import { Row } from "./row";

// ── Props ─────────────────────────────────────────────────────────────────────

type ListProps = {
  accounts: Account[];
  institutions: Institution[];
  activeChips: Set<ChipFilter>;
  search: string;
  sort: SortKey;
  showArchived: boolean;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onAddAccount: () => void;
};

// ── Filter helpers ────────────────────────────────────────────────────────────

function matchesChips(account: Account, chips: Set<ChipFilter>): boolean {
  if (chips.size === 0) return true;
  for (const chip of chips) {
    if (chip === "stale"           && stalenessState(account) !== "stale")       return false;
    if (chip === "aging"           && stalenessState(account) !== "aging")       return false;
    if (chip === "tax-advantaged"  && account.tax_treatment === "taxable")       return false;
    if (chip === "manual"          && !account.is_manual)                        return false;
  }
  return true;
}

function matchesSearch(
  account: Account,
  institution: Institution | undefined,
  q: string
): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    account.label.toLowerCase().includes(lower) ||
    (institution?.name.toLowerCase().includes(lower) ?? false)
  );
}

// ── Sort comparators ──────────────────────────────────────────────────────────

function sortAccounts(accounts: Account[], sort: SortKey): Account[] {
  return [...accounts].sort((a, b) => {
    switch (sort) {
      case "name":
        return a.label.localeCompare(b.label);
      case "balance":
        return b.balance - a.balance;
      case "lastUpdated":
        return (
          daysSince(b.last_updated_at ?? new Date(0).toISOString()) -
          daysSince(a.last_updated_at ?? new Date(0).toISOString())
        );
      case "staleness":
      default: {
        const staleOrder = { stale: 0, aging: 1, fresh: 2 } as const;
        const ao = staleOrder[stalenessState(a)];
        const bo = staleOrder[stalenessState(b)];
        if (ao !== bo) return ao - bo;
        return (
          daysSince(b.last_updated_at ?? new Date(0).toISOString()) -
          daysSince(a.last_updated_at ?? new Date(0).toISOString())
        );
      }
    }
  });
}

function sortWithStalePinned(accounts: Account[], sort: SortKey): Account[] {
  const stale = sortAccounts(
    accounts.filter((a) => stalenessState(a) === "stale"),
    "staleness"
  );
  const rest = sortAccounts(
    accounts.filter((a) => stalenessState(a) !== "stale"),
    sort
  );
  return [...stale, ...rest];
}

// ── Empty states ──────────────────────────────────────────────────────────────

function emptyChipMessage(chips: Set<ChipFilter>): string {
  if (chips.has("stale"))          return "No stale accounts.";
  if (chips.has("aging"))          return "No aging accounts.";
  if (chips.has("tax-advantaged")) return "No tax-advantaged accounts.";
  if (chips.has("manual"))         return "No manual accounts.";
  return "No accounts match this filter.";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function List({
  accounts,
  institutions,
  activeChips,
  search,
  sort,
  showArchived,
  expandedIds,
  onToggle,
  onAddAccount,
}: ListProps) {
  const instMap = new Map(institutions.map((i) => [i.id, i]));

  // 1. Archive filter
  const visible = accounts.filter((a) => showArchived || !a.is_archived);

  // 2. No accounts at all (not even archived)
  if (accounts.filter((a) => !a.is_archived).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-body text-muted-foreground">
          No accounts yet. Add an account to start tracking.
        </p>
        <Button size="sm" onClick={onAddAccount}>
          Add account
        </Button>
      </div>
    );
  }

  // 3. Chip + search filter
  const filtered = visible.filter((a) => {
    const inst = a.institution_id != null ? instMap.get(a.institution_id) : undefined;
    return matchesChips(a, activeChips) && matchesSearch(a, inst, search);
  });

  // 4. Zero filter matches
  if (filtered.length === 0) {
    const message = search
      ? "No accounts match this search."
      : emptyChipMessage(activeChips);
    return (
      <div className="py-12 text-center">
        <p className="text-body-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  // 5. Group and sort
  const groups = groupByInstitution(filtered, institutions);

  const sortedGroups = [...groups].sort((a, b) => {
    const aHasStale = a.accounts.some((acc) => stalenessState(acc) === "stale");
    const bHasStale = b.accounts.some((acc) => stalenessState(acc) === "stale");
    if (aHasStale !== bHasStale) return aHasStale ? -1 : 1;
    return a.institution.name.localeCompare(b.institution.name);
  });

  // ── File drag detection ───────────────────────────────────────────────────
  const [isFileDragging, setIsFileDragging] = useState(false);
  const dragCounter = useRef(0);

  function isFileTransfer(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!isFileTransfer(e)) return;
    e.preventDefault();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsFileDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!isFileTransfer(e)) return;
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsFileDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    if (isFileTransfer(e)) e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsFileDragging(false);
  }

  return (
    <div
      className="flex flex-col gap-6"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!isFileDragging && (
        <p className="-mb-3 px-4 text-body-sm text-muted-foreground inline-flex items-center gap-1.5">
          <UploadIcon className="size-3.5" aria-hidden="true" />
          Drop a PDF on a row to import positions — or click the upload icon.
        </p>
      )}

      {sortedGroups.map(({ institution, accounts: groupAccounts }) => {
        const sorted = sortWithStalePinned(groupAccounts, sort);
        return (
          <section key={institution.id}>
            <h2 className="mb-1 px-4 text-label font-medium text-muted-foreground uppercase tracking-wider">
              {institution.name}
            </h2>
            <div className="rounded-lg border border-border overflow-hidden">
              {sorted.map((account, i, arr) => (
                <div key={account.id} className="border-b border-border last:border-0">
                  <Row
                    account={account}
                    institution={institution}
                    institutions={institutions}
                    isExpanded={expandedIds.has(account.id)}
                    onToggle={onToggle}
                    isFileDragging={isFileDragging}
                    onFileDragEnd={() => {
                      dragCounter.current = 0;
                      setIsFileDragging(false);
                    }}
                    isFirstInGroup={i === 0}
                    isLastInGroup={i === arr.length - 1}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
