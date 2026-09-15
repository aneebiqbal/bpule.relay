import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Outreach | ${siteConfig.name}`,
  description:
    "How Relay drafts outreach in each rep's voice, grounded in real proof, with human review before every send.",
  alternates: { canonical: canonicalUrl("/docs/outreach") },
  robots: { index: true, follow: true },
};

export default function OutreachPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Outreach</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay drafts outreach messages in each rep&apos;s calibrated voice, grounded in
          real proof from your Facts table. You always review before sending.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">How drafts are created</h2>
        <ol className="space-y-3 text-[14px] text-graphite">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              1
            </span>
            <span>You open a scored lead and request a draft.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              2
            </span>
            <span>Relay matches the lead to the most relevant proof from your team&apos;s library.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              3
            </span>
            <span>A draft is generated in the assigned rep&apos;s voice, referencing only facts that exist on file.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              4
            </span>
            <span>The draft is self-checked and sanitized before you see it.</span>
          </li>
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Quality gates</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Every draft is checked against these rules before it reaches you:
        </p>
        <ul className="space-y-3 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">No invented numbers.</strong> Drafts may only claim
              numbers that exist in the Facts table. Anything else is stripped.
            </div>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">No em dashes.</strong> Replaced with hyphens.
            </div>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">Self-check pass.</strong> The draft must pass two
              tests: a senior engineer would reply, and the message would survive a company
              swap.
            </div>
          </li>
        </ul>
        <p className="text-[14px] leading-relaxed text-graphite">
          If a check fails, the draft is rewritten once on the same call. A failed rewrite
          still reaches you flagged, never half-passed without your knowledge.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Message types</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay drafts several kinds of outreach:
        </p>
        <div className="flex flex-wrap gap-2">
          {["Connection note", "DM", "Follow-up", "Reply", "Upwork proposal"].map((t) => (
            <span key={t} className="rounded-full border border-line bg-bone-raised px-3 py-1 text-[13px] font-medium text-ink">
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">You send the message</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay does not send messages. You copy the draft, paste it into LinkedIn,
          Upwork, or email, and send it yourself. After sending, paste the final text
          back into Relay so outcomes can be scored accurately.
        </p>
        <div className="rounded-lg border border-orange/20 bg-orange/5 p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">This is by design.</strong> Relay is a
            decision-support tool. The decisions — and the sending — are yours.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Daily limits</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Each rep has a daily send ceiling (default 15) to keep activity within safe
          limits. The counter resets every 24 hours.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/follow-ups" className="text-orange hover:underline">
              Follow-ups &amp; Replies
            </Link>
            {" "}— continuing the conversation after the first send.
          </li>
          <li>
            <Link href="/docs/jobs" className="text-orange hover:underline">
              Jobs &amp; Proposals
            </Link>
            {" "}— Upwork-specific outreach.
          </li>
        </ul>
      </section>
    </div>
  );
}
