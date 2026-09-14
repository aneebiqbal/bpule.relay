import type { Metadata } from "next";
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
          <h2 className="text-heading text-xl text-ink">Acceptance</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            By using Relay, you agree to these terms. If you do not agree, do
            not use the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">The service</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay provides AI-assisted lead qualification, outreach drafting, and
            content generation. You remain fully responsible for every message
            you send and every piece of content you publish.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Acceptable use</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Do not use Relay to send spam, harass people, or violate any
            applicable laws. Relay is a decision-support tool — the decisions
            are yours.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Account</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            You are responsible for keeping your account secure and for all
            activity under your account.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Changes</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We may update these terms. Significant changes will be communicated
            via email.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Contact</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Questions? Contact us at legal@relay.bpulse.dev.
          </p>
        </section>
      </div>
    </div>
  );
}
