import type { ReactNode } from "react";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-footer";
import { AnalyticsProvider } from "@/components/analytics-provider";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-canvas flex min-h-dvh flex-col bg-bone">
      <AnalyticsProvider />
      <PublicNav />
      <main className="flex-1 pt-[4.5rem]">{children}</main>
      <PublicFooter />
    </div>
  );
}
