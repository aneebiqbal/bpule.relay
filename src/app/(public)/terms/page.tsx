import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Terms of Service | ${siteConfig.name}`,
  description: `${siteConfig.name}'s terms of service. By using our service you agree to these terms. You remain responsible for all messages sent and content published.`,
  alternates: { canonical: canonicalUrl("/terms") },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl section-padding py-20 lg:py-28">
      <h1 className="text-display text-3xl text-ink">Terms of Service</h1>
      <p className="mt-4 text-[14px] text-graphite">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </p>

      <div className="mt-12 space-y-8">
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Agreement to terms</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            By accessing or using Relay, you agree to these terms. If you do not agree,
            do not use the service. If you are using Relay on behalf of an organization,
            you represent that you have the authority to bind that organization to these
            terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">The service</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay provides AI-assisted lead qualification, outreach drafting, content
            generation, and analytics. It is a decision-support tool — not an autopilot.
            Relay does not send messages or post content on your behalf.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Your responsibilities</h2>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>You are responsible for keeping your account secure and for all activity under your account.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>You are responsible for every message you send and every piece of content you publish.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>You must comply with all applicable laws, regulations, and third-party terms.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>You must not use Relay to send spam, harass anyone, or misrepresent your identity.</span>
            </li>
          </ul>
          <p className="text-[14px] leading-relaxed text-graphite">
            For a complete list of prohibited uses, see our{" "}
            <Link href="/acceptable-use" className="font-medium text-orange hover:underline">
              Acceptable Use Policy
            </Link>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Account roles</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay has two roles: <strong className="text-ink">admin</strong> (manages the
            organization, invites members, configures rules) and{" "}
            <strong className="text-ink">rep</strong> (works the pipeline). The first person
            to sign up becomes the admin. Admins are responsible for managing their
            organization&apos;s members and data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Data ownership</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            You own your data. Organization-level data belongs to the organization.
            Relay does not sell your data or use it for any purpose other than providing
            the service. See our{" "}
            <Link href="/privacy" className="font-medium text-orange hover:underline">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">AI and automated outputs</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay uses AI models to assist with research, drafting, and content generation.
            AI outputs are recommendations, not facts. You are responsible for reviewing
            and approving all outputs before they are sent or published. See our{" "}
            <Link href="/ai-policy" className="font-medium text-orange hover:underline">
              AI Policy
            </Link>{" "}
            for details on model selection, data flows, and guardrails.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Service availability</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We strive to keep Relay available but do not guarantee uninterrupted or
            error-free service. Relay depends on third-party infrastructure (Vercel,
            Supabase) and AI providers (Groq, LongCat, OpenAI) whose availability we do
            not control.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Limitation of liability</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            To the maximum extent permitted by law, Relay is provided &ldquo;as is&rdquo; without
            warranties of any kind. We are not liable for any indirect, incidental, or
            consequential damages arising from your use of Relay. Our total liability is
            limited to the amount you paid us in the twelve months preceding the claim.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Termination</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            You may stop using Relay at any time. We may suspend or terminate accounts
            that violate these terms. Upon termination, you may request export or deletion
            of your data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Changes to these terms</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We may update these terms. Significant changes will be communicated via email.
            Continued use of Relay after changes means you accept the updated terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Contact</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Questions about these terms? Contact us at{" "}
            <Link href="mailto:legal@relay.bpulse.dev" className="font-medium text-orange hover:underline">
              legal@relay.bpulse.dev
            </Link>.
          </p>
        </section>

        <section className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Requires founder/lawyer confirmation:</strong>{" "}
            These terms are a starting framework, not jurisdiction-specific legal advice.
            We strongly recommend having qualified legal counsel review them for
            enforceability in your jurisdiction and suitability for your specific use case.
            The limitation of liability clause in particular may not be enforceable in all
            jurisdictions.
          </p>
        </section>
      </div>
    </div>
  );
}
