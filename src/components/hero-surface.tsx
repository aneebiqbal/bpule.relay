"use client";

import { useEffect, useState } from "react";

/**
 * The hero object — not a dashboard screen. A single signal, rendered like
 * a piece of physical evidence: a large fit number stamped in the corner,
 * the reply itself as the dominant editorial statement, and a torn proof
 * slip attached at the bottom edge. No rows, no metadata grid — one signal,
 * made large enough to matter.
 */
export function HeroSurface() {
  const [revealed, setRevealed] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (revealed) return;
    const t = setTimeout(() => setRevealed(true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[440px] lg:mx-0 lg:max-w-none">
      <div
        className="relative overflow-hidden"
        style={{
          background: "var(--ink-950)",
          borderRadius: "var(--r-canvas)",
          boxShadow: "0 32px 72px -28px rgba(16, 15, 13, 0.55)",
        }}
      >
        {/* Fit number — stamped large in the corner, the whole point of the object */}
        <div className="flex items-start justify-between px-7 pt-7">
          <div>
            <p className="text-mono-regular text-[11px] tracking-[0.18em] uppercase" style={{ color: "var(--console-mute)" }}>
              Sarah replied · 2m ago
            </p>
            <p className="mt-1 text-mono-regular text-[11px] tracking-[0.14em] uppercase text-orange">
              Worth a reply
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-mono-medium leading-none text-orange transition-all duration-[1100ms] ease-out"
              style={{
                fontSize: "3.4rem",
                letterSpacing: "-0.04em",
                opacity: revealed ? 1 : 0,
                transform: revealed ? "translateY(0)" : "translateY(6px)",
              }}
            >
              92
            </p>
            <p className="text-mono-regular -mt-1 text-[10px] tracking-[0.14em] uppercase" style={{ color: "var(--console-mute)" }}>
              fit
            </p>
          </div>
        </div>

        {/* The message — the dominant editorial statement, not UI copy */}
        <p
          className="mt-8 px-7 text-[26px] leading-[1.2] font-light tracking-[-0.02em]"
          style={{ color: "var(--console-text)" }}
        >
          &ldquo;Could you send me an example of something similar?&rdquo;
        </p>

        {/* A torn proof slip — attached evidence, not a metadata row */}
        <div className="relative mt-9 px-7 pb-7">
          <div
            className="relative flex items-center justify-between gap-4 px-4 py-3"
            style={{
              background: "var(--console-raised)",
              borderRadius: "var(--r-object)",
              borderLeft: "2px solid var(--orange-signal)",
            }}
          >
            <span className="text-[13px]" style={{ color: "var(--console-text)" }}>
              Marketplace migration
            </span>
            <span className="text-mono-regular text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--console-mute)" }}>
              Hassan&apos;s proof
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between px-7 pb-7">
          <span className="text-[14px] font-medium text-orange">Prepare reply →</span>
          <span className="text-mono-regular text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--console-mute)" }}>
            2 more waiting
          </span>
        </div>
      </div>

      {/* Two more signals, stacked just behind — proof this isn't the only one, without a list */}
      <div
        aria-hidden="true"
        className="absolute inset-x-3 -bottom-2.5 -z-10 h-full"
        style={{ background: "var(--ink-900)", borderRadius: "var(--r-canvas)" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-6 -bottom-5 -z-20 h-full"
        style={{ background: "var(--ink-800)", borderRadius: "var(--r-canvas)" }}
      />
    </div>
  );
}
