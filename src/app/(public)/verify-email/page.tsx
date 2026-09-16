import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyEmailExperience } from "@/components/auth/verify-email-experience";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify email - Relay",
  description: "Verify your Relay account email before signing in.",
};

export default async function VerifyEmailPage() {
  const user = await getCurrentUser();
  if (user?.profile) redirect("/dashboard");
  if (user) redirect("/onboarding");

  return <VerifyEmailExperience />;
}
