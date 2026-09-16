"use client";

import { useRef } from "react";
import { usePrefersReducedMotion, useScrollProgress } from "@/lib/landing-motion";

/**
 * Orange reaches the edge. The page slows. Cobalt arrives from the other side.
 */
export function StudioThreshold() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  useScrollProgress(ref, !reduced);

  return (
    <div
      ref={ref}
      className="relative min-h-[120svh] lg:min-h-[160svh]"
      style={reduced ? { ["--p" as string]: "1" } : { ["--p" as string]: "0" }}
    >
      <div className="sticky top-0 flex min-h-svh items-center">
        <div className="landing-shell w-full">
          <div className="relative mx-auto max-w-3xl py-24">
            <span
              className="pointer-events-none absolute top-8 left-0 h-px w-1/2 origin-left bg-orange"
              style={{
                transform: "scaleX(calc(1 - min(1, var(--p) * 2.2)))",
                opacity: "calc(1 - min(1, var(--p) * 2))",
              }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute right-0 bottom-8 h-px w-1/2 origin-right bg-cobalt"
              style={{
                transform: "scaleX(calc(max(0, (var(--p) - 0.45) * 2.2)))",
                opacity: "calc(max(0, (var(--p) - 0.4) * 2))",
              }}
              aria-hidden="true"
            />

            <p
              className="text-hero text-ink"
              style={{ opacity: "calc(1 - max(0, (var(--p) - 0.35) * 2.4))" }}
            >
              Finding demand
              <br />
              is only half the system.
            </p>

            <p
              className="mt-16 text-hero text-ink"
              style={{
                opacity: "calc(max(0, (var(--p) - 0.38) * 3.2) * (1 - max(0, (var(--p) - 0.78) * 4)))",
              }}
            >
              What if the opportunity
              <br />
              hasn&apos;t happened yet?
            </p>

            <div
              className="mt-20"
              style={{ opacity: "calc(max(0, (var(--p) - 0.72) * 5))" }}
            >
              <p className="text-label text-cobalt">Studio / create demand</p>
              <span className="mt-6 block size-2 rounded-full bg-cobalt cobalt-bloom" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
