import { AlertCircle, CheckCircle2, Database, Target } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Provenance } from "@/app/lib/provenance";
import { formatPct, mockDriftStatus, type DriftStatus } from "../mocks";

type View = {
  Icon: typeof AlertCircle;
  iconClass: string;
  headline: string;
  sub: React.ReactNode;
  ctaLabel: string;
  ctaHref: string;
};

function viewFor(status: DriftStatus): View {
  switch (status.kind) {
    case "rebalance":
      return {
        Icon: AlertCircle,
        iconClass: "text-amber-500",
        headline: "Rebalance recommended",
        sub: (
          <>
            Your largest class is off target by{" "}
            <Provenance source="drift-engine">
              {formatPct(status.worstGapPct, { signed: true })}
            </Provenance>
          </>
        ),
        ctaLabel: "Open rebalance",
        ctaHref: "/legacy/rebalance",
      };
    case "on-track":
      return {
        Icon: CheckCircle2,
        iconClass: "text-emerald-500",
        headline: "On track",
        sub: "All classes within tolerance (±1%)",
        ctaLabel: "View targets",
        ctaHref: "/legacy/targets",
      };
    case "no-targets":
      return {
        Icon: Target,
        iconClass: "text-muted-foreground",
        headline: "No targets set",
        sub: "Set targets to track drift over time",
        ctaLabel: "Set targets",
        ctaHref: "/legacy/targets",
      };
    case "no-data":
      return {
        Icon: Database,
        iconClass: "text-muted-foreground",
        headline: "Not enough data",
        sub: "Add at least one snapshot with positions to see drift",
        ctaLabel: "Import positions",
        ctaHref: "/legacy/positions",
      };
  }
}

export function DriftStatusCard() {
  const { Icon, iconClass, headline, sub, ctaLabel, ctaHref } = viewFor(mockDriftStatus);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Drift status</CardTitle>
        <CardDescription>Vs. target allocation</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-[160px] flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-5 shrink-0 ${iconClass}`} aria-hidden />
          <div className="text-h2 leading-tight">{headline}</div>
        </div>
        <div className="text-body text-muted-foreground">{sub}</div>
        <div className="mt-auto pt-2">
          <a
            href={ctaHref}
            className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            {ctaLabel} <span aria-hidden>&rarr;</span>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
