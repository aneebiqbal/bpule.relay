/**
 * Web Vitals monitoring.
 *
 * PostHog automatically captures LCP, INP, and CLS when
 * capture_performance: true is set in its init config.
 *
 * This module provides explicit Web Vitals reporting for:
 * 1. Admin dashboard aggregation
 * 2. Fallback when PostHog is not configured
 */

import { track } from "./track";
import { AnalyticsEvents } from "./events";

export interface WebVitalsMetric {
  name: "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  id: string;
}

/**
 * Report a Web Vitals metric.
 * Called by PostHog's captured event or manual measurement.
 */
export function reportWebVital(metric: WebVitalsMetric) {
  // PostHog already captures these when configured.
  // This function provides a fallback path and admin reporting.
  if (process.env.NODE_ENV !== "production") return;

  track(AnalyticsEvents.PAGE_VIEW, {
    [`web_vital_${metric.name.toLowerCase()}`]: Math.round(metric.value),
    [`web_vital_${metric.name.toLowerCase()}_rating`]: metric.rating,
  });
}

/**
 * Get Web Vitals thresholds for reporting.
 */
export const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  INP: { good: 200, needsImprovement: 500 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
} as const;
