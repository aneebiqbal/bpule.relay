import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current";
import { getAuthContext } from "@/lib/auth/organization";
import { isDemoMode } from "@/lib/ai/config";
import { createScoutStore } from "@/lib/store";
import { getAuthProvider } from "@/lib/auth/provider";
import { V4AppShell } from "@/components/v4/v4-app-shell";
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

  // One workable-identity read feeds both the profile switcher and the sidebar
  // badge scope (primary + active coverage), so the badge and /chats agree.
  const identityDataPromise = (async (): Promise<{
    identities: WorkspaceIdentity[]
    coveredIdentityIds: string[]
  }> => {
    try {
      const workable = authCtx?.isOwner || authCtx?.isAdmin
        ? await store.listRevenueIdentitiesAdmin()
        : await store.listMyWorkableIdentities();
      const active = workable.filter((identity) => identity.status === "active")
      const profileIds = [...new Set(active.map((identity) => identity.profileId).filter((id): id is string => Boolean(id)))]
      const personIdByProfile = new Map<string, string>()
      const personNameById = new Map<string, string>()
      if (profileIds.length > 0) {
        const { data: personRows } = await store
          .getSupabaseClient()
          .from('profiles')
          .select('id, person_id, display_name, full_name, label')
          .eq('organization_id', authCtx?.orgId ?? user.organization.id)
          .in('id', profileIds)
          .limit(500)
        for (const row of (personRows ?? []) as Array<{
          id: string
          person_id: string | null
          display_name: string | null
          full_name: string | null
          label: string | null
        }>) {
          personIdByProfile.set(row.id, row.person_id ?? row.id)
          const name = row.display_name ?? row.full_name ?? row.label
          if (name) personNameById.set(row.person_id ?? row.id, name)
        }
      }
      return {
        identities: active.map((identity) => {
          const personId = identity.profileId ? (personIdByProfile.get(identity.profileId) ?? identity.profileId) : null
          return {
            id: identity.id,
            identityName: identity.identityName,
            title: identity.title,
            channel: identity.channel,
            profileId: identity.profileId,
            personId,
            personName: personId ? (personNameById.get(personId) ?? null) : null,
          }
        }),
        coveredIdentityIds: workable
          .filter((identity) => (identity as { access?: string }).access === "coverage")
          .map((identity) => identity.id),
      };
    } catch {
      return { identities: [], coveredIdentityIds: [] };
    }
  })();

  const [queue, identityData, sidebarCounts] = await Promise.all([
    store.getQueue(),
    identityDataPromise,
    (async (): Promise<SidebarCounts> => {
      if (isDemoMode()) return { inboxNeedsReply: null, actionableTasks: null }
      try {
        const { identities, coveredIdentityIds } = await identityDataPromise
        return await loadSidebarCounts(store.getSupabaseClient(), {
          orgId: user.organization.id,
          repId: user.rep.id,
          timeZone: user.organization.timezone ?? "UTC",
          executableIdentities: identities.map((identity) => ({
            id: identity.id,
            profileId: identity.profileId,
          })),
          coveredIdentityIds,
          orgWide: Boolean(authCtx?.isOwner || authCtx?.isAdmin),
        });
      } catch {
        // Badges are optional chrome: never block the shell on them.
        return { inboxNeedsReply: null, actionableTasks: null };
      }
    })(),
  ]);
  const revenueIdentities = identityData.identities;

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
          <V4AppShell
            organizationName={user.organization.name}
            repName={user.rep.name}
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
          </V4AppShell>
        </ActiveIdentityProvider>
      </AppIdentifyWrapper>
    </>
  );
}
