import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Provenance } from "@/app/lib/provenance";
import {
  STALE_THRESHOLD_DAYS,
  daysSince,
  formatUsd,
  getStaleAccounts,
  mockAccounts,
} from "../mocks";

type AccountRow = (typeof mockAccounts)[number];

function formatStatementDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function AccountsCard() {
  const rows = getStaleAccounts(mockAccounts);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Stale accounts</CardTitle>
        <CardDescription>
          No statement upload in over {STALE_THRESHOLD_DAYS} days — oldest first
        </CardDescription>
        <CardAction>
          <a
            href="/accounts"
            className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            View all {mockAccounts.length} <span aria-hidden>&rarr;</span>
          </a>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            All accounts have a recent statement. Nothing to refresh.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((account) => (
              <StaleAccountRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StaleAccountRow({ account }: { account: AccountRow }) {
  const capturedAt = account.freshness.capturedAt!;
  const ageDays = daysSince(capturedAt);

  return (
    <li className="flex min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm">
          <span className="font-medium text-foreground">{account.label}</span>
          <span className="text-muted-foreground">
            {" "}
            · {account.institution} / {account.type}
          </span>
        </p>
      </div>
      <span
        className="shrink-0 tabular-nums text-label font-medium text-warning"
        title={`Statement as of ${formatStatementDate(capturedAt)}`}
      >
        {ageDays}d
      </span>
      <div className="shrink-0 whitespace-nowrap text-mono tabular-nums">
        <Provenance
          source={account.freshness.source}
          confidence={account.freshness.confidence}
          capturedAt={capturedAt}
        >
          {formatUsd(account.value)}
        </Provenance>
      </div>
    </li>
  );
}
