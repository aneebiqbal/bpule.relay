import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `FAQ | ${siteConfig.name}`,
  description:
    "Frequently asked questions about Relay: how it works, data privacy, AI usage, and getting started.",
  alternates: { canonical: canonicalUrl("/docs/faq") },
  robots: { index: true, follow: true },
};

const FAQ = [
  {
    q: "Does Relay send messages automatically?",
    a: "No. Relay drafts messages. You review, edit, and send them yourself — on LinkedIn, Upwork, email, or anywhere else. This is by design.",
  },
  {
    q: "Can Relay post content on my behalf?",
    a: "No. Studio drafts posts. You review and publish them yourself on LinkedIn, X, or wherever you choose.",
  },
  {
    q: "What AI models does Relay use?",
    a: "Relay uses a tiered model chain. Extraction runs on Groq (free tier by default). Drafting uses a primary writer model, with escalation to stronger models only when cheaper tiers fail quality gates. You control which providers are active via API keys.",
  },
  {
    q: "Is my data used to train AI models?",
    a: "Content you paste for analysis is processed by AI models to generate recommendations. It is not used to third-party model training. See our AI Policy for the full details.",
  },
  {
    q: "Who can see my organization's data?",
    a: "Only members of your organization. Data is isolated at the database level (Row Level Security), not just filtered in application code. Another organization can never see your data.",
  },
  {
    q: "Who inside my organization can see what?",
    a: "Admins can see all data within the organization. Reps can see shared leads, messages, and outcomes, but not another rep's private content personas or drafts.",
  },
  {
    q: "How does scoring work?",
    a: "Scoring is pure arithmetic — no AI model is called. It's deterministic and instant. Signals (max 7) plus completeness (max 5) give a total out of 12, which maps to a verdict: send, research more, or skip.",
  },
  {
    q: "What happens when I mark a company 'no' or 'dead'?",
    a: "That company is locked for everyone in your organization, forever. No one can add it again or waste time on it. This is enforced at both the application and database level.",
  },
  {
    q: "What are the free-plan limits?",
    a: "10 prospect checks (lifetime), 15 daily sends, 20 daily connections, and 3 Studio generations per day. Daily limits reset every 24 hours.",
  },
  {
    q: "Can I change my voice calibration?",
    a: "Yes. Recalibrate any time from your profile settings. The more real samples you paste, the better the calibration.",
  },
  {
    q: "Do you offer refunds?",
    a: "If Relay isn't working for you, contact us within 14 days of upgrading for a full refund.",
  },
  {
    q: "How do I delete my data?",
    a: "Contact your organization's admin for team-level data, or reach out to us directly. Account deletion removes your personal data and dissociates you from the organization.",
  },
];

export default function FAQPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">FAQ</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Common questions about Relay.
        </p>
      </div>

      <div className="divide-y divide-line">
        {FAQ.map((item) => (
          <div key={item.q} className="py-6 first:pt-0">
            <p className="text-[15px] font-medium text-ink">{item.q}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-graphite">{item.a}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-line bg-bone-raised p-6">
        <h2 className="text-heading text-lg text-ink">Still have questions?</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          Read the{" "}
          <Link href="/trust" className="font-medium text-orange hover:underline">
            Trust Center
          </Link>{" "}
          for security and privacy details, or the{" "}
          <Link href="/docs" className="font-medium text-orange hover:underline">
            Documentation
          </Link>{" "}
          for the full product walkthrough.
        </p>
      </section>
    </div>
  );
}
