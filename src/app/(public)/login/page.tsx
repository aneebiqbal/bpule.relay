import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginExperience } from "@/components/auth/login-experience";
import { getCurrentUser } from "@/lib/auth/current";
import { isDemoMode } from "@/lib/ai/config";
import { getAuthCapabilities } from "@/lib/auth/capabilities";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in - Relay",
  description: "Sign in to Relay and continue your queue or onboarding flow.",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user?.profile) redirect("/dashboard");
  if (user) redirect("/onboarding");

  // The UI renders only the capabilities this deployment can execute.
  const capabilities = getAuthCapabilities();

  return <LoginExperience demoMode={isDemoMode()} googleEnabled={capabilities.googleEnabled} />;
}
