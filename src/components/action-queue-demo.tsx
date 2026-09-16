"use client";

import { useEffect, useState } from "react";
import { useInViewOnce, usePrefersReducedMotion } from "@/lib/landing-motion";
import { Tick } from "@/components/landing/objects";
import { cn } from "cn";

const ITEMS = [
  {
    id: "reply",
    kind: "Reply",
    name: "Sarah Chen",
    when: "Now",
    why: "Asked for relevant proof 38 minutes ago.",
    identity: "Hassan / mobile marketplace",
    action: "Prepare reply →",
  },
  {
    id: "lead",
    kind: "Prospect",
    name: "Northstar",
    when: "Next",
    why: "Hiring mobile engineers. Proof maps cleanly.",
    identity: "Hassan / React Native",
    action: "Open prospect →",
  },
  {
    id: "follow",
    kind: "Follow-up",
    name: "Quiet thread",
    when: "Today",
    why: "Last touch three days ago. A nudge is due.",
    identity: "Mehak / frontend",
    action: "Draft nudge →",
  },
  {
    id: "job",
    kind: "Job",
    name: "Senior Rails",
    when: "4h",
    why: "Posted this morning. Window still open.",
    identity: "Hassan / backend",
    action: "Prepare proposal →",
  },
];

export function ActionQueueDemo() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [activeId, setActiveId] = useState("reply");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!inView) return;
    // Reacting to the IntersectionObserver signal from useInViewOnce, not
    // redundant initial state — this is the "subscribe to an external
    // system" case the lint rule itself carves out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    if (!reduced) setActiveId("reply");
  }, [inView, reduced]);

  return (
    <div ref={ref} className="mx-auto w-full max-w-[640px]">
      <div className="srf-console srf-console-edge mark-corners overflow-hidden">
        <div className="flex items-baseline justify-between px-5 py-3.5" style={{ borderBottom: "1px solid var(--console-line)" }}>
          <Tick>Your Relay</Tick>
          <Tick>{ready ? "Ordered" : "Evaluating"}  ·  09:14</Tick>
        </div>

        <ul>
          {ITEMS.map((item, i) => {
            const active = activeId === item.id;
            return (
              <li key={item.id} style={{ borderBottom: i === ITEMS.length - 1 ? "none" : "1px solid var(--console-line)" }}>
                <button
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  onMouseEnter={() => setActiveId(item.id)}
                  className="w-full px-5 py-4 text-left"
                  aria-expanded={active}
                >
                  <div className="grid grid-cols-[2.4rem_1fr_auto] items-baseline gap-3">
                    <span className={cn("text-mono-regular text-[15px]", active ? "text-orange" : "text-[var(--console-mute)]")}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span className={cn("text-[11px] font-medium tracking-[0.14em] uppercase", active ? "text-orange" : "text-[var(--console-mute)]")}>
                          {item.kind}
                        </span>
                        <span className={cn("text-[16px] font-medium tracking-[-0.015em]", active ? "text-[var(--console-text)]" : "text-[var(--console-mute)]")}>
                          {item.name}
                        </span>
                      </span>
                      {active && (
                        <span className="mt-3 block">
                          <span className="block text-[13px] leading-relaxed text-[var(--console-mute)]">{item.why}</span>
                          <span className="mt-4 flex items-center justify-between gap-4" style={{ borderTop: "1px solid var(--console-line)", paddingTop: 12 }}>
                            <span className="text-[13px] font-medium text-orange">{item.action}</span>
                            <Tick>{item.identity}</Tick>
                          </span>
                        </span>
                      )}
                    </span>
                    <span className={cn("text-mono-regular text-[10px] tracking-[0.12em] uppercase", active ? "text-orange" : "text-[var(--console-mute)]")}>
                      {item.when}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
