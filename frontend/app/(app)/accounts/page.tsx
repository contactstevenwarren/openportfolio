"use client";

import { useState } from "react";
import { Header } from "./_accounts/header";
import { Filters, type ChipFilter, type SortKey } from "./_accounts/filters";
import { List } from "./_accounts/list";
import {
  mockAccounts,
  mockInstitutions,
  mockSnapshots,
  mockPositions,
  stalenessState,
} from "./_accounts/mocks";

export default function AccountsPage() {
  // ── Filter / sort state ──────────────────────────────────────────────────
  const [activeChips, setActiveChips] = useState<Set<ChipFilter>>(new Set());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("staleness");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ── Chip handlers ─────────────────────────────────────────────────────────
  function handleChipToggle(chip: ChipFilter) {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) {
        next.delete(chip);
      } else {
        next.add(chip);
      }
      return next;
    });
  }

  function handleClearChips() {
    setActiveChips(new Set());
  }

  // ── Expand toggle ─────────────────────────────────────────────────────────
  function handleToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ── Chip counts (active accounts only) ───────────────────────────────────
  const active = mockAccounts.filter((a) => !a.isArchived);
  const staleCnt    = active.filter((a) => stalenessState(a) === "stale").length;
  const agingCnt    = active.filter((a) => stalenessState(a) === "aging").length;
  const taxAdvCnt   = active.filter((a) => a.taxTreatment !== "taxable").length;
  const manualCnt   = active.filter((a) => a.isManual).length;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 lg:px-6">
      <Header
        accounts={mockAccounts}
        institutions={mockInstitutions}
      />

      <div className="mt-6">
        <Filters
          activeChips={activeChips}
          onChipToggle={handleChipToggle}
          onClearChips={handleClearChips}
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          showArchived={showArchived}
          onShowArchivedChange={setShowArchived}
          staleCnt={staleCnt}
          agingCnt={agingCnt}
          taxAdvCnt={taxAdvCnt}
          manualCnt={manualCnt}
        />
      </div>

      <div className="mt-4">
        <List
          accounts={mockAccounts}
          institutions={mockInstitutions}
          snapshots={mockSnapshots}
          positions={mockPositions}
          activeChips={activeChips}
          search={search}
          sort={sort}
          showArchived={showArchived}
          expandedIds={expandedIds}
          onToggle={handleToggle}
          onAddAccount={() => {
            // Programmatically trigger Add account — Header owns the Sheet trigger.
            // For mock purposes this is a no-op; in production it would open the Sheet.
          }}
        />
      </div>
    </div>
  );
}
