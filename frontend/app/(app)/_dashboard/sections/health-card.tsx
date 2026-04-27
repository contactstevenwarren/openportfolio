import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Provenance } from "@/app/lib/provenance";
import { mockHealth } from "../mocks";

type HealthRow = {
  key: string;
  label: string;
  href: string;
} & (
  | { kind: "count"; count: number }
  | { kind: "age"; text: string }
);

const ROWS: HealthRow[] = [
  {
    key: "stale-prices",
    kind: "count",
    label: "Stale prices",
    count: mockHealth.stalePrices,
    href: "/legacy/positions",
  },
  {
    key: "untagged-tickers",
    kind: "count",
    label: "Untagged tickers",
    count: mockHealth.untaggedTickers,
    href: "/legacy/classifications",
  },
  {
    key: "missing-classifications",
    kind: "count",
    label: "Missing classifications",
    count: mockHealth.missingClassifications,
    href: "/legacy/classifications",
  },
  {
    key: "last-snapshot",
    kind: "age",
    label: "Last snapshot",
    text: mockHealth.lastSnapshotAge,
    href: "/legacy/positions",
  },
];

function rowIcon(row: HealthRow): { Icon: LucideIcon; tone: string } {
  if (row.kind === "age") {
    return { Icon: Clock, tone: "text-muted-foreground" };
  }
  if (row.count > 0) {
    return { Icon: AlertCircle, tone: "text-amber-500" };
  }
  return { Icon: CheckCircle2, tone: "text-emerald-500" };
}

export function HealthCard() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Data health</CardTitle>
        <CardDescription>What needs cleanup</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {ROWS.map((row) => {
            const { Icon, tone } = rowIcon(row);
            const value = row.kind === "count" ? row.count : row.text;
            return (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <Icon className={`size-4 shrink-0 ${tone}`} aria-hidden />
                  <span className="flex-1 text-body-sm">{row.label}</span>
                  <span className="shrink-0 text-mono-sm tabular-nums text-foreground">
                    <Provenance source="health-counts">{value}</Provenance>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
