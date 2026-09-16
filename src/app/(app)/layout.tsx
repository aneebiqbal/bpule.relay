import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current";
import { isDemoMode } from "@/lib/ai/config";
import { createScoutStore } from "@/lib/store";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppRail } from "@/components/app-rail";
import { AppIdentifyWrapper } from "@/components/app-identify-wrapper";
import { AnalyticsProvider } from "@/components/analytics-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) {
    try {
      const supabase = await createServerSupabase();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        redirect("/login?error=no_workspace");
      }
    } catch {
      // Fall through to regular login redirect.
    }
    redirect("/login");
  }
  if (!user.profile) redirect("/onboarding");

  const store = await createScoutStore();
  const queue = await store.getQueue();

  let revenueIdentities: Array<{
    id: string;
    identityName: string;
    title: string | null;
    channel: string;
  }> = [];

  try {
    if (user.rep.role === "admin") {
      const identities = await store.listRevenueIdentitiesAdmin();
      revenueIdentities = identities
        .filter((identity) => identity.status === "active")
        .slice(0, 12)
        .map((identity) => ({
          id: identity.id,
          identityName: identity.identityName,
          title: identity.title,
          channel: identity.channel,
        }));
    } else {
      const identities = await store.listMyAssignedIdentities();
      revenueIdentities = identities.slice(0, 12).map((identity) => ({
        id: identity.id,
        identityName: identity.identityName,
        title: identity.title,
        channel: identity.channel,
      }));
    }
  } catch {
    revenueIdentities = [];
  }

  return (
    <>
      <AnalyticsProvider />
      <AppIdentifyWrapper
        userId={user.rep.id}
        orgId={user.organization.id}
        role={user.rep.role}
        plan={user.organization.plan}
      >
        <div className="min-h-dvh bg-bone lg:grid lg:grid-cols-[16rem_1fr]">
          <AppRail
            repName={user.rep.name}
            organizationName={user.organization.name}
            role={user.rep.role}
            calibrated={Boolean(user.profile)}
            demo={isDemoMode()}
            todaySends={queue.todaySends}
            dailyLimit={queue.dailyLimit}
            revenueIdentities={revenueIdentities}
          />
          <main className="mx-auto w-full max-w-6xl px-5 pt-6 pb-24 lg:px-8 lg:pt-8 lg:pb-8">
            {children}
          </main>
        </div>
      </AppIdentifyWrapper>
    </>
  );
}
