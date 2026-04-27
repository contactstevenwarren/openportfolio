"use client";

import {
  Avatar,
  AvatarFallback,
} from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Separator } from "@/app/components/ui/separator";
import { SidebarTrigger } from "@/app/components/ui/sidebar";
import { ThemeToggle } from "@/app/components/theme-toggle";

export function SiteHeader({ title }: { title?: string }) {
  return (
    <header className="bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {title ? (
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Account"
              className="rounded-full"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">OP</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Settings</DropdownMenuItem>
            <DropdownMenuItem disabled>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
