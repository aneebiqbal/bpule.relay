import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordExperience } from "@/components/auth/reset-password-experience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set new password - Relay",
  description: "Set a new password for your Relay account after recovery verification.",
};

function LoadingState() {
  return (
    <div className="auth-experience gradient-mesh public-canvas flex items-center justify-center px-6">
      <div className="auth-surface max-w-sm px-4 py-8 text-center">
        <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--orange)]" />
        <p className="text-sm text-[var(--graphite)]">Preparing secure reset session...</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResetPasswordExperience />
    </Suspense>
  );
}
