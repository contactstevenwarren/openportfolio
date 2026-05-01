import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  STALE_THRESHOLD_DAYS,
  daysSince,
  formatUsd,
  mockAccounts,
} from "../mocks";

type InstitutionRow = {
  institution: string;
  total: number;
  count: number;
  hasStale: boolean;
};

function buildRollup(): InstitutionRow[] {
  const map = new Map<string, InstitutionRow>();
  for (const account of mockAccounts) {
    const row = map.get(account.institution) ?? {
      institution: account.institution,
      total: 0,
      count: 0,
      hasStale: false,
    };
    row.total += account.value;
    row.count += 1;
    if (account.freshness.capturedAt && daysSince(account.freshness.capturedAt) > STALE_THRESHOLD_DAYS) {
      row.hasStale = true;
    }
    map.set(account.institution, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function AccountsCard() {
  const rows = buildRollup();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Accounts</CardTitle>
        <CardDescription>By institution</CardDescription>
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
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.institution}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="text-body-sm truncate">{row.institution}</span>
                {row.hasStale && (
                  <span className="text-warning text-label" aria-label="stale data">
                    ●
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-label text-muted-foreground">
                  {row.count} {row.count === 1 ? "acc" : "acc"}
                </span>
                <span className="text-mono">{formatUsd(row.total)}</span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
