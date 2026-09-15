import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Analytics | ${siteConfig.name}`,
  description:
    "What Relay tracks: reply rates, pipeline metrics, AI costs, and extraction performance.",
  alternates: { canonical: canonicalUrl("/docs/analytics") },
  robots: { index: true, follow: true },
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Analytics</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay tracks what matters for running a repeatable revenue operation — without
          invasive monitoring.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Pipeline metrics</h2>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Reply rate</strong> — replied leads / sent leads, per rep and overall</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Read-to-check rate</strong> — how often checked leads get a reply</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Per-play performance</strong> — which outreach templates produce replies</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Queue size</strong> — how many leads are at each stage</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">AI pipeline metrics</h2>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Extraction</strong> — total runs, failure rate, avg/p95 latency</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Cost by tier</strong> — how much each AI provider costs</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Free-tier share</strong> — percentage of requests on the cheapest tier</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Analytics privacy</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay uses PostHog for product analytics. The configuration is privacy-conscious:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Identified-only mode — no anonymous profiles</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Autocapture disabled — only explicit events are tracked</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Session recording disabled</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Do Not Track is respected</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>No passwords, tokens, message bodies, or draft content are ever sent</span>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/oversight" className="text-orange hover:underline">
              Team Oversight
            </Link>
            {" "}— how admins use these metrics.
          </li>
          <li>
            <Link href="/trust" className="text-orange hover:underline">
              Trust Center
            </Link>
            {" "}— full analytics and data-flow details.
          </li>
        </ul>
      </section>
    </div>
  );
}
