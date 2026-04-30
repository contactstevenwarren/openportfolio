import { SandboxProvider } from "@/app/lib/sandbox-context";
import { AccountsCard } from "./_dashboard/sections/accounts-card";
import { ActivityCard } from "./_dashboard/sections/activity-card";
import { DonutCard } from "./_dashboard/sections/donut-card";
import { ExposuresCard } from "./_dashboard/sections/exposures-card";
import { HealthCard } from "./_dashboard/sections/health-card";
import { HeroSection } from "./_dashboard/sections/hero";
import { HoldingsCard } from "./_dashboard/sections/holdings-card";
import { SandboxCard } from "./_dashboard/sections/sandbox-card";
import { TimelineCard } from "./_dashboard/sections/timeline-card";

export default function HomePage() {
  return (
    <SandboxProvider>
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-4 px-4 md:gap-6 lg:px-6 @lg/main:grid-cols-12">
        <div className="@lg/main:col-span-12">
          <HeroSection />
        </div>

        <div className="@lg/main:col-span-7">
          <DonutCard />
        </div>
        <div className="@lg/main:col-span-5">
          <SandboxCard />
        </div>

        <div className="@lg/main:col-span-12">
          <TimelineCard />
        </div>

        <div className="@lg/main:col-span-8">
          <HoldingsCard />
        </div>
        <div className="@lg/main:col-span-4">
          <ExposuresCard />
        </div>

        <div className="@lg/main:col-span-5">
          <ActivityCard />
        </div>
        <div className="@lg/main:col-span-3">
          <AccountsCard />
        </div>
        <div className="@lg/main:col-span-4">
          <HealthCard />
        </div>
      </div>
    </SandboxProvider>
  );
}
