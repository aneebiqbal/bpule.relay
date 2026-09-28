import type { ReactNode } from "react";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { LandingNav } from "@/components/landing/landing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Landing route group — the dark ink canvas.
 * Root tokens are already dark (matching the product), so this layout
 * simply opts out of the light `.public-canvas` used by other pages.
 */
export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing-canvas flex min-h-dvh flex-col">
      <AnalyticsProvider />
      <LandingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
