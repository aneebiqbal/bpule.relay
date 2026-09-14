import type { Metadata } from "next";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Privacy Policy | ${siteConfig.name}`,
  description: `How ${siteConfig.name} collects, uses, and protects your data. We never sell your data and only use it to provide our services.`,
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
          <h2 className="text-heading text-xl text-ink">Information we collect</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We collect information you provide directly: your email,
            organization name, password, and any content you paste into Relay
            for analysis (prospect profiles, writing samples, etc.).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">How we use it</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We use your information solely to provide Relay&apos;s services:
            qualifying prospects, drafting messages, generating content ideas,
            and improving your experience. We never sell your data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Data storage</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Your data is stored securely using Supabase infrastructure. You can
            request deletion of your account and all associated data at any time
            by contacting us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">AI processing</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Content you paste for analysis is processed by AI models to generate
            recommendations. This content is not used to train third-party
            models.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Contact</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Questions about this policy? Contact us at privacy@relay.bpulse.dev.
          </p>
        </section>
      </div>
    </div>
  );
}
