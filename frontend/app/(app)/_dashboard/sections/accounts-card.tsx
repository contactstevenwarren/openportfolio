import {
  Banknote,
  Briefcase,
  Building2,
  Coins,
  HeartPulse,
  Home,
  PiggyBank,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Provenance } from "@/app/lib/provenance";
import { formatPct, formatUsd, mockAccounts } from "../mocks";

const TYPE_ICON: Record<string, LucideIcon> = {
  Taxable: Briefcase,
  IRA: PiggyBank,
  "401(k)": Building2,
  HSA: HeartPulse,
  "Real estate": Home,
  Cash: Banknote,
  Alts: Coins,
};

function iconFor(type: string): LucideIcon {
  return TYPE_ICON[type] ?? Wallet;
}

export function AccountsCard() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Accounts</CardTitle>
        <CardDescription>Where the value sits</CardDescription>
        <CardAction>
          <a
            href="/legacy/accounts"
            className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            View all <span aria-hidden>&rarr;</span>
          </a>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {mockAccounts.map((account) => {
            const Icon = iconFor(account.type);
            return (
              <li
                key={account.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-sm truncate">{account.label}</span>
                  <span className="text-label text-muted-foreground">
                    {account.type}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <Provenance
                    source={account.freshness.source}
                    confidence={account.freshness.confidence}
                    capturedAt={account.freshness.capturedAt}
                  >
                    <span className="text-mono">{formatUsd(account.value)}</span>
                  </Provenance>
                  <span className="text-mono-sm text-muted-foreground">
                    {formatPct(account.pctOfNw)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
