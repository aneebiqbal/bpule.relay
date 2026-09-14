"use client";

import { useEffect } from "react";
import { identifyUser } from "@/lib/analytics/track";

interface AppIdentifyWrapperProps {
  userId: string;
  orgId: string;
  role: string;
  plan?: string;
  children: React.ReactNode;
}

/**
 * Wraps authenticated app content to identify the user in PostHog.
 * Placed inside the app layout where user context is available.
 */
export function AppIdentifyWrapper({
  userId,
  orgId,
  role,
  plan,
  children,
}: AppIdentifyWrapperProps) {
  useEffect(() => {
    identifyUser(userId, orgId, role, plan);
  }, [userId, orgId, role, plan]);

  return <>{children}</>;
}
