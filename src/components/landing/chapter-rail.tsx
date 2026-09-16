"use client";

import { useActiveChapter } from "@/lib/landing-motion";
import { cn } from "cn";

export const LANDING_CHAPTERS = [
  { id: "chapter-signal", index: "01", label: "Signal" },
  { id: "chapter-decision", index: "02", label: "Decision" },
  { id: "chapter-action", index: "03", label: "Action" },
  { id: "chapter-create", index: "04", label: "Create" },
  { id: "chapter-capture", index: "05", label: "Capture" },
  { id: "chapter-learn", index: "06", label: "Learn" },
] as const;

export function ChapterRail() {
  const active = useActiveChapter(LANDING_CHAPTERS.map((c) => c.id));
  const studioActive =
    active === "chapter-create" || active === "chapter-capture" || active === "chapter-learn";

  return (
    <nav
      aria-label="Story chapters"
      className="pointer-events-none fixed right-[max(1.5rem,calc((100vw-1440px)/2))] top-1/2 z-40 hidden -translate-y-1/2 2xl:block"
    >
      <ol className="flex flex-col gap-3">
        {LANDING_CHAPTERS.map((chapter) => {
          const isActive = active === chapter.id;
          return (
            <li key={chapter.id}>
              <a
                href={`#${chapter.id}`}
                className="pointer-events-auto group flex items-center justify-end gap-2.5"
              >
                <span
                  className={cn(
                    "text-mono-regular text-[10px] tracking-[0.14em] uppercase transition-colors duration-300",
                    isActive ? "text-stone" : "text-stone-light/80 group-hover:text-stone",
                  )}
                >
                  {chapter.index} {chapter.label}
                </span>
                <span
                  className={cn(
                    "block h-px transition-all duration-300",
                    isActive
                      ? studioActive
                        ? "w-6 bg-cobalt"
                        : "w-6 bg-orange"
                      : "w-3 bg-line group-hover:w-4",
                  )}
                  aria-hidden="true"
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageGrain() {
  return <div className="landing-grain" aria-hidden="true" />;
}
