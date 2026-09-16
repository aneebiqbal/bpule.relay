"use client";

import { useState } from "react";
import { Tick } from "@/components/landing/objects";
import { RelayButton } from "@/components/landing/relay-cta";

export function HumanControlSequence() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="srf-console srf-console-edge px-6 py-8 text-center">
        <div className="relative mx-auto h-px w-full max-w-xs" style={{ background: "var(--console-line)" }}>
          <span
            className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-orange"
            style={{
              left: approved ? "100%" : "50%",
              transform: "translate(-50%, -50%)",
              transition: "left 0.8s cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
        <p className="mt-8">
          <Tick>{approved ? "Approved" : "Ready for you"}</Tick>
        </p>
        <p className="mt-4 text-[28px] leading-tight font-light tracking-[-0.03em] text-[var(--console-text)]">
          {approved ? "The move leaves Relay." : "The action is prepared. It does not send itself."}
        </p>
        <div className="mt-8 flex justify-center">
          {approved ? (
            <Tick>Sarah · Mobile project · proof attached</Tick>
          ) : (
            <RelayButton onClick={() => setApproved(true)}>Review</RelayButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function HumanManifesto() {
  const pairs = [
    ["Relay researches", "You decide"],
    ["Relay drafts", "You review"],
    ["Relay recommends", "You choose"],
    ["Relay remembers", "You stay in control"],
  ];

  return (
    <div className="mx-auto w-full max-w-xl border border-[var(--bone-200)]" style={{ borderRadius: 2 }}>
      {pairs.map(([ai, human]) => (
        <div
          key={ai}
          className="grid grid-cols-1 gap-1 border-b border-[var(--bone-200)] px-4 py-4 last:border-b-0 sm:grid-cols-2"
        >
          <p className="text-[14px] text-stone">{ai}</p>
          <p className="text-[14px] font-medium text-ink">{human}</p>
        </div>
      ))}
    </div>
  );
}
