import Link from "next/link";
import { Camera, FileText, Pencil, type LucideIcon } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Provenance } from "@/app/lib/provenance";
import { mockActivity, type ActivityEvent } from "../mocks";

const KIND_ICON: Record<ActivityEvent["kind"], LucideIcon> = {
  snapshot: Camera,
  extraction: FileText,
  edit: Pencil,
};

// Compact relative-time string ("2h ago", "5d ago", "3w ago").
// Static — computed at render time from Date.now(). Good enough for v0.1.
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function ActivityCard() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Recent activity</CardTitle>
        <CardDescription>Last 5 events</CardDescription>
        <CardAction>
          <Link
            href="/legacy/positions"
            className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            View all <span aria-hidden>&rarr;</span>
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="relative flex flex-col">
          {/* faint vertical timeline rail behind the icons */}
          <span
            aria-hidden
            className="absolute left-[15px] top-3 bottom-3 w-px bg-border"
          />
          {mockActivity.map((event) => {
            const Icon = KIND_ICON[event.kind];
            return (
              <li
                key={event.id}
                className="relative flex items-center gap-3 py-2 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex-1 text-body-sm">{event.label}</span>
                <span className="shrink-0 text-label text-muted-foreground">
                  <Provenance source="activity" capturedAt={event.at}>
                    {relativeTime(event.at)}
                  </Provenance>
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
