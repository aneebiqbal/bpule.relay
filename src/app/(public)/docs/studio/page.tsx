import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Studio | ${siteConfig.name}`,
  description:
    "Relay Studio turns your team's expertise into consistent, authoritative content. Radar, interview, draft, approve.",
  alternates: { canonical: canonicalUrl("/docs/studio") },
  robots: { index: true, follow: true },
};

export default function StudioPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Studio</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay Studio is the content side of Relay. It turns your team&apos;s real expertise
          into posts that build authority — consistently, without generic AI slop.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">How Studio differs from the revenue pipeline</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-orange/20 bg-orange/5 p-4">
            <p className="text-[13px] font-medium text-orange">Revenue pipeline</p>
            <p className="mt-1 text-[13px] text-graphite">
              Find prospects, qualify, draft outreach, send, track outcomes.
            </p>
          </div>
          <div className="rounded-lg border border-cobalt/20 bg-cobalt/5 p-4">
            <p className="text-[13px] font-medium text-cobalt">Studio</p>
            <p className="mt-1 text-[13px] text-graphite">
              Surface topics from your identity, draft posts, approve, publish yourself.
            </p>
          </div>
        </div>
        <p className="text-[14px] leading-relaxed text-graphite">
          Both share one database and one multi-tenant model, but their pipelines are
          independent. A change to one doesn&apos;t require touching the other.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">The Studio loop</h2>
        <ol className="space-y-4 text-[14px] leading-relaxed text-graphite">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cobalt/10 text-[12px] font-semibold text-cobalt">
              1
            </span>
            <div>
              <p className="font-medium text-ink">Radar</p>
              <p>
                Studio surfaces topics you can credibly write about today, drawn from
                your content identity — your expertise, experience, projects, opinions,
                and voice.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cobalt/10 text-[12px] font-semibold text-cobalt">
              2
            </span>
            <div>
              <p className="font-medium text-ink">Interview</p>
              <p>
                For richer posts, Studio asks you short questions about the topic. Give
                a real answer, and it drafts from that. Rich input skips the interview
                entirely.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cobalt/10 text-[12px] font-semibold text-cobalt">
              3
            </span>
            <div>
              <p className="font-medium text-ink">Draft</p>
              <p>
                A post is drafted in your calibrated voice, grounded in your real proof.
                You can accept, reject, edit, or regenerate.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cobalt/10 text-[12px] font-semibold text-cobalt">
              4
            </span>
            <div>
              <p className="font-medium text-ink">Publish (you)</p>
              <p>
                You copy the post and publish it on LinkedIn, X, or wherever. Relay
                learns from what you keep versus reject and adjusts future suggestions.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Rejection learning</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          When you reject a suggestion, Studio records the feedback. Over time, rejected
          angles become less likely to return. But the system doesn&apos;t stop generating
          entirely — one rejection doesn&apos;t kill a topic forever.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Platform differences</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Studio composes differently for each platform:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt" />
            <span><strong className="text-ink">LinkedIn</strong> — longer, story-structured, professional tone</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt" />
            <span><strong className="text-ink">X</strong> — shorter, sharper, conversational, no Unicode formatting</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">What Studio does not do</h2>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>It does not post automatically anywhere.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>It does not predict virality or claim specific outcomes.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>It does not invent facts, clients, or numbers.</span>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/identities" className="text-orange hover:underline">
              Revenue Identities
            </Link>
            {" "}— how Studio builds your content identity.
          </li>
          <li>
            <Link href="/docs/usage" className="text-orange hover:underline">
              Usage &amp; Limits
            </Link>
            {" "}— Studio generation limits.
          </li>
        </ul>
      </section>
    </div>
  );
}
