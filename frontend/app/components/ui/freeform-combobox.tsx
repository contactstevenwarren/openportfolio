"use client";

// Generic free-form combobox. Shows a list of suggestions but always
// allows the user to type any value — "Create X as new value" appears
// when no suggestion matches exactly. Same Popover + Command pattern
// as AccountKindCombobox; operates on plain strings instead of objects.
//
// Use whenever a field should be free-form but guided (e.g. liability
// kind, account type fallbacks, tag fields).

import { useState } from "react";
import { ChevronsUpDownIcon, CheckIcon, PlusCircleIcon } from "lucide-react";
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

export type FreeformComboboxProps = {
  /** Current value (empty string = nothing selected). */
  value: string;
  onChange: (value: string) => void;
  /** Preset suggestions shown before the user types. */
  suggestions: string[];
  placeholder?: string;
  createLabel?: string;
};

export function FreeformCombobox({
  value,
  onChange,
  suggestions,
  placeholder = "Select or type…",
  createLabel = "new value",
}: FreeformComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Include current value if it isn't already a suggestion, so it appears
  // in the list when the popover opens after a custom value was set.
  const allOptions = value && !suggestions.includes(value)
    ? [...suggestions, value]
    : suggestions;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? allOptions.filter((s) => s.toLowerCase().includes(q))
    : allOptions;
  const hasExactMatch = allOptions.some((s) => s.toLowerCase() === q);
  const showCreate = q.length > 0 && !hasExactMatch;

  function handleSelect(v: string) {
    onChange(v);
    setOpen(false);
    setSearch("");
  }

  function handleCreate() {
    const v = search.trim();
    onChange(v);
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
            {value || placeholder}
          </span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <CommandEmpty>No suggestions found.</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => handleSelect(option)}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 size-4",
                        value === option ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {option}
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
                    Use &ldquo;{search.trim()}&rdquo; as {createLabel}
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
