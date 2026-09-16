import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/current";
import { createScoutStore } from "@/lib/store";
import { RelayOnboardingExperience } from "@/components/onboarding/relay-onboarding-experience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Onboarding - Relay",
  description: "Assemble Relay around your role, goals, and first action.",
};

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile) redirect("/dashboard");

  let initialIdentityCount = 0;

  try {
    const store = await createScoutStore();
    if (user.rep.role === "admin") {
      initialIdentityCount = (await store.listRevenueIdentitiesAdmin()).length;
    } else {
      initialIdentityCount = (await store.listMyAssignedIdentities()).length;
    }
  } catch {
    initialIdentityCount = 0;
  }

  return (
    <RelayOnboardingExperience
      bootstrap={{
        repId: user.rep.id,
        repName: user.rep.name,
        role: user.rep.role,
        organizationName: user.organization.name,
        initialIdentityCount,
      }}
    />
  );
}
