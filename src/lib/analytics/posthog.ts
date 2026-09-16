/**
 * PostHog integration — lazy-loaded SDK.
 *
 * Matches the official PostHog bootstrapping pattern:
 *   1. Load array.js from CDN
 *   2. init() with project key + config
 *
 * Config:
 *   - person_profiles: 'identified_only' (no anonymous profiles)
 *   - autocapture: false (explicit events only)
 *   - capture_performance: true (Web Vitals)
 *   - disable_session_recording: true
 *   - respect_dnt: true
 *   - defaults: '2026-05-30'
 *
 * Privacy: No passwords, tokens, message bodies, or draft content ever sent.
 */

declare global {
  interface Window {
    posthog: PostHogWindow;
  }
}

interface PostHogWindow {
  init: (key: string, options?: Record<string, unknown>) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (id: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
  get_distinct_id: () => string;
  __loaded: boolean;
  [key: string]: unknown;
}

let loadPromise: Promise<void> | null = null;
let loaded = false;

export function ensurePostHog(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof window === "undefined") return Promise.resolve();

  // Key is injected by server layout via window.__POSTHOG_KEY__
  const apiKey = (window as unknown as Record<string, string>).__POSTHOG_KEY__;
  const apiHost = (window as unknown as Record<string, string>).__POSTHOG_HOST__;
  if (!apiKey) return Promise.resolve();

  if (loaded && window.posthog?.__loaded) return Promise.resolve();

  loadPromise = new Promise<void>((resolve) => {
    const host = apiHost || "https://us.i.posthog.com";
    if (!window.posthog) {
      const stub = [] as unknown as PostHogWindow;
      stub._i = [];
      stub.init = ((key: string, options?: Record<string, unknown>) => {
        (stub._i as unknown[]).push([key, options, "posthog"]);
      }) as PostHogWindow["init"];
      window.posthog = stub;
    }
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `${host.replace(".i.posthog.com", "-assets.i.posthog.com")}/static/array.js`;
    script.onerror = () => resolve();
    script.onload = () => {
      try {
        window.posthog?.init?.(apiKey, {
          api_host: host,
          defaults: "2026-05-30",
          person_profiles: "identified_only",
          capture_pageview: true,
          capture_pageleave: true,
          autocapture: false,
          disable_session_recording: true,
          respect_dnt: true,
          capture_performance: true,
          loaded: () => {
            if (window.posthog) window.posthog.__loaded = true;
          },
        });
      } catch {
        resolve();
        return;
      }

      const check = setInterval(() => {
        if (window.posthog?.__loaded) {
          clearInterval(check);
          loaded = true;
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function posthogCapture(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.posthog?.__loaded) return;
  window.posthog.capture(event, properties);
}

export function posthogIdentify(id: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.posthog?.__loaded) return;
  window.posthog.identify(id, properties);
}

export function posthogReset(): void {
  if (typeof window === "undefined" || !window.posthog?.__loaded) return;
  window.posthog.reset();
}

export function posthogDistinctId(): string | null {
  if (typeof window === "undefined" || !window.posthog?.__loaded) return null;
  try { return window.posthog.get_distinct_id(); } catch { return null; }
}
