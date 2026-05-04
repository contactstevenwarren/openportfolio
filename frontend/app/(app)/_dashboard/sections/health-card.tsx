"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { Account, AllocationResult } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import {
  daysSince,
  formatUsd,
  stalenessState,
} from "@/app/(app)/accounts/_accounts/mocks";

// ── Type label map ────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  brokerage: "Brokerage",
  bank: "Bank",
  crypto: "Crypto",
  real_estate: "Real estate",
  private: "Private",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isStaleOrNew(a: Account): boolean {
  return a.last_updated_at === null || stalenessState(a) === "stale";
}

function sortStaleFirst(a: Account, b: Account): number {
  if (a.last_updated_at === null && b.last_updated_at !== null) return -1;
  if (a.last_updated_at !== null && b.last_updated_at === null) return 1;
  if (a.last_updated_at === null && b.last_updated_at === null) return 0;
  return daysSince(a.last_updated_at!) - daysSince(b.last_updated_at!);
}

// ── HealthCard ────────────────────────────────────────────────────────────────

export function HealthCard() {
  const {
    data: accounts,
    error: accountsError,
    isLoading: accountsLoading,
  } = useSWR<Account[]>("/api/accounts", api.accounts, {
    revalidateOnFocus: false,
  });

  const {
    data: allocation,
    error: allocError,
    isLoading: allocLoading,
  } = useSWR<AllocationResult>("/api/allocation", api.allocation, {
    revalidateOnFocus: false,
  });

  const active = accounts?.filter((a) => !a.is_archived) ?? [];
  const staleRows = active.filter(isStaleOrNew).sort(sortStaleFirst);
  const unclassified = allocation?.unclassified_tickers ?? [];

  const allClean =
    !accountsLoading && !allocLoading &&
    !accountsError && !allocError &&
    staleRows.length === 0 && unclassified.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Data health</CardTitle>
        <CardDescription>What needs cleanup</CardDescription>
      </CardHeader>
      <CardContent>
        {allClean ? (
          <p className="text-body-sm text-muted-foreground">
            All clean. Nothing to refresh or classify.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border lg:flex-row lg:divide-x lg:divide-y-0">

            {/* ── Section 1: Stale accounts ──────────────────────────────── */}
            <div className="flex flex-col gap-2 pb-4 lg:flex-1 lg:pb-0 lg:pr-6">
              <div className="flex items-center justify-between">
                <p className="text-label font-medium text-foreground">
                  Stale accounts
                  {staleRows.length > 0 && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({staleRows.length})
                    </span>
                  )}
                </p>
                {staleRows.length > 0 && (
                  <Link
                    href="/accounts"
                    className="text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                  >
                    View all <span aria-hidden>&rarr;</span>
                  </Link>
                )}
              </div>

              {accountsLoading ? (
                <p className="text-body-sm text-muted-foreground">Loading accounts…</p>
              ) : accountsError ? (
                <p className="text-body-sm text-destructive">Couldn&apos;t load accounts.</p>
              ) : staleRows.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">
                  All accounts have a recent statement.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {staleRows.slice(0, 5).map((account) => {
                    const neverUpdated = account.last_updated_at === null;
                    const ageDays = neverUpdated ? null : daysSince(account.last_updated_at!);
                    const institution = account.institution_name ?? "Manual / Other";
                    const typeLabel = TYPE_LABEL[account.type] ?? account.type;
                    return (
                      <li
                        key={account.id}
                        className="flex min-w-0 items-center gap-3 py-2 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm">
                            <span className="font-medium text-foreground">
                              {account.label}
                            </span>
                            <span className="text-muted-foreground">
                              {" "}· {institution} / {typeLabel}
                            </span>
                          </p>
                        </div>
                        {neverUpdated ? (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground">
                            New
                          </span>
                        ) : (
                          <span className="shrink-0 tabular-nums text-label font-medium text-warning">
                            {ageDays}d
                          </span>
                        )}
                        <div className="shrink-0 whitespace-nowrap font-mono tabular-nums text-body-sm">
                          {formatUsd(account.balance)}
                        </div>
                      </li>
                    );
                  })}
                  {staleRows.length > 5 && (
                    <li className="pt-2 text-body-sm text-muted-foreground">
                      +{staleRows.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* ── Section 2: Unclassified positions ─────────────────────── */}
            <div className="flex flex-col gap-2 pt-4 lg:flex-1 lg:pl-6 lg:pt-0">
              <div className="flex items-center justify-between">
                <p className="text-label font-medium text-foreground">
                  Unclassified positions
                  {unclassified.length > 0 && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({unclassified.length})
                    </span>
                  )}
                </p>
                {unclassified.length > 0 && (
                  <Link
                    href="/legacy/classifications"
                    className="text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                  >
                    Fix <span aria-hidden>&rarr;</span>
                  </Link>
                )}
              </div>

              {allocLoading ? (
                <p className="text-body-sm text-muted-foreground">Loading…</p>
              ) : allocError ? (
                <p className="text-body-sm text-destructive">Couldn&apos;t load allocation.</p>
              ) : unclassified.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">
                  All positions classified.
                </p>
              ) : (
                <p className="text-body-sm text-foreground font-mono">
                  {unclassified.slice(0, 10).join(", ")}
                  {unclassified.length > 10 && (
                    <span className="font-sans text-muted-foreground">
                      {" "}+{unclassified.length - 10} more
                    </span>
                  )}
                </p>
              )}
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}
