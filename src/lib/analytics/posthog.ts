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

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return Promise.resolve();

  if (loaded && window.posthog?.__loaded) return Promise.resolve();

  loadPromise = new Promise<void>((resolve) => {
    // Step 1: Bootstrapping snippet (queues calls before SDK loads)
    const bootstrap = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);`;

    const bootScript = document.createElement("script");
    bootScript.textContent = bootstrap;
    document.head.appendChild(bootScript);

    // Step 2: Init with project config
    const init = `window.posthog.init(${JSON.stringify(apiKey)}, {
      api_host: ${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com")},
      defaults: '2026-05-30',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      respect_dnt: true,
      capture_performance: true,
      loaded: function() { window.posthog.__loaded = true; }
    });`;

    const initScript = document.createElement("script");
    initScript.textContent = init;

    bootScript.onload = () => {
      document.head.appendChild(initScript);

      // Poll for ready
      const check = setInterval(() => {
        if (window.posthog?.__loaded) {
          clearInterval(check);
          loaded = true;
          resolve();
        }
      }, 100);

      setTimeout(() => { clearInterval(check); resolve(); }, 5000);
    };

    bootScript.onerror = () => resolve();
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
