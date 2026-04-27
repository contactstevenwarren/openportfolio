"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Palette, Archive } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/app/components/ui/sidebar";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/brand", label: "Brand", icon: Palette },
];

const reference = [
  { href: "/legacy", label: "Legacy", icon: Archive },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <span
                  aria-hidden
                  className="bg-foreground text-background flex h-8 w-8 items-center justify-center rounded-md"
                >
                  <span className="border-background flex h-5 w-5 items-center justify-center rounded-full border-[2.5px]">
                    <span className="bg-accent h-2 w-2 rounded-full" />
                  </span>
                </span>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="font-semibold tracking-tight">
                    OpenPortfolio
                  </span>
                  <span className="text-muted-foreground text-xs">
                    See what you own
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Reference</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reference.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="text-muted-foreground text-xs px-2 py-1">
          v0.2 · alpha
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
