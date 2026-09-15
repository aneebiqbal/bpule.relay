import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Team Oversight | ${siteConfig.name}`,
  description:
    "How admins monitor team activity, track metrics, and manage performance in Relay.",
  alternates: { canonical: canonicalUrl("/docs/oversight") },
  robots: { index: true, follow: true },
};

export default function OversightPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Team Oversight</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Admins have full visibility into team activity and outcomes. Here&apos;s what you
          can see and how to use it.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Team page</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          The Team page shows every rep&apos;s activity and outcomes in one place:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Sends and replies per rep</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Reply rate (replied leads / sent leads)</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Read-to-check rate</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Per-play performance</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Extraction metrics</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay tracks how the AI pipeline is performing:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Total extractions, failure rate, and latency (avg and p95)</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Cost breakdown by model tier</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Free-tier share of total requests</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Per-rep visibility</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Admins can see every rep&apos;s queue, leads, and outcomes. This is deliberate —
          your team shares one pipeline, and the admin is responsible for oversight.
        </p>
        <p className="text-[14px] leading-relaxed text-graphite">
          Reps cannot see another rep&apos;s private content personas or drafts. Leads,
          messages, and outcomes are shared across the organization.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Managing reps</h2>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Invite new reps from the Team page</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Reassign leads between reps</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Remove a rep (their leads return to the shared queue)</span>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/team" className="text-orange hover:underline">
              Inviting &amp; Assigning BDs
            </Link>
            {" "}— the invitation and role system.
          </li>
          <li>
            <Link href="/docs/analytics" className="text-orange hover:underline">
              Analytics
            </Link>
            {" "}— the full metrics available.
          </li>
        </ul>
      </section>
    </div>
  );
}
