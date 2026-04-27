import { AppSidebar } from "@/app/components/app-sidebar";
import { SiteHeader } from "@/app/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/app/components/ui/sidebar";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
