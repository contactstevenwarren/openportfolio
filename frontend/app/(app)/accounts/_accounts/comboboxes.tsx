"use client";

// Shared comboboxes for the Add and Edit account forms. Kept in one file so
// both forms produce visually and behaviourally identical pickers.

import { useState } from "react";
import {
  ChevronsUpDownIcon,
  CheckIcon,
  PlusCircleIcon,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/app/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/app/components/ui/command";
import { cn } from "@/app/lib/utils";
import {
  type Institution,
  type AccountKind,
  ACCOUNT_KINDS,
  CUSTOM_KIND_DEFAULTS,
  MANUAL_INST_ID,
} from "./mocks";

// ── InstitutionCombobox ───────────────────────────────────────────────────────

type InstComboboxProps = {
  institutions: Institution[];
  value: string | null;
  onChange: (id: string, name: string) => void;
};

export function InstitutionCombobox({ institutions, value, onChange }: InstComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [localCreated, setLocalCreated] = useState<Institution[]>([]);

  const manualInst = institutions.find((i) => i.id === MANUAL_INST_ID);
  const mainList = [
    ...institutions.filter((i) => i.id !== MANUAL_INST_ID),
    ...localCreated,
  ];

  const q = search.trim().toLowerCase();
  const filtered = q ? mainList.filter((i) => i.name.toLowerCase().includes(q)) : mainList;
  const hasExactMatch = mainList.some((i) => i.name.toLowerCase() === q);
  const showCreate = q.length > 0 && !hasExactMatch;

  const allInsts = [...institutions, ...localCreated];
  const selectedName = value ? (allInsts.find((i) => i.id === value)?.name ?? null) : null;

  function handleSelect(inst: Institution) {
    onChange(inst.id, inst.name);
    setOpen(false);
    setSearch("");
  }

  function handleCreate() {
    const name = search.trim();
    const id = `inst-local-${Date.now()}`;
    const inst: Institution = { id, name };
    setLocalCreated((prev) => [...prev, inst]);
    onChange(id, name);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!selectedName && "text-muted-foreground")}>
            {selectedName ?? "Select institution…"}
          </span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search or create…" value={search} onValueChange={setSearch} />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <CommandEmpty>No institutions found.</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((inst) => (
                  <CommandItem key={inst.id} value={inst.id} onSelect={() => handleSelect(inst)}>
                    <CheckIcon className={cn("mr-2 size-4", value === inst.id ? "opacity-100" : "opacity-0")} />
                    {inst.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <>
                {filtered.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  <CommandItem value="__create__" onSelect={handleCreate}>
                    <PlusCircleIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                    Create &ldquo;{search.trim()}&rdquo; as new institution
                  </CommandItem>
                </CommandGroup>
              </>
            )}
            {!q && manualInst && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    key={manualInst.id}
                    value={manualInst.id}
                    onSelect={() => handleSelect(manualInst)}
                  >
                    <CheckIcon className={cn("mr-2 size-4", value === manualInst.id ? "opacity-100" : "opacity-0")} />
                    {manualInst.name}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── AccountKindCombobox ───────────────────────────────────────────────────────

type KindComboboxProps = {
  value: AccountKind | null;
  onChange: (kind: AccountKind) => void;
};

export function AccountKindCombobox({ value, onChange }: KindComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [localKinds, setLocalKinds] = useState<AccountKind[]>([]);

  // Include the current value if it's a custom (non-template) kind, so it
  // appears in the dropdown alongside the templates.
  const valueIsTemplate = value
    ? ACCOUNT_KINDS.some((k) => k.id === value.id)
    : true;
  const customFromValue = !valueIsTemplate && value ? [value] : [];

  const allKinds = [...ACCOUNT_KINDS, ...localKinds, ...customFromValue];
  const q = search.trim().toLowerCase();
  const filtered = q ? allKinds.filter((k) => k.label.toLowerCase().includes(q)) : allKinds;
  const hasExactMatch = allKinds.some((k) => k.label.toLowerCase() === q);
  const showCreate = q.length > 0 && !hasExactMatch;

  function handleSelect(kind: AccountKind) {
    onChange(kind);
    setOpen(false);
    setSearch("");
  }

  function handleCreate() {
    const label = search.trim();
    const id = `k-local-${Date.now()}`;
    const kind: AccountKind = { id, label, ...CUSTOM_KIND_DEFAULTS };
    setLocalKinds((prev) => [...prev, kind]);
    onChange(kind);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value?.label ?? "Select account kind…"}
          </span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search or create…" value={search} onValueChange={setSearch} />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <CommandEmpty>No kinds found.</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((kind) => (
                  <CommandItem key={kind.id} value={kind.id} onSelect={() => handleSelect(kind)}>
                    <CheckIcon
                      className={cn("mr-2 size-4", value?.id === kind.id ? "opacity-100" : "opacity-0")}
                    />
                    {kind.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <>
                {filtered.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  <CommandItem value="__create__" onSelect={handleCreate}>
                    <PlusCircleIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                    Create &ldquo;{search.trim()}&rdquo; as new kind
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── findMatchingKind ──────────────────────────────────────────────────────────
// Given an account's (accountType, taxTreatment, isManual) tuple, return the
// matching template kind. If no template matches exactly, synthesize a "Custom"
// AccountKind so the combobox can display it.

export function findMatchingKind(
  accountType: AccountKind["accountType"],
  taxTreatment: AccountKind["taxTreatment"],
  isManual: boolean,
  stalenessThresholdDays: number
): AccountKind {
  const match = ACCOUNT_KINDS.find(
    (k) =>
      k.accountType === accountType &&
      k.taxTreatment === taxTreatment &&
      k.isManual === isManual
  );
  if (match) return match;
  return {
    id: "k-current-custom",
    label: "Custom",
    accountType,
    taxTreatment,
    isManual,
    defaultStaleness: stalenessThresholdDays,
  };
}
