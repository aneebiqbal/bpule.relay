import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Follow-ups & Replies | ${siteConfig.name}`,
  description:
    "Relay's follow-up rule: up to three follow-ups, five working days after each send with no reply, then never again.",
  alternates: { canonical: canonicalUrl("/docs/follow-ups") },
  robots: { index: true, follow: true },
};

export default function FollowUpsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Follow-ups &amp; Replies</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay tracks every conversation stage and tells you when a follow-up is due —
          without spamming anyone.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">The follow-up rule</h2>
        <div className="rounded-xl border border-orange/20 bg-orange/5 p-6">
          <p className="text-[16px] font-medium text-ink">
            Up to three follow-ups. Five working days each. Never a fourth.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-graphite">
            Relay sends <em>you</em> a reminder to follow up: five{" "}
            <strong className="text-ink">working days</strong> (Monday–Friday, not calendar
            days) after the last send, if no reply has come in. This can happen up to three
            times per lead. After the third follow-up is sent, the lead is permanently
            locked out of another.
          </p>
        </div>
        <p className="text-[14px] leading-relaxed text-graphite">
          A reply is permanent. The moment any reply is logged, the lead is ineligible
          for a follow-up — the conversation is alive.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Conversation stages</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay tracks each lead through stages:
        </p>
        <div className="flex flex-wrap gap-2">
          {["Connection", "DM", "Reply", "Follow-up", "Meeting"].map((s) => (
            <span key={s} className="rounded-full border border-line bg-bone-raised px-3 py-1 text-[13px] font-medium text-ink">
              {s}
            </span>
          ))}
        </div>
        <p className="text-[14px] leading-relaxed text-graphite">
          The next-best action is always visible in your queue.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Replies</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          When a prospect replies, log it in Relay. This updates the lead&apos;s status,
          stops any pending follow-up, and lets Relay suggest the next move based on
          what they said.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">What Relay does not do</h2>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>Relay does not send follow-ups automatically. You send them.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>Relay does not repeat follow-ups forever. Up to three per lead, ever.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>Relay does not spam. The five-working-day window is enforced in the database.</span>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/outreach" className="text-orange hover:underline">
              Outreach
            </Link>
            {" "}— the first send that triggers the follow-up window.
          </li>
          <li>
            <Link href="/docs/bd-workflow" className="text-orange hover:underline">
              BD Daily Workflow
            </Link>
            {" "}— how follow-ups fit into the daily routine.
          </li>
        </ul>
      </section>
    </div>
  );
}
