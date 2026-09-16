"use client";

import { Tick } from "@/components/landing/objects";

const COLUMNS = [
  { label: "Known for", items: ["Rails", "React", "Systems"] },
  { label: "Thinking about", items: ["Complexity", "AI products"] },
  { label: "Experience", items: ["Legacy modernization", "Shipping"] },
  { label: "Audience", items: ["Founders", "Engineers"] },
];

export function ContentIdentityMap() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="grid items-end gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Tick>Content identity</Tick>
          <p className="mt-4 text-[clamp(4.5rem,12vw,8.5rem)] leading-[0.82] font-light tracking-[-0.055em] text-ink">
            Fizza
          </p>
          <p className="mt-4 max-w-xs text-[14px] text-graphite">
            What she can credibly say — structured, not prompted.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-8">
          {COLUMNS.map((col) => (
            <div key={col.label}>
              <Tick>{col.label}</Tick>
              <ul className="mt-2 space-y-1">
                {col.items.map((item) => (
                  <li key={item} className="text-[15px] text-ink">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="srf-sheet relative mt-14 px-6 py-6 sm:ml-[20%] sm:-mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Tick>Legacy modernization  +  Engineering judgment  +  Founders</Tick>
          <Tick>Today / 01</Tick>
        </div>
        <p className="mt-4 text-[22px] leading-snug font-light tracking-[-0.03em] text-ink sm:text-[26px]">
          “You don’t modernize legacy software by replacing everything.”
        </p>
      </div>
    </div>
  );
}
