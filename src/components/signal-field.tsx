"use client";

import { useState } from "react";
import { Tick } from "@/components/landing/objects";
import { cn } from "cn";

const SIGNALS = [
  { id: "reply", label: "Client replied", detail: "Needs a response", why: "Asked a direct question 38 minutes ago." },
  { id: "prospect", label: "High-fit prospect", detail: "Strong technical match", why: "Rails + team-scaling proof matches their stack." },
  { id: "job", label: "Fresh job", detail: "Window closing", why: "Posted 2 hours ago. Matches the assigned Backend identity." },
];

export function SignalField() {
  const [activeId, setActiveId] = useState(SIGNALS[0].id);
  const active = SIGNALS.find((s) => s.id === activeId)!;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-0 overflow-hidden border border-[var(--bone-200)] lg:grid-cols-[0.9fr_1.1fr]" style={{ borderRadius: 2 }}>
      <ol className="bg-[var(--bone-000)]">
        {SIGNALS.map((signal) => {
          const on = activeId === signal.id;
          return (
            <li key={signal.id}>
              <button
                type="button"
                onClick={() => setActiveId(signal.id)}
                onMouseEnter={() => setActiveId(signal.id)}
                className={cn(
                  "flex w-full items-baseline justify-between gap-4 border-b border-[var(--bone-200)] px-4 py-4 text-left last:border-b-0",
                  on ? "bg-[var(--orange-wash)] text-ink" : "text-stone hover:text-ink",
                )}
                aria-pressed={on}
              >
                <span className="text-[14px] font-medium">{signal.label}</span>
                <Tick>{signal.detail}</Tick>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="bg-[var(--console)] px-5 py-6 text-[var(--console-text)]">
        <Tick>Why this one</Tick>
        <p className="mt-4 text-[22px] leading-snug font-light tracking-[-0.03em]">{active.why}</p>
      </div>
    </div>
  );
}
