"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/app/lib/api";
import { Header } from "./_accounts/header";
import { Filters, type ChipFilter, type SortKey } from "./_accounts/filters";
import { List } from "./_accounts/list";
import { stalenessState } from "./_accounts/mocks";

export default function AccountsPage() {
  // ── Remote data ───────────────────────────────────────────────────────────
  const {
    data: accounts = [],
    error: accountsError,
    isLoading: accountsLoading,
  } = useSWR("/api/accounts", api.accounts);
  const {
    data: institutions = [],
    error: institutionsError,
    isLoading: institutionsLoading,
  } = useSWR("/api/institutions", api.institutions);

  const isLoading = accountsLoading || institutionsLoading;
  const error = accountsError || institutionsError;

  // ── Filter / sort state ──────────────────────────────────────────────────
  const [activeChips, setActiveChips] = useState<Set<ChipFilter>>(new Set());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("staleness");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

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
  function handleToggle(id: number) {
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

  // ── Loading / error states ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 lg:px-6">
        <p className="text-body-sm text-destructive py-12 text-center">
          {error.message}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 lg:px-6">
        <p className="text-body-sm text-muted-foreground py-12 text-center">
          Loading…
        </p>
      </div>
    );
  }

  // ── Chip counts (active accounts only) ───────────────────────────────────
  const active = accounts.filter((a) => !a.is_archived);
  const staleCnt  = active.filter((a) => stalenessState(a) === "stale").length;
  const agingCnt  = active.filter((a) => stalenessState(a) === "aging").length;
  const taxAdvCnt = active.filter((a) => a.tax_treatment !== "taxable").length;
  const manualCnt = active.filter((a) => a.is_manual).length;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 lg:px-6">
      <Header
        accounts={accounts}
        institutions={institutions}
        addOpen={addOpen}
        onAddOpenChange={setAddOpen}
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
          accounts={accounts}
          institutions={institutions}
          activeChips={activeChips}
          search={search}
          sort={sort}
          showArchived={showArchived}
          expandedIds={expandedIds}
          onToggle={handleToggle}
          onAddAccount={() => setAddOpen(true)}
        />
      </div>
    </div>
  );
}
