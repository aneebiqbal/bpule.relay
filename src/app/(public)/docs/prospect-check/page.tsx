import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Prospect Check | ${siteConfig.name}`,
  description:
    "How Relay scores prospects against your organization's rubric — signals, completeness, and verdicts.",
  alternates: { canonical: canonicalUrl("/docs/prospect-check") },
  robots: { index: true, follow: true },
};

export default function ProspectCheckPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Prospect Check</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Prospect Check tells you whether a lead is worth your time. It scores fit
          against your organization&apos;s rubric and gives a clear verdict.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">How scoring works</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Scoring is <strong className="text-ink">pure arithmetic</strong> — no AI model is
          called. It&apos;s deterministic and instant. The total is out of 12:
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Signal (max 7)</p>
            <p className="mt-1 text-[13px] text-graphite">
              Weighted indicators like hiring, funding, being understaffed, having a
              stale product, running a weak stack, showing pain, or asking for help.
            </p>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Completeness (max 5)</p>
            <p className="mt-1 text-[13px] text-graphite">
              How much evidence exists: URL, name, title, specific evidence, verbatim
              quote from the prospect.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Verdicts</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-status-success/20 bg-status-success/5 p-3">
            <span className="rounded-md bg-status-success/10 px-2 py-0.5 text-mono-medium text-[10px] text-status-success">
              SEND (10–12)
            </span>
            <span className="text-[13px] text-graphite">
              Strong fit. Worth reaching out now.
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-status-warning/20 bg-status-warning/5 p-3">
            <span className="rounded-md bg-status-warning/10 px-2 py-0.5 text-mono-medium text-[10px] text-status-warning">
              RESEARCH MORE (7–9)
            </span>
            <span className="text-[13px] text-graphite">
              Promising but missing evidence. Find more before reaching out.
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-line bg-bone-raised p-3">
            <span className="rounded-md bg-stone/10 px-2 py-0.5 text-mono-medium text-[10px] text-stone">
              SKIP (0–6)
            </span>
            <span className="text-[13px] text-graphite">
              Low fit. Not worth a message right now.
            </span>
          </div>
        </div>
        <p className="text-[14px] leading-relaxed text-graphite">
          Thresholds are configurable by your admin in the organization&apos;s rubric.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">What you see</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          For each checked prospect, Relay shows:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>The total score and which signals fired</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>What proof from your team is most relevant</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>The recommended approach (e.g., &ldquo;comment on their post first&rdquo;)</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Locked companies</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          A company marked <strong className="text-ink">no</strong> or{" "}
          <strong className="text-ink">dead</strong> is locked for everyone, forever. This
          prevents anyone from wasting time on a company that has already said no or
          gone silent. The lock is enforced at both the application and database level.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/leads" className="text-orange hover:underline">
              Leads
            </Link>
            {" "}— how leads are created, imported, and managed.
          </li>
          <li>
            <Link href="/docs/founder-setup" className="text-orange hover:underline">
              Founder/Admin Setup
            </Link>
            {" "}— configuring the scoring rubric.
          </li>
        </ul>
      </section>
    </div>
  );
}
