"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";

interface Signal {
  id: number;
  label: string;
  meta: string;
  active: boolean;
}

const SIGNALS: Signal[] = [
  { id: 1, label: "New reply", meta: "Sarah Chen · 2m ago", active: false },
  { id: 2, label: "92% prospect", meta: "Rails role · posted 2h ago", active: false },
  { id: 3, label: "Content opportunity", meta: "Authority gap: Rails scaling", active: false },
  { id: 4, label: "Follow-up due", meta: "Marcus · waited 4 days", active: false },
];

const ACTION = {
  title: "Reply to Sarah",
  subtitle: "High intent · asked about availability",
  score: 92,
};

export function SignalRelay() {
  const [phase, setPhase] = useState<"signals" | "processing" | "action">("signals");
  const [signals, setSignals] = useState<Signal[]>(SIGNALS);
  const [activeSignal, setActiveSignal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "signals") {
      // Highlight each signal in sequence
      const interval = setInterval(() => {
        setActiveSignal((prev) => {
          const next = (prev + 1) % SIGNALS.length;
          return next;
        });
      }, 1200);

      timer = setTimeout(() => {
        clearInterval(interval);
        setPhase("processing");
      }, 5000);

      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }

    if (phase === "processing") {
      // Show active signal being evaluated
      setSignals((prev) =>
        prev.map((s, i) => ({ ...s, active: i === activeSignal })),
      );
      timer = setTimeout(() => {
        setSelectedId(SIGNALS[activeSignal].id);
        setPhase("action");
      }, 1500);
      return () => clearTimeout(timer);
    }

    if (phase === "action") {
      timer = setTimeout(() => {
        setPhase("signals");
        setSignals(SIGNALS);
        setSelectedId(null);
        setActiveSignal(0);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [phase, activeSignal]);

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Signal input area */}
      <div className="rounded-2xl border border-line bg-bone-raised p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-label text-stone">Incoming signals</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-orange signal-blink" aria-hidden="true" />
            <span className="text-mono-regular text-[10px] text-stone">live</span>
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
                  <svg className="size-3 text-bone" viewBox="0 0 12 12" fill="none">
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
            <span className="size-2 rounded-full bg-orange signal-blink" aria-hidden="true" />
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
              <svg className="size-3.5" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
