"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  initAnalytics,
  pageView,
} from "@/lib/analytics/track";

/**
 * Client-side analytics provider.
 * Initializes PostHog (lazy-loaded) and handles automatic page views.
 */
export function AnalyticsProvider() {
  const pathname = usePathname();

  // Initialize analytics on mount
  useEffect(() => {
    initAnalytics();
  }, []);

  // Track page views on navigation
  useEffect(() => {
    pageView(pathname ?? "/", {
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    });
  }, [pathname]);

  return null;
}
