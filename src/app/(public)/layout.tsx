import type { ReactNode } from "react";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-canvas flex min-h-dvh flex-col bg-bone">
      <AnalyticsProvider />
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
