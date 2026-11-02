import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current";
import { getAuthContext } from "@/lib/auth/organization";
import { isDemoMode } from "@/lib/ai/config";
import { createScoutStore } from "@/lib/store";
import { getAuthProvider } from "@/lib/auth/provider";
import { RelayAppShell } from "@/components/shell/relay-app-shell";
import { AppIdentifyWrapper } from "@/components/app-identify-wrapper";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { ActiveIdentityProvider } from "@/components/workspace/active-identity-provider";
import { ACTIVE_IDENTITY_COOKIE, isIdentityId, type WorkspaceIdentity } from "@/lib/workspace/active-identity";
import { loadSidebarCounts, type SidebarCounts } from "@/lib/operations/sidebar-counts";

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
      const auth = await getAuthProvider();
      const { user: sessionUser } = await auth.getSession();
      if (sessionUser) {
        redirect("/login?error=no_workspace");
      }
    } catch {
      // Fall through to regular login redirect.
    }
    redirect("/login");
  }
  if (!user.profile) redirect("/onboarding");

  // The store, the auth context and the identity list are independent: run
  // them concurrently instead of as a sequential waterfall (BUG-001).
  const [store, authCtx] = await Promise.all([
    createScoutStore(),
    getAuthContext().catch(() => null),
  ])

  const [queue, revenueIdentities, sidebarCounts] = await Promise.all([
    store.getQueue(),
    (async (): Promise<WorkspaceIdentity[]> => {
      try {
        const identities = authCtx?.isOwner || authCtx?.isAdmin
          ? await store.listRevenueIdentitiesAdmin()
          : await store.listMyAssignedIdentities();
        return identities
          .filter((identity) => identity.status === "active")
          .map((identity) => ({
            id: identity.id,
            identityName: identity.identityName,
            title: identity.title,
            channel: identity.channel,
            profileId: identity.profileId,
          }));
      } catch {
        return [];
      }
    })(),
    (async (): Promise<SidebarCounts> => {
      if (isDemoMode()) return { inboxNeedsReply: null, actionableTasks: null }
      try {
        return await loadSidebarCounts(store.getSupabaseClient(), {
          orgId: user.organization.id,
          repId: user.rep.id,
          timeZone: user.organization.timezone ?? "UTC",
        });
      } catch {
        // Badges are optional chrome: never block the shell on them.
        return { inboxNeedsReply: null, actionableTasks: null };
      }
    })(),
  ]);

  const cookieStore = await cookies();
  const savedIdentityId = cookieStore.get(ACTIVE_IDENTITY_COOKIE)?.value ?? null;
  const initialActiveId = isIdentityId(savedIdentityId) && revenueIdentities.some((identity) => identity.id === savedIdentityId)
    ? savedIdentityId
    : revenueIdentities[0]?.id ?? null;

  return (
    <>
      <AnalyticsProvider />
      <AppIdentifyWrapper
        userId={user.rep.id}
        orgId={user.organization.id}
        role={user.rep.role}
        plan={user.organization.plan}
      >
        <ActiveIdentityProvider identities={revenueIdentities} initialActiveId={initialActiveId}>
          <RelayAppShell
            organizationName={user.organization.name}
            role={user.rep.role}
            isOwner={authCtx?.isOwner ?? false}
            isAdmin={authCtx?.isAdmin ?? false}
            isManager={authCtx?.isManager ?? false}
            demo={isDemoMode()}
            todaySends={queue.todaySends}
            dailyLimit={queue.dailyLimit}
            sidebarCounts={sidebarCounts}
          >
            {children}
          </RelayAppShell>
        </ActiveIdentityProvider>
      </AppIdentifyWrapper>
    </>
  );
}
