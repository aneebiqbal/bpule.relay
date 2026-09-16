import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupExperience } from "@/components/auth/signup-experience";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create account - Relay",
  description: "Create your Relay workspace and start your onboarding flow.",
};

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user?.profile) redirect("/dashboard");
  if (user) redirect("/onboarding");

  return <SignupExperience />;
}
