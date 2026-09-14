/**
 * Analytics tracking abstraction.
 *
 * Provides a single `track()` function for the entire application.
 * Routes events through PostHog for production analytics.
 *
 * Privacy rules enforced here:
 * - No-ops in development/test without PostHog key
 * - Never logs sensitive content (passwords, tokens, message bodies, drafts)
 * - Sanitizes property values
 * - Respects DNT via PostHog config
 */

import {
  AnalyticsEvents,
  AnalyticsEventType,
  AnalyticsProperties,
} from "./events";
import {
  ensurePostHog,
  posthogCapture,
  posthogIdentify,
  posthogReset,
  posthogDistinctId,
} from "./posthog";

// Internal state
let initialized = false;
let currentUser: { id: string; orgId: string; role: string; plan: string } | null = null;
let attribution: AnalyticsProperties = {};

/**
 * Initialize analytics. Called once on app mount by AnalyticsProvider.
 */
export async function initAnalytics(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Capture UTM attribution before loading PostHog
  attribution = captureAttribution();

  // Lazy-load PostHog (only loads if NEXT_PUBLIC_POSTHOG_KEY is set)
  await ensurePostHog();
}

/**
 * Set the current authenticated user.
 * Called after login/verification to link anonymous → identified activity.
 */
export function identifyUser(
  userId: string,
  orgId: string,
  role: string,
  plan?: string,
) {
  currentUser = { id: userId, orgId, role, plan: plan ?? "trial" };

  // Alias anonymous session to identified user for attribution continuity
  // This links pre-signup UTM attribution to the authenticated user
  const anonId = posthogDistinctId();
  if (anonId && anonId !== userId) {
    posthogCapture("$create_alias", { alias: userId });
  }

  posthogIdentify(userId, {
    organization_id: orgId,
    role,
    plan: plan ?? "trial",
    ...attribution,
  });
}

/**
 * Clear user identity (logout).
 */
export function clearIdentity() {
  currentUser = null;
  posthogReset();
}

/**
 * Track an event.
 */
export function track(
  event: AnalyticsEventType,
  properties?: AnalyticsProperties,
) {
  // Skip in non-production environments without PostHog
  if (!initialized || typeof window === "undefined") return;

  const cleaned = sanitizeProperties(properties ?? {});

  // Always include current user context if authenticated
  if (currentUser) {
    cleaned.user_id = currentUser.id;
    cleaned.org_id = currentUser.orgId;
    cleaned.role = currentUser.role;
    cleaned.plan = currentUser.plan;
  }

  // Include attribution on acquisition events
  if (
    event === AnalyticsEvents.SIGNUP_STARTED ||
    event === AnalyticsEvents.SIGNUP_COMPLETED ||
    event === AnalyticsEvents.START_FREE_CLICKED
  ) {
    Object.assign(cleaned, attribution);
  }

  posthogCapture(event, cleaned);
}

/**
 * Track a page view.
 */
export function pageView(path: string, properties?: AnalyticsProperties) {
  track(AnalyticsEvents.PAGE_VIEW, { ...properties, path });
}

/**
 * Capture UTM params from URL and store for first-touch attribution.
 */
export function captureAttribution(): AnalyticsProperties {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const utmParams: AnalyticsProperties = {};

  const utmKeys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ] as const;

  for (const key of utmKeys) {
    const value = params.get(key);
    if (value) {
      utmParams[key] = value;
    }
  }

  // Store first-touch attribution in localStorage
  const existing = localStorage.getItem("relay_attribution");
  if (!existing && Object.keys(utmParams).length > 0) {
    utmParams.referrer = document.referrer || undefined;
    localStorage.setItem("relay_attribution", JSON.stringify(utmParams));
  }

  return utmParams;
}

/**
 * Retrieve stored first-touch attribution.
 */
export function getAttribution(): AnalyticsProperties {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem("relay_attribution");
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

// ── Internal ──

function sanitizeProperties(
  props: AnalyticsProperties,
): AnalyticsProperties {
  const clean: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    // Truncate strings to prevent bloat
    if (typeof value === "string" && value.length > 500) {
      clean[key] = value.slice(0, 500);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
