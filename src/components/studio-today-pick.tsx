"use client";

import { useState } from "react";
import { Tick } from "@/components/landing/objects";

const ANGLES = [
  {
    kicker: "Why senior engineers",
    title: "delete more code.",
    whyYou: "Legacy systems · Engineering judgment",
    audience: "Technical founders",
  },
  {
    kicker: "You’ve spent years",
    title: "debugging differently.",
    whyYou: "Engineering experience · Systems",
    audience: "Engineers",
  },
  {
    kicker: "You keep choosing",
    title: "boring technology on purpose.",
    whyYou: "Stated philosophy · Taste",
    audience: "Technical teams",
  },
];

export function StudioTodayPick() {
  const [index, setIndex] = useState(0);
  const angle = ANGLES[index];

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute inset-3 translate-x-2 translate-y-2 bg-[var(--cobalt-wash)]" aria-hidden="true" />
    <div className="srf-sheet mark-corners relative px-6 py-8 sm:px-10 sm:py-10">
      <div className="flex items-baseline justify-between">
        <Tick>Today’s pick</Tick>
        <Tick>0{index + 1} / 04</Tick>
      </div>

      <p className="mt-10 text-[13px] tracking-[0.14em] text-cobalt uppercase">{angle.kicker}</p>
      <h3 className="mt-3 text-[2rem] leading-[1.05] font-light tracking-[-0.035em] text-ink sm:text-[2.6rem]">
        {angle.title}
      </h3>

      <div className="mt-12 grid gap-8 border-t border-[var(--bone-200)] pt-8 sm:grid-cols-[1fr_auto] sm:gap-16">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Tick>Why you</Tick>
            <p className="mt-2 text-[13px] leading-relaxed text-graphite">{angle.whyYou}</p>
          </div>
          <div>
            <Tick>Audience</Tick>
            <p className="mt-2 text-[13px] leading-relaxed text-graphite">{angle.audience}</p>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-3 sm:items-end">
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % ANGLES.length)}
            className="text-[13px] text-cobalt"
          >
            Different angle ↗
          </button>
          <span className="text-[13px] font-medium text-ink">Write this →</span>
        </div>
      </div>
    </div>
    </div>
  );
}
