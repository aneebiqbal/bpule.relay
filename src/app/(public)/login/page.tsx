import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginExperience } from "@/components/auth/login-experience";
import { getCurrentUser } from "@/lib/auth/current";
import { isDemoMode } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in - Relay",
  description: "Sign in to Relay and continue your queue or onboarding flow.",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user?.profile) redirect("/dashboard");
  if (user) redirect("/onboarding");

  return <LoginExperience demoMode={isDemoMode()} />;
}
