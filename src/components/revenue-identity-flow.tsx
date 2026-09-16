"use client";

import { useState } from "react";
import { ProofSlip, Tick } from "@/components/landing/objects";
import { cn } from "cn";

const IDENTITIES = [
  {
    id: "mehak",
    name: "Mehak",
    focus: "Frontend / React",
    channel: "LinkedIn",
    proof: "08",
    expertise: "React / Design systems",
    slips: [
      { index: "02", title: "Component library rebuild", tags: ["React", "Tokens"] },
      { index: "07", title: "Design-system migration", tags: ["Frontend", "Voice"] },
    ],
  },
  {
    id: "hassan",
    name: "Hassan",
    focus: "Backend / Rails",
    channel: "Upwork",
    proof: "11",
    expertise: "Rails / APIs / Postgres",
    slips: [
      { index: "04", title: "Marketplace modernization", tags: ["Rails", "Postgres"] },
      { index: "09", title: "API migration at scale", tags: ["Backend", "Voice"] },
    ],
  },
  {
    id: "aneeb",
    name: "Aneeb",
    focus: "Mobile / React Native",
    channel: "LinkedIn",
    proof: "06",
    expertise: "RN / App Store",
    slips: [
      { index: "03", title: "Cross-platform rebuild", tags: ["React Native"] },
      { index: "05", title: "App Store launch set", tags: ["Mobile", "Voice"] },
    ],
  },
];

export function RevenueIdentityFlow() {
  const [activeId, setActiveId] = useState("aneeb");
  const active = IDENTITIES.find((i) => i.id === activeId)!;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-10 max-w-sm border border-[var(--bone-200)] bg-[var(--bone-000)] px-4 py-4" style={{ borderRadius: 2 }}>
        <Tick>Opportunity</Tick>
        <p className="mt-2 text-[17px] font-medium tracking-[-0.02em] text-ink">Sarah asked for a similar example</p>
        <p className="mt-1 text-[12px] text-graphite">Mobile rebuild · buying question</p>
      </div>

      <div className="relative grid sm:grid-cols-3 sm:gap-0">
        {IDENTITIES.map((identity, i) => {
          const on = identity.id === activeId;
          return (
            <button
              key={identity.id}
              type="button"
              onClick={() => setActiveId(identity.id)}
              onMouseEnter={() => {
                if (window.matchMedia("(hover: hover)").matches) setActiveId(identity.id);
              }}
              aria-pressed={on}
              className={cn(
                "text-left transition-transform",
                on ? "srf-dossier-on z-20 sm:-translate-y-3 sm:scale-[1.02]" : "srf-dossier z-0",
                i === 1 && "sm:-ml-4 sm:mt-8",
                i === 2 && "sm:-ml-4 sm:mt-4",
              )}
            >
              <div className="px-4 py-4">
                <div className="flex items-baseline justify-between">
                  <Tick>{on ? "Assigned" : "Standby"}</Tick>
                  <Tick>{identity.channel}</Tick>
                </div>
                <p className="mt-4 text-[22px] font-medium tracking-[-0.03em]">{identity.name}</p>
                <p className="mt-1 text-[11px] tracking-[0.1em] uppercase opacity-60">{identity.focus}</p>
                <div className="mt-5 space-y-2" style={{ borderTop: on ? "1px solid var(--console-line)" : "1px solid var(--bone-200)", paddingTop: 12 }}>
                  <Row k="Proof" v={`${identity.proof} contracts`} />
                  <Row k="Expertise" v={identity.expertise} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative z-30 mt-[-18px] grid gap-3 sm:grid-cols-2 sm:pl-[36%]">
        {active.slips.map((slip) => (
          <ProofSlip key={slip.index} {...slip} />
        ))}
      </div>

      <p className="mt-8 text-mono-regular text-[11px] tracking-[0.12em] uppercase text-stone">
        Opportunity → {active.name} → proof → action
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
      <Tick>{k}</Tick>
      <span className="text-[13px]">{v}</span>
    </div>
  );
}
