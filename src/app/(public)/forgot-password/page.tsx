import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordExperience } from "@/components/auth/forgot-password-experience";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password - Relay",
  description: "Request a password reset link for your Relay account.",
};

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user?.profile) redirect("/dashboard");
  if (user) redirect("/onboarding");

  return <ForgotPasswordExperience />;
}
