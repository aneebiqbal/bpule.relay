import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Founder & Admin Setup | ${siteConfig.name}`,
  description:
    "Configure your organization's scoring rubric, add company proof, set daily limits, and invite your team.",
  alternates: { canonical: canonicalUrl("/docs/founder-setup") },
  robots: { index: true, follow: true },
};

export default function FounderSetupPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Founder/Admin Setup</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          The admin is the first person who signs up and the only one who can invite
          others, edit the scoring rubric, and manage proof. Here&apos;s what to configure
          before your team starts working.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Your organization</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          When you signed up, Relay created an organization and copied the default
          scoring rubric as a starting point. Everything below is configurable by you.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Scoring rubric</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Your rubric defines how prospects are scored. It has two parts:
        </p>
        <ul className="space-y-3 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">Signals (max 7 points)</strong> — weighted
              indicators like &ldquo;hiring,&rdquo; &ldquo;recent funding,&rdquo; or &ldquo;asking for help.&rdquo;
              Each signal has a weight you can adjust.
            </div>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">Completeness (max 5 points)</strong> — how much
              evidence exists: URL, name, title, specific evidence, verbatim quote.
            </div>
          </li>
        </ul>
        <p className="text-[14px] leading-relaxed text-graphite">
          The total score (0–12) maps to a verdict:{" "}
          <strong className="text-ink">send (10–12)</strong>,{" "}
          <strong className="text-ink">research more (7–9)</strong>, or{" "}
          <strong className="text-ink">skip (0–6)</strong>. You can adjust the thresholds.
        </p>
        <div className="rounded-lg border border-line bg-bone-raised p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Scoring is pure arithmetic.</strong> No AI model
            is called during scoring. It&apos;s deterministic and instant.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Facts</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Facts are the numbers and proof points Relay can reference in drafts — only
          if they already exist on file. Add things like:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Delivery timelines (&ldquo;shipped in 6 weeks&rdquo;)</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Client results (&ldquo;reduced build time by 40%&rdquo;)</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Team capabilities (&ldquo;8 senior engineers&rdquo;)</span>
          </li>
        </ul>
        <p className="text-[14px] leading-relaxed text-graphite">
          Drafts may only claim numbers that exist in the Facts table. Anything else is
          stripped before the message reaches you.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Profiles &amp; proof</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Add professional profiles (Upwork, LinkedIn, etc.) and attach proof items —
          real project summaries, client reviews, CVs. Proof is matched to prospects
          during drafting so every message is grounded in real work you&apos;ve done.
        </p>
        <p className="text-[14px] leading-relaxed text-graphite">
          Only admins can create or edit profiles and proof items. Reps can read them
          for drafting but not modify them.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Daily limits</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay enforces per-rep daily ceilings by default:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">15 sends</strong> per rep per day</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">20 connection requests</strong> per rep per day</span>
          </li>
        </ul>
        <p className="text-[14px] leading-relaxed text-graphite">
          These keep your team&apos;s activity within safe sending limits. The counters
          reset every 24 hours.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Inviting your team</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Once your rubric and proof are in place, invite reps from the Team page.
          They&apos;ll go through voice calibration on first sign-in. See{" "}
          <Link href="/docs/team" className="font-medium text-orange hover:underline">
            Inviting &amp; Assigning BDs
          </Link>{" "}
          for the details.
        </p>
      </section>

      <section className="rounded-xl border border-cobalt/20 bg-cobalt/5 p-6">
        <h2 className="text-heading text-lg text-ink">Studio setup</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          Relay Studio (the content side) is configured separately. Once your revenue
          pipeline is running, see{" "}
          <Link href="/docs/studio" className="font-medium text-cobalt hover:underline">
            Studio
          </Link>{" "}
          for how to set up content identities, pillars, and personas.
        </p>
      </section>
    </div>
  );
}
