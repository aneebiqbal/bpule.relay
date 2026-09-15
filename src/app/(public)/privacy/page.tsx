import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Privacy Policy | ${siteConfig.name}`,
  description: `How ${siteConfig.name} collects, uses, and protects your data. We never sell your data. Tenant isolation is enforced at the database level.`,
  alternates: { canonical: canonicalUrl("/privacy") },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl section-padding py-20 lg:py-28">
      <h1 className="text-display text-3xl text-ink">Privacy Policy</h1>
      <p className="mt-4 text-[14px] text-graphite">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </p>

      <div className="mt-12 space-y-8">
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">What this covers</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            This policy explains how Relay collects, uses, stores, and protects your data.
            It applies to all users of Relay, including admins, reps, and visitors to our
            website. By using Relay, you agree to this policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Information we collect</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We collect information you provide directly:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Account information: your email, organization name, and password</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Content you paste for analysis: prospect profiles, writing samples, job listings, etc.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Leads, messages, facts, proof, and voice profiles you create</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Usage events: explicit product analytics (page views, feature usage)</span>
            </li>
          </ul>
          <p className="text-[14px] leading-relaxed text-graphite">
            We do not collect sensitive personal data such as government identifiers, health
            information, or financial account numbers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">How we use your information</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We use your data solely to provide Relay&apos;s services:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Qualifying prospects against your organization&apos;s rubric</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Drafting outreach in each rep&apos;s calibrated voice</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Generating content ideas in Studio from your expertise</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Tracking outcomes and surfacing the next-best action</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Improving the product through privacy-conscious analytics</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Data storage and protection</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Your data is stored on Supabase infrastructure (PostgreSQL database, auth, and
            storage). Protection measures include:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Encryption in transit (TLS) and at rest (via Supabase)</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Row Level Security enforcing tenant isolation at the database level</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Role-based access control (admin vs. rep)</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Daily automated backups via Supabase</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">AI processing</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Content you paste for analysis is processed by AI models to generate
            recommendations. This content is sent to the configured AI providers (Groq,
            LongCat, and OpenAI for escalation) as described in our{" "}
            <Link href="/ai-policy" className="font-medium text-orange hover:underline">
              AI Policy
            </Link>.
            Relay itself does not use your data to train models.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Analytics</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay uses PostHog for product analytics with privacy-conscious settings:
            identified-only mode, autocapture disabled, session recording disabled, and Do
            Not Track respected. No passwords, tokens, message bodies, or draft content are
            ever sent to analytics.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">What we do not do</h2>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>We do not sell your data.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>We do not use your data for advertising.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>We do not share your data with other organizations.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>We do not access your data except to provide the service or with your permission.</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Data retention and deletion</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We retain your data as long as your organization&apos;s account is active. You can
            request deletion of your account and associated data at any time. Organization-level
            data is deleted when the organization is deleted by its admin.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Subprocessors</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay uses the following subprocessors: Vercel (hosting), Supabase (database,
            auth, storage), Groq, LongCat, and OpenAI (AI providers), and PostHog
            (analytics). For details on what data each receives, see the{" "}
            <Link href="/trust" className="font-medium text-orange hover:underline">
              Trust Center
            </Link>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Changes to this policy</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We may update this policy. Significant changes will be communicated via email
            and posted here with an updated date. Continued use of Relay after changes
            means you accept the updated policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Contact</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Questions about this policy or your data? Contact us at{" "}
            <Link href="mailto:privacy@relay.bpulse.dev" className="font-medium text-orange hover:underline">
              privacy@relay.bpulse.dev
            </Link>.
          </p>
        </section>

        <section className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Requires founder/lawyer confirmation:</strong>{" "}
            This privacy policy is a transparent description of our data practices. It is
            not jurisdiction-specific legal advice. We recommend having qualified legal
            counsel review it for compliance with applicable laws in your jurisdiction
            (GDPR, CCPA, etc.).
          </p>
        </section>
      </div>
    </div>
  );
}
