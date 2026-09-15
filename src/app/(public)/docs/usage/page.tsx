import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Usage & Limits | ${siteConfig.name}`,
  description:
    "Relay's free-plan limits: 10 prospect checks, 15 daily sends, 3 Studio generations per day. How they work.",
  alternates: { canonical: canonicalUrl("/docs/usage") },
  robots: { index: true, follow: true },
};

export default function UsagePage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Usage &amp; Limits</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay is free to start. Here&apos;s what&apos;s included and how limits work.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Free plan</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Revenue pipeline</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-graphite">
              <li>10 prospect checks (lifetime)</li>
              <li>15 daily sends</li>
              <li>20 daily connection requests</li>
              <li>Voice-calibrated drafts</li>
              <li>Outcome tracking</li>
            </ul>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Studio</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-graphite">
              <li>3 Studio generations per day</li>
              <li>Content identity building</li>
              <li>LinkedIn and X composition</li>
              <li>Rejection learning</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">What &ldquo;today&rdquo; means</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Daily sends and Studio generations reset every 24 hours. Prospect checks are a
          lifetime allowance for free accounts.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">What counts as a send?</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          A send is any message Relay drafts for you: connection notes, DMs, follow-ups,
          replies, and Upwork proposals.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Locked companies</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          A company marked <strong className="text-ink">no</strong> or{" "}
          <strong className="text-ink">dead</strong> is locked for everyone, forever. This
          prevents anyone from wasting time on a company that has already said no. It
          also means that company doesn&apos;t count against your prospect checks if it was
          already checked.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-bone-raised p-6">
        <h2 className="text-heading text-lg text-ink">Upcoming plans</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          Pro and Team plans are coming soon with unlimited prospect checks, sends, and
          Studio generations, plus priority processing, advanced analytics, and multi-rep
          support.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-graphite">
          See{" "}
          <Link href="/pricing" className="font-medium text-orange hover:underline">
            Pricing
          </Link>{" "}
          for the latest.
        </p>
      </section>
    </div>
  );
}
