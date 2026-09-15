import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Jobs & Proposals | ${siteConfig.name}`,
  description:
    "How Relay handles Upwork jobs: browse, import, qualify, and draft proposals.",
  alternates: { canonical: canonicalUrl("/docs/jobs") },
  robots: { index: true, follow: true },
};

export default function JobsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Jobs &amp; Proposals</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay helps you find and respond to Upwork jobs. Browse feeds, import jobs
          you want to pursue, and draft proposals grounded in real proof.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Browsing jobs</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          The Upwork section shows job feeds you can browse. Each job displays the title,
          description snippet, budget, and client history. You can filter and search to
          find opportunities that match your team&apos;s capabilities.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Importing a job</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          When you find a job worth pursuing, import it. Relay extracts structured fields
          and creates a lead you can score and draft against just like any other prospect.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Drafting proposals</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Upwork proposals are drafted with the same quality gates as any other outreach:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Written in the assigned rep&apos;s calibrated voice</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Grounded in matched proof from your team&apos;s library</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Only numbers from your Facts table are referenced</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Self-checked and sanitized before you see it</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Tracking responses</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Log every response — interview requests, messages, rejections. Relay tracks
          the outcome and updates your metrics. Over time, this shows which kinds of
          jobs and proposals are working.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-bone-raised p-6">
        <h2 className="text-heading text-lg text-ink">You send the proposal</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          As with all outreach, Relay does not submit proposals on Upwork. You copy the
          draft, paste it into Upwork, and submit it yourself.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/outreach" className="text-orange hover:underline">
              Outreach
            </Link>
            {" "}— the drafting and quality-gate system.
          </li>
          <li>
            <Link href="/docs/analytics" className="text-orange hover:underline">
              Analytics
            </Link>
            {" "}— tracking proposal outcomes and reply rates.
          </li>
        </ul>
      </section>
    </div>
  );
}
