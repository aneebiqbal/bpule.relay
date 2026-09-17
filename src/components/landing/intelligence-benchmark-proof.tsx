"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import {
  INTELLIGENCE_BENCHMARK_LANDING_SNAPSHOT,
} from "@/lib/intelligence-v2/benchmark-landing-data";
import { formatBenchmarkTimestamp } from "@/lib/intelligence-v2/benchmark-format";

export function IntelligenceBenchmarkProofSection() {
  const snapshot = INTELLIGENCE_BENCHMARK_LANDING_SNAPSHOT;
  const copy = snapshot.copy;
  const lastVerified = formatBenchmarkTimestamp(snapshot.lastVerifiedAt);

  return (
    <section
      id="benchmark-proof"
      data-system="relay"
      className="relative overflow-hidden bg-[var(--ink-950)] py-[clamp(4.8rem,10vw,8.6rem)] text-[var(--bone-000)]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 120% at 96% 0%, color-mix(in srgb, var(--orange-signal) 25%, transparent), transparent 58%), radial-gradient(120% 95% at 0% 100%, color-mix(in srgb, var(--cobalt-signal) 18%, transparent), transparent 64%), repeating-linear-gradient(0deg, transparent 0, transparent 32px, color-mix(in srgb, var(--bone-000) 8%, transparent) 33px)",
        }}
        aria-hidden="true"
      />

      <div className="landing-shell-wide relative">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-[3px] border border-[color:rgba(247,241,232,0.25)] bg-[color:rgba(247,241,232,0.06)] px-2.5 py-1 text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--bone-000)]/80">
            <ShieldCheck className="size-3 text-orange" />
            {copy.kicker}
          </p>

          <h3 className="mt-5 text-[clamp(2rem,5.1vw,4.4rem)] leading-[0.9] font-light tracking-[-0.045em]">
            {copy.title}
          </h3>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[color:rgba(241,237,228,0.78)] sm:text-[16px]">
            {copy.description}
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.metrics.map((metric) => (
            <article
              key={metric.id}
              className="rounded-[8px] border border-[var(--orange-line)] bg-[linear-gradient(180deg,var(--bone-050),var(--bone-000))] px-4 py-4 text-ink shadow-[0_22px_40px_-30px_rgba(8,7,6,0.85)]"
            >
              <p className="text-[25px] leading-none font-medium tracking-[-0.02em] text-[var(--ink-950)]">
                {metric.value}
              </p>
              <p className="mt-2 text-mono-regular text-[10px] tracking-[0.12em] uppercase text-orange">
                {metric.label}
              </p>
              {metric.note && <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-700)]">{metric.note}</p>}
            </article>
          ))}
        </div>

        <div className="mt-7 rounded-[8px] border border-[color:rgba(247,241,232,0.25)] bg-[color:rgba(247,241,232,0.06)] px-4 py-4 sm:px-5">
          <p className="inline-flex items-center gap-2 text-[12px] text-[color:rgba(241,237,228,0.88)]">
            <CheckCircle2 className="size-4 text-orange" />
            {copy.trustLine}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[color:rgba(241,237,228,0.72)]">
            <span>Last verified: {lastVerified}</span>
            <span>{copy.disclaimer}</span>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-[color:rgba(241,237,228,0.88)] sm:text-[14px]">
          {copy.finalCta}
        </p>
      </div>
    </section>
  );
}
