import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Documentation | ${siteConfig.name}`,
  description:
    "Learn how Relay works — from setting up your organization and inviting your team to daily BD workflows, outreach, Studio, and analytics.",
  alternates: { canonical: canonicalUrl("/docs") },
  robots: { index: true, follow: true },
};

export default function DocsHomePage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">
          What is Relay?
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay is a human-in-the-loop Revenue Operating System. It helps your team
          find worthwhile opportunities, qualify prospects, draft outreach in each
          rep&apos;s own voice, track every conversation, and turn your expertise into
          content that builds authority.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">What Relay is</h2>
        <ul className="space-y-3 text-[14px] leading-relaxed text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>
              <strong className="text-ink">A decision-support tool, not an autopilot.</strong>{" "}
              Relay prepares research, scores fit, and drafts messages. A human always
              reviews, edits, and sends.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>
              <strong className="text-ink">Built for teams.</strong>{" "}
              Founders and admins invite reps, configure scoring rules, and keep
              oversight over every rep&apos;s activity and outcomes.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>
              <strong className="text-ink">Multi-tenant from the ground up.</strong>{" "}
              Every organization&apos;s data is isolated at the database level. Reps can
              never see another company&apos;s leads, messages, or analytics.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>
              <strong className="text-ink">Two systems, one account.</strong>{" "}
              Relay&apos;s revenue pipeline finds and closes opportunities. Studio turns
              your team&apos;s expertise into consistent, authoritative content.
            </span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">The core loop</h2>
        <ol className="space-y-4 text-[14px] leading-relaxed text-graphite">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              1
            </span>
            <div>
              <p className="font-medium text-ink">Find</p>
              <p>
                Relay surfaces opportunities from Upwork job boards and pasted
                research. Every lead is tagged and queued.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              2
            </span>
            <div>
              <p className="font-medium text-ink">Qualify</p>
              <p>
                Prospect Check scores each lead against your organization&apos;s rubric —
                pure arithmetic, no model tokens. You get a clear verdict: send,
                research more, or skip.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              3
            </span>
            <div>
              <p className="font-medium text-ink">Reach</p>
              <p>
                Relay drafts outreach in the assigned rep&apos;s calibrated voice, grounded
                in real proof from your Facts table. You review and send.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              4
            </span>
            <div>
              <p className="font-medium text-ink">Follow through</p>
              <p>
                Track replies, log outcomes, and let Relay tell you when a one-time
                follow-up is due. The next-best action is always visible.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-line bg-bone-raised p-6">
        <h2 className="text-heading text-lg text-ink">Quick start</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          New here? Follow these in order:
        </p>
        <ol className="mt-4 space-y-2 text-[14px]">
          <li>
            <Link href="/docs/getting-started" className="font-medium text-orange hover:underline">
              Getting Started
            </Link>
            {" "}— create your account and first organization.
          </li>
          <li>
            <Link href="/docs/founder-setup" className="font-medium text-orange hover:underline">
              Founder/Admin Setup
            </Link>
            {" "}— configure your scoring rubric, add proof, invite reps.
          </li>
          <li>
            <Link href="/docs/bd-workflow" className="font-medium text-orange hover:underline">
              BD Daily Workflow
            </Link>
            {" "}— your team&apos;s day-to-day inside Relay.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Trust & privacy</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay takes data governance seriously. Read our{" "}
          <Link href="/trust" className="font-medium text-orange hover:underline">
            Trust Center
          </Link>{" "}
          for a full breakdown of tenant isolation, access controls, data flows, and
          what we send to AI providers.
        </p>
      </section>
    </div>
  );
}
