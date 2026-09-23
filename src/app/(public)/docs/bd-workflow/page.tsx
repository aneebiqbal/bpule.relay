import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `BD Daily Workflow | ${siteConfig.name}`,
  description:
    "A business developer's daily workflow inside Relay: queue, prospect check, draft, send, log outcome.",
  alternates: { canonical: canonicalUrl("/docs/bd-workflow") },
  robots: { index: true, follow: true },
};

export default function BDWorkflowPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">BD Daily Workflow</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Here&apos;s what a typical day looks like for a rep working inside Relay.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">1. Open your queue</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          The dashboard shows your priority queue: leads that are new, need follow-up,
          or have a reply waiting. Each lead shows its score, verdict, and status at a
          glance.
        </p>
        <p className="text-[14px] leading-relaxed text-graphite">
          The queue also shows your daily send count and how many sends you have left.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">2. Check a prospect</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Open a lead to see the full Prospect Check: the score breakdown, which signals
          fired, what proof matches, and the recommended approach. If the verdict is
          &ldquo;send,&rdquo; you can move to drafting. If it&apos;s &ldquo;research more,&rdquo; Relay
          tells you what&apos;s missing.
        </p>
        <p className="text-[14px] leading-relaxed text-graphite">
          See{" "}
          <Link href="/docs/prospect-check" className="font-medium text-orange hover:underline">
            Prospect Check
          </Link>{" "}
          for the full scoring breakdown.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">3. Draft outreach</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Click to draft. Relay generates a message in your calibrated voice, grounded
          in the matched proof from your Facts table. The draft is self-checked against
          two quality gates before you see it:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Would a senior engineer reply to this?</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Would this message survive a company swap?</span>
          </li>
        </ul>
        <p className="text-[14px] leading-relaxed text-graphite">
          If a check fails, the draft is rewritten once. You always review before
          sending.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">4. Send (you, not Relay)</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay does not send messages. You copy the draft, paste it into LinkedIn,
          Upwork, or email, and send it yourself. This is by design — Relay is a
          decision-support tool, not an autopilot.
        </p>
        <div className="rounded-lg border border-orange/20 bg-orange/5 p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Log what you actually sent.</strong> After
            sending, paste the final text back into Relay so outcomes can be scored
            accurately.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">5. Log the outcome</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Mark the lead&apos;s status as it progresses: contacted, followed up, replied,
            no response, or closed. Relay uses this to calculate your reply rate and
            surface the next-best action.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">6. Follow up when due</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay tracks when a follow-up is due: up to three follow-ups, five working days
          after each send with no reply, then never again. The queue surfaces these
          automatically.
        </p>
        <p className="text-[14px] leading-relaxed text-graphite">
          See{" "}
          <Link href="/docs/follow-ups" className="font-medium text-orange hover:underline">
            Follow-ups &amp; Replies
          </Link>{" "}
          for the exact rules.
        </p>
      </section>

      <section className="rounded-xl border border-cobalt/20 bg-cobalt/5 p-6">
        <h2 className="text-heading text-lg text-ink">Studio (optional)</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          Many reps also use Studio to build authority through content. Studio is a
          separate workflow — see{" "}
          <Link href="/docs/studio" className="font-medium text-cobalt hover:underline">
            Studio
          </Link>{" "}
          for how it fits into your day.
        </p>
      </section>
    </div>
  );
}
