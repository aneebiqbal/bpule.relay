"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { cn } from "cn";

const SIGNALS = [
  { id: 1, label: "New reply", meta: "Sarah Chen · 2m ago" },
  { id: 2, label: "92% prospect", meta: "Rails role · posted 2h ago" },
  { id: 3, label: "Content opportunity", meta: "Authority gap: Rails scaling" },
  { id: 4, label: "Follow-up due", meta: "Marcus · waited 4 days" },
];

const ACTION = {
  title: "Reply to Sarah",
  subtitle: "High intent · asked about availability",
  score: 92,
};

type Phase = "signals" | "processing" | "action" | "paused";

export function SignalRelay() {
  const [phase, setPhase] = useState<Phase>("signals");
  const [activeSignal, setActiveSignal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive which signal is highlighted from current phase + active index
  const signals = useMemo(() => {
    if (phase === "processing") {
      return SIGNALS.map((s, i) => ({ ...s, active: i === activeSignal }));
    }
    return SIGNALS.map((s) => ({ ...s, active: false }));
  }, [phase, activeSignal]);

  // IntersectionObserver to pause when off-screen
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && phase !== "paused") {
          setPhase("paused");
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [phase]);

  // Main animation loop
  useEffect(() => {
    if (phase === "paused") return;

    let timer: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    if (phase === "signals") {
      interval = setInterval(() => {
        setActiveSignal((prev) => (prev + 1) % SIGNALS.length);
      }, 1200);

      timer = setTimeout(() => {
        clearInterval(interval);
        setPhase("processing");
      }, 5000);
    } else if (phase === "processing") {
      timer = setTimeout(() => {
        setSelectedId(SIGNALS[activeSignal].id);
        setPhase("action");
      }, 1500);
    } else if (phase === "action") {
      timer = setTimeout(() => {
        setPhase("signals");
        setSelectedId(null);
        setActiveSignal(0);
      }, 4000);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [phase, activeSignal]);

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      setPhase("paused");
    }
  }, []);

  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [handleVisibilityChange]);

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-md">
      {/* Signal input area */}
      <div className="rounded-2xl border border-line bg-bone-raised p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-label text-stone">Incoming signals</span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full bg-orange",
                phase !== "paused" && "signal-blink",
              )}
              aria-hidden="true"
            />
            <span className="text-mono-regular text-[10px] text-stone">
              {phase === "paused" ? "paused" : "live"}
            </span>
          </span>
        </div>

        <div className="space-y-2">
          {signals.map((signal) => (
            <div
              key={signal.id}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-all duration-300",
                signal.active
                  ? "border-orange/40 bg-orange/5"
                  : selectedId === signal.id
                    ? "border-orange bg-orange/10"
                    : "border-line bg-bone",
              )}
            >
              <div>
                <p
                  className={cn(
                    "text-[13px] font-medium transition-colors",
                    signal.active || selectedId === signal.id
                      ? "text-ink"
                      : "text-graphite",
                  )}
                >
                  {signal.label}
                </p>
                <p className="text-mono-regular text-[11px] text-stone">
                  {signal.meta}
                </p>
              </div>
              {(signal.active || selectedId === signal.id) && (
                <div className="flex size-6 items-center justify-center rounded-full bg-orange">
                  <svg
                    className="size-3 text-bone"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2 6h8M7 3l3 3-3 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Processing indicator */}
      {phase === "processing" && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex items-center gap-2 rounded-full border border-line bg-bone-raised px-4 py-2 shadow-md">
            <span
              className="size-2 rounded-full bg-orange signal-blink"
              aria-hidden="true"
            />
            <span className="text-[12px] font-medium text-ink">Evaluating</span>
          </div>
        </div>
      )}

      {/* Action output */}
      {phase === "action" && (
        <div className="mt-4 rounded-2xl border border-orange/30 bg-orange/5 p-5">
          <div className="mb-1 text-label text-orange">Your next move</div>
          <h3 className="text-heading text-xl text-ink">{ACTION.title}</h3>
          <p className="mt-1 text-[13px] text-graphite">{ACTION.subtitle}</p>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-mono-medium text-2xl font-semibold text-orange number-tick">
                {ACTION.score}
              </span>
              <span className="text-[11px] text-stone">fit score</span>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3.5 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark"
            >
              Draft reply
              <svg
                className="size-3.5"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2 6h8M7 3l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
