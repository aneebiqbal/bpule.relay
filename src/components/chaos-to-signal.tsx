"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion, useScrollProgress } from "@/lib/landing-motion";
import { SignalChip } from "@/components/landing/objects";

const NOISE = [
  { kind: "CRM", name: "Stale deal", when: "—" },
  { kind: "Slack", name: "Thread", when: "—" },
  { kind: "Draft", name: "Half-written", when: "—" },
  { kind: "Cal", name: "Ping", when: "—" },
  { kind: "Mail", name: "Newsletter", when: "—" },
  { kind: "Tab", name: "Open", when: "—" },
];

const KEPT = [
  { kind: "Reply", name: "Sarah Chen", when: "Now" },
  { kind: "Lead", name: "Northstar", when: "Next" },
  { kind: "Job", name: "Rails", when: "4h" },
];

export function ChaosToSignal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useScrollProgress(ref, desktop && !reduced);

  return (
    <div
      ref={ref}
      className="relative min-h-0 [--p:1] lg:min-h-[140svh] lg:[--p:0]"
      style={reduced ? { ["--p" as string]: "1" } : undefined}
    >
      <div className="sticky top-28 mx-auto h-[min(520px,72svh)] w-full max-w-2xl">
        {/* Noise recedes to the perimeter — never shares the kept rows' space */}
        <div
          className="absolute inset-0"
          style={{ opacity: "calc(0.5 * (1 - var(--p)))", transition: "opacity 0.2s linear" }}
        >
          {NOISE.map((f, i) => {
            const positions = [
              { top: "4%", left: "2%" },
              { top: "2%", right: "4%" },
              { top: "34%", left: "-13%" },
              { top: "38%", right: "-14%" },
              { top: "70%", left: "0%" },
              { top: "74%", right: "2%" },
            ];
            const pos = positions[i];
            return (
              <div
                key={f.name}
                className="absolute will-change-transform"
                style={{
                  ...pos,
                  transform: `translateY(calc(var(--p) * -14px)) rotate(${(i % 2 === 0 ? -1 : 1) * 2}deg)`,
                }}
              >
                <SignalChip {...f} />
              </div>
            );
          })}
        </div>

        {/* Kept rows own the center column at every step of the transition */}
        <ol className="absolute inset-x-0 top-1/2 mx-auto w-full max-w-sm -translate-y-1/2 space-y-3">
          {KEPT.map((item, i) => (
            <li
              key={item.name}
              style={{
                opacity: "calc(0.35 + var(--p) * 0.65)",
                transform: `translateY(calc((1 - var(--p)) * ${(i - 1) * 10}px)) scale(calc(0.97 + var(--p) * 0.03))`,
              }}
            >
              <div
                className="bg-[var(--bone-000)] px-4 py-3 shadow-[0_1px_0_var(--bone-200)]"
                style={{ borderRadius: 2, border: "1px solid var(--bone-200)" }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-mono-regular text-[11px] text-orange">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] font-medium text-ink">{item.kind}</span>
                  <span className="text-[13px] text-ink">{item.name}</span>
                  <span className="text-mono-regular text-[10px] tracking-[0.1em] uppercase text-orange">
                    {item.when}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
