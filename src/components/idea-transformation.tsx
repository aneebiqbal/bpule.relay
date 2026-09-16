"use client";

import { useRef } from "react";
import { usePrefersReducedMotion, useScrollProgress } from "@/lib/landing-motion";
import { cn } from "cn";

const STAGES = [
  {
    label: "Idea",
    body: "You don’t modernize legacy software by replacing everything.",
  },
  {
    label: "Angle",
    body: "Experience changes what you consider progress.",
  },
  {
    label: "Structure",
    body: "1. The instinct to rewrite\n2. What actually survives\n3. The judgment call",
  },
  {
    label: "Post",
    body: "Junior me measured progress in lines written. Senior me measures it in lines I no longer need. The best refactor this quarter deleted 40% of a module and nobody noticed — which was the point.",
  },
  {
    label: "Visual",
    body: "A before / after: one tangled module, one clean split.",
  },
];

/** Sticky left: the idea. Right: the artifact physically changes. */
export function IdeaTransformation() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  useScrollProgress(ref, !reduced);

  return (
    <div
      ref={ref}
      className="relative lg:min-h-[240svh]"
      style={reduced ? { ["--p" as string]: "1" } : { ["--p" as string]: "0" }}
    >
      <div className="grid items-start gap-12 py-16 lg:sticky lg:top-16 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-2 lg:items-center lg:gap-20">
        <div>
          <p className="text-label text-cobalt">The idea stays</p>
          <p className="mt-5 text-chapter text-ink">
            You don&apos;t modernize legacy software by replacing everything.
          </p>
        </div>

        <div className="relative space-y-10 lg:min-h-[280px] lg:space-y-0">
          {STAGES.map((stage, i) => {
            const band = 1 / STAGES.length;
            const start = i * band;
            const end = start + band;
            const last = i === STAGES.length - 1;
            // Each stage owns the middle 60% of its band at full opacity; the
            // outer 20% on either side is a hard, non-overlapping crossfade —
            // so no two stages are ever both partially visible at the same --p.
            const fadeInEnd = start + band * 0.2;
            const fadeOutStart = end - band * 0.2;
            const rampIn = 1 / (fadeInEnd - start);
            const rampOut = 1 / (end - fadeOutStart);
            return (
              <div
                key={stage.label}
                className="max-lg:!opacity-100 lg:absolute lg:inset-0"
                style={{
                  opacity: last
                    ? `calc(max(0, min(1, (var(--p) - ${start}) * ${rampIn})))`
                    : `calc(max(0, min(1, (var(--p) - ${start}) * ${rampIn})) * (1 - max(0, (var(--p) - ${fadeOutStart}) * ${rampOut})))`,
                }}
              >
                <p className="text-label text-cobalt">{stage.label}</p>
                <p
                  className={cn(
                    "mt-4 whitespace-pre-line leading-relaxed text-ink",
                    stage.label === "Post" ? "text-[15px]" : "text-[17px]",
                  )}
                >
                  {stage.body}
                </p>
              </div>
            );
          })}

          <ol className="mt-8 hidden gap-3 lg:absolute lg:right-0 lg:bottom-0 lg:mt-0 lg:flex">
            {STAGES.map((stage, i) => (
              <li key={stage.label} className="text-meta">
                <span
                  style={{
                    color: `color-mix(in srgb, var(--cobalt) calc(max(20%, (1 - abs(var(--p) * ${STAGES.length} - ${i + 0.5})) * 100%)), var(--stone))`,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
