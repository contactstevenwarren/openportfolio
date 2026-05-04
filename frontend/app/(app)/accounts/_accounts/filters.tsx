"use client";

import { SearchIcon, ArrowUpDownIcon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/app/components/ui/dropdown-menu";

export type SortKey = "staleness" | "name" | "balance" | "lastUpdated";
export type ChipFilter = "stale" | "aging" | "tax-advantaged" | "manual";

type FiltersProps = {
  activeChips: Set<ChipFilter>;
  onChipToggle: (chip: ChipFilter) => void;
  onClearChips: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  staleCnt: number;
  agingCnt: number;
  taxAdvCnt: number;
  manualCnt: number;
};

const SORT_LABELS: Record<SortKey, string> = {
  staleness: "Staleness",
  name: "Name",
  balance: "Balance",
  lastUpdated: "Last updated",
};

const chipBase =
  "rounded-full px-3 py-1 text-body-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none whitespace-nowrap";
const chipInactive =
  "border border-border bg-background text-foreground hover:bg-muted";

export function Filters({
  activeChips,
  onChipToggle,
  onClearChips,
  search,
  onSearchChange,
  sort,
  onSortChange,
  showArchived,
  onShowArchivedChange,
  staleCnt,
  agingCnt,
  taxAdvCnt,
  manualCnt,
}: FiltersProps) {
  const allActive = activeChips.size === 0;

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      {/* Chip group */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {/* All */}
        <button
          type="button"
          onClick={onClearChips}
          className={`${chipBase} ${
            allActive
              ? "bg-foreground text-background"
              : chipInactive
          }`}
        >
          All
        </button>

        {/* Stale */}
        <button
          type="button"
          onClick={() => onChipToggle("stale")}
          className={`${chipBase} ${
            activeChips.has("stale")
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : chipInactive
          }`}
        >
          Stale{staleCnt > 0 ? ` (${staleCnt})` : ""}
        </button>

        {/* Aging */}
        <button
          type="button"
          onClick={() => onChipToggle("aging")}
          className={`${chipBase} ${
            activeChips.has("aging")
              ? "bg-warning/10 text-warning border border-warning/20"
              : chipInactive
          }`}
        >
          Aging{agingCnt > 0 ? ` (${agingCnt})` : ""}
        </button>

        {/* Tax-advantaged */}
        <button
          type="button"
          onClick={() => onChipToggle("tax-advantaged")}
          className={`${chipBase} ${
            activeChips.has("tax-advantaged")
              ? "bg-foreground/10 text-foreground border border-foreground/20"
              : chipInactive
          }`}
        >
          Tax-advantaged{taxAdvCnt > 0 ? ` (${taxAdvCnt})` : ""}
        </button>

        {/* Manual */}
        <button
          type="button"
          onClick={() => onChipToggle("manual")}
          className={`${chipBase} ${
            activeChips.has("manual")
              ? "bg-foreground/10 text-foreground border border-foreground/20"
              : chipInactive
          }`}
        >
          Manual{manualCnt > 0 ? ` (${manualCnt})` : ""}
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search accounts…"
          className="w-full max-w-xs rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Sort dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ArrowUpDownIcon className="size-4 mr-1.5" />
            {SORT_LABELS[sort]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(v) => onSortChange(v as SortKey)}
          >
            <DropdownMenuRadioItem value="staleness">
              Staleness (default)
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="balance">
              Balance (high to low)
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="lastUpdated">
              Last updated (oldest first)
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showArchived}
            onCheckedChange={onShowArchivedChange}
          >
            Show archived
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
