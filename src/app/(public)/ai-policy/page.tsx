import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `AI Policy | ${siteConfig.name}`,
  description:
    "How Relay uses AI: what data is sent to providers, how models are selected, and what we do not claim about AI capabilities.",
  alternates: { canonical: "/ai-policy" },
  robots: { index: true, follow: true },
};

export default function AIPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl section-padding py-20 lg:py-28">
      <h1 className="text-display text-3xl text-ink">AI Policy</h1>
      <p className="mt-4 text-[14px] text-graphite">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </p>

      <div className="mt-12 space-y-8">
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">How Relay uses AI</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay uses AI models to assist with specific tasks: extracting structured data
            from raw research, classifying signals, drafting outreach messages, and generating
            content ideas. AI is used for preparation and recommendation — never for autonomous
            action.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">What data is sent to AI providers</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            When you use an AI feature, the following is sent to the configured providers:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>The raw research you paste (profile, job listing, forum post, etc.)</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Structured lead fields (company, contact, evidence, quote)</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Relevant facts and proof from your organization&apos;s library</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>The rep&apos;s calibrated voice style card</span>
            </li>
          </ul>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay does <strong className="text-ink">not</strong> send passwords, API keys,
            session tokens, or analytics IDs to AI providers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Model selection and tiers</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay uses a tiered model chain. Every provider is optional — a provider only
            enters the chain if its API key is configured:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">Groq</strong> — extraction, classification, and
                fallback. Free tier by default.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">LongCat</strong> — primary writer for drafts,
                posts, proposals, and connection notes.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">OpenAI</strong> — escalation only when cheaper
                tiers fail deterministic quality gates. Target: less than 5% of generations
                reach this tier.
              </span>
            </li>
          </ul>
          <p className="text-[14px] leading-relaxed text-graphite">
            Scoring is <strong className="text-ink">not</strong> an AI task — it is pure
            arithmetic and requires zero model tokens.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Quality and guardrails</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay applies deterministic guardrails to every AI output:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Drafts may only claim numbers that exist in your Facts table. Anything else is stripped.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>No em dashes in generated text; replaced with hyphens.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Every draft is self-checked against quality gates before you see it.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Daily AI budgets cap total spend; per-rep send ceilings cap activity.</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">What Relay does not do with AI</h2>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>Relay does not send messages or post content automatically.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>Relay does not invent facts, clients, or numbers.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>Relay does not predict virality or guarantee specific outcomes.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
              <span>Relay does not train its own models on your data.</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Model training</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay itself does not train models. Whether the AI providers we route to use your
            data for training depends on their individual terms. We recommend reviewing each
            provider&apos;s data usage policy and configuring any available opt-outs according
            to your organization&apos;s compliance requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Human responsibility</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            AI-generated drafts and suggestions are starting points, not final products. You
            are responsible for reviewing, editing, and approving every message before it is
            sent and every piece of content before it is published. Relay is a
            decision-support tool — the decisions are yours.
          </p>
        </section>

        <section className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Requires founder/lawyer confirmation:</strong>{" "}
            This policy describes Relay&apos;s actual AI practices. The training behavior of
            third-party AI providers is governed by their terms, not ours. We recommend
            reviewing each provider&apos;s current data usage policy and consulting qualified
            legal counsel for your specific compliance requirements.
          </p>
        </section>
      </div>
    </div>
  );
}
