"use client";

import { useEffect } from "react";
import { identifyUser } from "@/lib/analytics/track";

interface AnalyticsIdentifyProps {
  userId: string;
  orgId: string;
  role: string;
  plan?: string;
}

/**
 * Identifies the authenticated user in PostHog.
 * Place inside the app layout to ensure analytics tracks
 * the correct user for all authenticated events.
 */
export function AnalyticsIdentify({
  userId,
  orgId,
  role,
  plan,
}: AnalyticsIdentifyProps) {
  useEffect(() => {
    identifyUser(userId, orgId, role, plan);
  }, [userId, orgId, role, plan]);

  return null;
}
