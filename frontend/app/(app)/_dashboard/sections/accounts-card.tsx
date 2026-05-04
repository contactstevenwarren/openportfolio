"use client";

import useSWR from "swr";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { Account } from "@/app/lib/api";
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
  // Never-updated first
  if (a.last_updated_at === null && b.last_updated_at !== null) return -1;
  if (a.last_updated_at !== null && b.last_updated_at === null) return 1;
  if (a.last_updated_at === null && b.last_updated_at === null) return 0;
  // Then oldest-first
  return daysSince(a.last_updated_at!) - daysSince(b.last_updated_at!);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AccountsCard() {
  const { data: accounts, error, isLoading } = useSWR<Account[]>(
    "/api/accounts",
    api.accounts,
    { revalidateOnFocus: false }
  );

  const active = accounts?.filter((a) => !a.is_archived) ?? [];
  const staleRows = active.filter(isStaleOrNew).sort(sortStaleFirst);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Stale accounts</CardTitle>
        <CardDescription>
          Accounts past their update threshold or never updated — oldest first
        </CardDescription>
        <CardAction>
          <a
            href="/accounts"
            className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            View all {active.length} <span aria-hidden>&rarr;</span>
          </a>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-body-sm text-muted-foreground">Loading accounts…</p>
        ) : error ? (
          <p className="text-body-sm text-destructive">Couldn&apos;t load accounts.</p>
        ) : staleRows.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            All accounts have a recent statement. Nothing to refresh.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {staleRows.map((account) => (
              <StaleAccountRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function StaleAccountRow({ account }: { account: Account }) {
  const neverUpdated = account.last_updated_at === null;
  const ageDays = neverUpdated ? null : daysSince(account.last_updated_at!);
  const institution = account.institution_name ?? "Manual / Other";
  const typeLabel = TYPE_LABEL[account.type] ?? account.type;

  return (
    <li className="flex min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm">
          <span className="font-medium text-foreground">{account.label}</span>
          <span className="text-muted-foreground">
            {" "}· {institution} / {typeLabel}
          </span>
        </p>
      </div>

      {/* Age pill */}
      {neverUpdated ? (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground">
          New
        </span>
      ) : (
        <span className="shrink-0 tabular-nums text-label font-medium text-warning">
          {ageDays}d
        </span>
      )}

      {/* Balance */}
      <div className="shrink-0 whitespace-nowrap font-mono tabular-nums text-body-sm">
        {formatUsd(account.balance)}
      </div>
    </li>
  );
}
