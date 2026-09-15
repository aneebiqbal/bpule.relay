import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Acceptable Use Policy | ${siteConfig.name}`,
  description:
    "What you can and cannot do with Relay. Relay is a decision-support tool — you remain responsible for every message sent and every piece of content published.",
  alternates: { canonical: "/acceptable-use" },
  robots: { index: true, follow: true },
};

export default function AcceptableUsePage() {
  return (
    <div className="mx-auto max-w-3xl section-padding py-20 lg:py-28">
      <h1 className="text-display text-3xl text-ink">Acceptable Use Policy</h1>
      <p className="mt-4 text-[14px] text-graphite">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </p>

      <div className="mt-12 space-y-8">
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Purpose</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay is a decision-support tool. It helps you find opportunities, qualify
            prospects, draft outreach, and generate content ideas. It does not send
            messages or post content on your behalf. This policy sets clear boundaries for
            how Relay may be used.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">You are responsible for your actions</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            You remain fully responsible for every message you send and every piece of
            content you publish, whether drafted with Relay&apos;s assistance or not. Relay
            provides recommendations; the decisions and actions are yours.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Prohibited uses</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            You agree not to use Relay to:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Send spam, unsolicited bulk messages, or harass anyone</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Impersonate another person or misrepresent your identity or affiliation</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Generate content that is defamatory, fraudulent, or deceptive</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Violate any applicable law, regulation, or third-party terms of service</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Attempt to access another organization&apos;s data or circumvent access controls</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Use Relay to build a competing product or service</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Daily limits</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay enforces per-rep daily ceilings on sends and connection requests. These
            limits exist to keep your activity within safe, respectful bounds. Attempting
            to circumvent these limits is a violation of this policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Enforcement</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We may suspend or terminate accounts that violate this policy. If we believe
            your use of Relay creates legal liability for us or harms other users, we will
            act to stop it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Reporting violations</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            If you become aware of a violation of this policy, contact us at{" "}
            <Link href="mailto:abuse@relay.bpulse.dev" className="font-medium text-orange hover:underline">
              abuse@relay.bpulse.dev
            </Link>.
          </p>
        </section>

        <section className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Requires founder/lawyer confirmation:</strong>{" "}
            This policy is a starting framework. It does not constitute legal advice. We
            recommend having qualified legal counsel review it for your jurisdiction and
            specific circumstances.
          </p>
        </section>
      </div>
    </div>
  );
}
