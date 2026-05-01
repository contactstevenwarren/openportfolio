import { SandboxProvider } from "@/app/lib/sandbox-context";
import { AccountsCard } from "./_dashboard/sections/accounts-card";
import { DonutCard } from "./_dashboard/sections/donut-card";
import { HealthCard } from "./_dashboard/sections/health-card";
import { HeroSection } from "./_dashboard/sections/hero";
import { SandboxCard } from "./_dashboard/sections/sandbox-card";

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

        <div className="@lg/main:col-span-7">
          <AccountsCard />
        </div>
        <div className="@lg/main:col-span-5">
          <HealthCard />
        </div>
      </div>
    </SandboxProvider>
  );
}
