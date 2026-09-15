import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Getting Started | ${siteConfig.name}`,
  description:
    "Create your Relay account, configure your organization, and invite your first team members.",
  alternates: { canonical: canonicalUrl("/docs/getting-started") },
  robots: { index: true, follow: true },
};

export default function GettingStartedPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Getting Started</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Create your account in minutes. No credit card required.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">1. Create your account</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Go to{" "}
          <Link href="/signup" className="font-medium text-orange hover:underline">
            /signup
          </Link>{" "}
          and enter your organization name, email, and password. The first person to
          sign up becomes the organization&apos;s admin — the person who can invite
          others, configure scoring rules, and manage access.
        </p>
        <div className="rounded-lg border border-line bg-bone-raised p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Email verification required.</strong> You&apos;ll
            receive a confirmation email before you can sign in. This prevents anyone
            from registering with an email they don&apos;t own.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">2. Complete voice calibration</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          After your first sign-in, Relay walks you through voice calibration — a short
          quiz plus optional pasted writing samples. This builds your style card,
          which every later draft is written to match.
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>The quiz asks about tone, sentence length, and common phrases you use.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Pasting real messages you&apos;ve written produces the strongest calibration.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>You can recalibrate any time from your profile settings.</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">3. Configure your organization</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          As admin, head to{" "}
          <Link href="/docs/founder-setup" className="font-medium text-orange hover:underline">
            Founder/Admin Setup
          </Link>{" "}
          to set up your scoring rubric, add company proof, and configure daily limits
          before inviting your team.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">4. Invite your team</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Invite reps and sourcers from the Team page. Each invited person gets their
          own calibrated voice profile and access to the shared lead pipeline. See{" "}
          <Link href="/docs/team" className="font-medium text-orange hover:underline">
            Inviting &amp; Assigning BDs
          </Link>{" "}
          for details.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">5. Start working the pipeline</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Once your team is set up, the daily workflow is: open your queue, check a
          prospect, draft outreach, send it yourself, and log the outcome. Relay
          tracks everything from there. See{" "}
          <Link href="/docs/bd-workflow" className="font-medium text-orange hover:underline">
            BD Daily Workflow
          </Link>{" "}
          for the full picture.
        </p>
      </section>

      <section className="rounded-xl border border-orange/20 bg-orange/5 p-6">
        <h2 className="text-heading text-lg text-ink">Demo mode</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          Want to try Relay without an account or API keys? The app runs in demo mode
          with a seeded organization, sample reps, and mock leads. No data you enter
          in demo mode is stored permanently.
        </p>
      </section>
    </div>
  );
}
