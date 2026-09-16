import type { Metadata } from "next";
import Link from "next/link";
import { RelayStructuredData } from "@/components/structured-data";
import { canonicalUrl, siteConfig } from "@/lib/site-config";
import { HeroSurface } from "@/components/hero-surface";
import { ChaosToSignal } from "@/components/chaos-to-signal";
import { SignalField } from "@/components/signal-field";
import { ActionQueueDemo } from "@/components/action-queue-demo";
import { RevenueIdentityFlow } from "@/components/revenue-identity-flow";
import { StudioTodayPick } from "@/components/studio-today-pick";
import { ContentIdentityMap } from "@/components/content-identity-map";
import { IdeaTransformation } from "@/components/idea-transformation";
import { DualSystemConvergence } from "@/components/dual-system-convergence";
import { GrowthLoop } from "@/components/growth-loop";
import { HumanControlSequence, HumanManifesto } from "@/components/human-control-sequence";
import { ProductIndex } from "@/components/product-index";
import { StudioThreshold } from "@/components/studio-threshold";
import { ChapterRail, PageGrain } from "@/components/landing/chapter-rail";
import { RelayCta } from "@/components/landing/relay-cta";
import { InboundReturn } from "@/components/landing/inbound-return";
import { HeroSignalArtwork } from "@/components/hero-signal-artwork";

export const metadata: Metadata = {
  title: `${siteConfig.name} — Know what deserves your attention`,
  description:
    "Relay finds the opportunities worth acting on. Studio finds the ideas worth putting into the world. AI does the preparation — you make the move.",
  alternates: { canonical: canonicalUrl("/") },
  openGraph: {
    title: `${siteConfig.name} — Know what deserves your attention`,
    description:
      "Relay finds the opportunities worth acting on. Studio finds the ideas worth putting into the world.",
    url: canonicalUrl("/"),
    images: [
      {
        url: canonicalUrl("/og"),
        width: siteConfig.ogImage.width,
        height: siteConfig.ogImage.height,
        alt: `${siteConfig.name} — Know what deserves your attention`,
      },
    ],
  },
  twitter: {
    title: `${siteConfig.name} — Know what deserves your attention`,
    description:
      "Relay finds the opportunities worth acting on. Studio finds the ideas worth putting into the world.",
    images: [canonicalUrl("/og")],
  },
};

function Label({
  children,
  color = "orange",
}: {
  children: React.ReactNode;
  color?: "orange" | "cobalt" | "ink";
}) {
  const c = color === "orange" ? "var(--orange)" : color === "cobalt" ? "var(--cobalt)" : "var(--stone)";
  return (
    <span className="text-label tracking-[0.14em]" style={{ color: c }}>
      {children}
    </span>
  );
}

function HeroSection() {
  return (
    <section id="hero" className="relative -mt-[4.5rem] min-h-[88svh] overflow-hidden bg-[var(--bone-050)]">
      {/* Atmospheric backdrop — the generated "Relay Signal" artwork bleeds
          across the whole hero canvas. Desktop only: the mobile layout
          stacks the headline over the full width, leaving no safe zone
          for the noise field to recede into. */}
      <div className="absolute inset-0 hidden lg:block">
        <HeroSignalArtwork />
        <span
          className="pointer-events-none absolute -right-[10%] top-[8%] h-[60%] w-[55%]"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--orange-signal) 13%, transparent), transparent 72%)",
          }}
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -left-[6%] bottom-[-8%] h-[45%] w-[40%]"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--cobalt-signal) 6%, transparent), transparent 75%)",
          }}
          aria-hidden="true"
        />
      </div>

      <div className="relative z-10 flex min-h-[88svh] items-center pt-20 pb-14">
        <div className="landing-shell-wide w-full">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.92fr] lg:gap-8">
            <div className="max-w-xl lg:pr-6">
              <Label>Relay / your next move</Label>
              <h1 className="mt-6 text-hero text-ink">
                Know what
                <br />
                deserves
                <br />
                your attention.
              </h1>
              <p className="mt-5 max-w-sm text-[17px] leading-snug text-[var(--ink-700)]">
                And know what&apos;s worth saying.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <RelayCta href="/signup">Start free</RelayCta>
                <RelayCta href="#chapter-signal" quiet>
                  See Relay in action
                </RelayCta>
              </div>
              <p className="mt-4 text-meta">No card required.</p>
            </div>

            {/* The console's orbit — ambient signals recede around the one that matters */}
            <div className="relative py-10">
              <span
                className="pointer-events-none absolute -inset-x-12 -inset-y-16 hidden lg:block"
                style={{
                  background:
                    "radial-gradient(58% 58% at 50% 40%, color-mix(in srgb, var(--orange-signal) 20%, transparent), transparent 72%)",
                  filter: "blur(2px)",
                }}
                aria-hidden="true"
              />
              <div className="hidden lg:contents">
                <HeroAmbientChip className="-left-8 -top-10" kind="Follow-up" name="Marcus" when="4d" />
                <HeroAmbientChip className="-right-6 -top-3" kind="Studio" name="Idea ready" when="—" tone="cobalt" />
                <HeroAmbientChip className="-left-12 bottom-20" kind="Upwork" name="2 jobs" when="Today" />
                <HeroAmbientChip className="-right-10 bottom-8" kind="Prospect" name="Northstar" when="Next" />
              </div>
              <HeroSurface />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroAmbientChip({
  className,
  kind,
  name,
  when,
  tone = "orange",
}: {
  className: string;
  kind: string;
  name: string;
  when: string;
  tone?: "orange" | "cobalt";
}) {
  return (
    <div
      className={`pointer-events-none absolute z-0 ${className} srf-chip opacity-40 grayscale-[0.5]`}
      style={{ borderColor: "var(--bone-200)" }}
    >
      <span style={{ color: tone === "orange" ? "var(--orange)" : "var(--cobalt)" }}>{kind}</span>
      <span className="text-ink">{name}</span>
      <span className="text-stone">{when}</span>
    </div>
  );
}

function ChaosSection() {
  return (
    <section id="chapter-signal" className="scroll-mt-16">
      <div className="landing-shell">
        <div className="grid items-start gap-10 pt-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <div className="max-w-sm lg:sticky lg:top-28 lg:pt-12">
            <Label>01 — Chaos</Label>
            <h2 className="mt-5 text-chapter text-ink">
              47 things
              <br />
              could use your attention.
            </h2>
            <p className="mt-8 text-chapter text-ink">Three matter.</p>
          </div>
          <ChaosToSignal />
        </div>
      </div>
    </section>
  );
}

function SignalSection() {
  return (
    <section id="how-it-works" className="chapter-sleep scroll-mt-16 border-t border-line">
      <div className="landing-shell landing-section">
        <div className="max-w-md">
          <Label>02 — Signal</Label>
          <h2 className="mt-5 text-chapter text-ink">Not another inbox.</h2>
          <p className="mt-5 landing-measure text-body">
            Most signals stay quiet. A few deserve a closer look — and Relay tells you why.
          </p>
        </div>
        <div className="mt-16">
          <SignalField />
        </div>
      </div>
    </section>
  );
}

function YourRelaySection() {
  return (
    <section id="product" className="chapter-sleep scroll-mt-16 bg-[var(--bone-050)]">
      <div className="landing-shell-wide landing-section-lg">
        <div className="mx-auto max-w-xl text-center">
          <Label>03</Label>
          <h2 className="mt-5 text-chapter text-ink">You don&apos;t need more dashboards.</h2>
          <p className="mt-5 text-[16px] text-[var(--ink-700)]">
            Your CRM remembers what happened. Relay decides what deserves attention now.
          </p>
        </div>
        <div className="mt-16">
          <ActionQueueDemo />
        </div>
      </div>
    </section>
  );
}

function RevenueIdentitiesSection() {
  return (
    <section id="chapter-decision" className="chapter-sleep scroll-mt-16 bg-[var(--bone-100)]">
      <div className="landing-shell-wide landing-section-lg">
        <div className="grid items-end gap-6 sm:grid-cols-[auto_1fr]">
          <p className="text-[clamp(4rem,10vw,7rem)] leading-none font-light tracking-[-0.06em] text-ink">
            04
          </p>
          <h2 className="text-chapter text-ink">
            The right
            <br />
            person.
          </h2>
        </div>
        <div className="mt-14">
          <RevenueIdentityFlow />
        </div>
      </div>
    </section>
  );
}

function HumanGateSection() {
  return (
    <section id="chapter-action" className="chapter-sleep scroll-mt-16">
      <div className="landing-shell flex min-h-[80svh] items-center py-24">
        <HumanControlSequence />
      </div>
    </section>
  );
}

function MeetStudioSection() {
  return (
    <section id="studio" className="chapter-sleep scroll-mt-16 bg-[var(--cobalt-wash)]">
      <div className="landing-shell-wide landing-section-lg">
        <div className="grid items-start gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="max-w-sm">
            <Label color="cobalt">Meet Studio</Label>
            <h2 className="mt-5 text-chapter text-ink">
              Open Studio
              <br />
              with nothing to say.
            </h2>
            <p className="mt-6 text-[18px] text-cobalt">That&apos;s the point.</p>
          </div>
          <StudioTodayPick />
        </div>
      </div>
    </section>
  );
}

function ContentIdentitySection() {
  return (
    <section id="chapter-create" className="chapter-sleep scroll-mt-16 bg-[var(--bone-000)]">
      <div className="landing-shell-wide landing-section-lg">
        <Label color="cobalt">Studio doesn&apos;t start with a prompt.</Label>
        <div className="mt-12">
          <ContentIdentityMap />
        </div>
      </div>
    </section>
  );
}

function IdeaToPostSection() {
  return (
    <section id="idea-to-post" className="chapter-sleep border-t border-line">
      <div className="landing-shell">
        <div className="pt-20">
          <Label color="cobalt">From idea to artifact</Label>
        </div>
        <IdeaTransformation />
      </div>
    </section>
  );
}

function ConvergenceSection() {
  return (
    <section id="chapter-capture" className="chapter-sleep scroll-mt-16 bg-[var(--ink-950)]">
      <DualSystemConvergence dark />
    </section>
  );
}

function FlywheelSection() {
  return (
    <section id="chapter-learn" className="chapter-sleep scroll-mt-16">
      <div className="landing-shell landing-section-lg">
        <div className="max-w-md">
          <Label color="ink">The flywheel</Label>
          <h2 className="mt-5 text-chapter text-ink">Every action teaches the system something.</h2>
        </div>
        <div className="mt-16">
          <GrowthLoop />
        </div>
      </div>
    </section>
  );
}

function ForTeamsSection() {
  const rows = [
    { owner: "Admin", owns: "Truth", items: "Identities · Proof · CVs · Projects · Targets", accent: "var(--cobalt)" },
    { owner: "Rep", owns: "Execution", items: "Prospecting · Replies · Follow-ups · Conversations", accent: "var(--orange)" },
    { owner: "Relay", owns: "The loop", items: "Priority · Preparation · Measurement · History", accent: "var(--ink)" },
  ];

  return (
    <section id="teams" className="chapter-sleep scroll-mt-16">
      <div className="landing-shell landing-section">
        <Label>For teams</Label>
        <h2 className="mt-5 max-w-md text-chapter text-ink">The operating model underneath.</h2>
        <div className="mt-14 overflow-hidden border border-[var(--bone-200)]" style={{ borderRadius: 2 }}>
          {rows.map((row) => (
            <div
              key={row.owner}
              className="grid gap-2 border-b border-[var(--bone-200)] px-4 py-4 last:border-b-0 sm:grid-cols-[7rem_8rem_1fr] sm:items-baseline"
            >
              <p className="text-[14px] font-medium" style={{ color: row.accent }}>
                {row.owner}
              </p>
              <p className="text-[13px] text-ink">{row.owns}</p>
              <p className="text-[13px] text-graphite">{row.items}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HumanInTheLoopSection() {
  return (
    <section id="human-loop" className="chapter-sleep">
      <div className="landing-shell landing-section-lg">
        <h2 className="mx-auto max-w-xl text-center text-hero text-ink">
          AI does the preparation.
          <br />
          People make the move.
        </h2>
        <div className="mt-16">
          <HumanManifesto />
        </div>
      </div>
    </section>
  );
}

function ProductIndexSection() {
  return (
    <section id="product-index" className="chapter-sleep border-t border-line">
      <div className="landing-shell landing-section">
        <Label color="ink">Product depth</Label>
        <h2 className="mt-5 max-w-md text-chapter text-ink">Two systems. One operating rhythm.</h2>
        <div className="mt-16">
          <ProductIndex />
        </div>
      </div>
    </section>
  );
}

function WhoForSection() {
  const segments = [
    "Small software agencies",
    "Development studios",
    "Technical founders",
    "BD teams selling technical services",
  ];

  return (
    <section id="who-for" className="chapter-sleep">
      <div className="landing-shell landing-section">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <Label>Who this is for</Label>
            <h2 className="mt-5 text-chapter text-ink">
              Multiple profiles.
              <br />
              Too many opportunities.
            </h2>
          </div>
          <ul>
            {segments.map((s) => (
              <li key={s} className="border-t border-line py-4 text-[15px] text-ink last:border-b">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function GovernedKnowledgeSection() {
  const points = [
    { label: "Isolated", desc: "Row Level Security at the database, not just the app." },
    { label: "Yours", desc: "Never sold. Never used for ads. Never shared across orgs." },
    { label: "Deletable", desc: "Request deletion anytime. Org data goes when the org does." },
  ];

  return (
    <section id="governance" className="chapter-sleep border-t border-line">
      <div className="landing-shell landing-section">
        <Label color="ink">Data governance</Label>
        <h2 className="mt-5 max-w-md text-chapter text-ink">Your company knowledge stays governed.</h2>
        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {points.map((p) => (
            <div key={p.label}>
              <p className="text-[15px] font-medium text-ink">{p.label}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-graphite">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link href="/trust" className="text-[14px] font-medium text-ink underline-offset-4 hover:underline">
            Trust Center
          </Link>
        </div>
      </div>
    </section>
  );
}

function PricingPreviewSection() {
  return (
    <section id="pricing-preview" className="chapter-sleep">
      <div className="landing-shell landing-section">
        <div className="grid items-end gap-16 lg:grid-cols-2">
          <div>
            <Label color="ink">Pricing</Label>
            <h2 className="mt-5 text-chapter text-ink">Start free. Scale when ready.</h2>
            <p className="mt-5 max-w-sm text-body">
              10 prospect checks. 15 daily sends. 3 Studio generations today. Voice-calibrated drafts.
            </p>
            <div className="mt-8">
              <RelayCta href="/signup">Start free</RelayCta>
            </div>
            <p className="mt-3 text-meta">No credit card required</p>
          </div>
          <div className="border-t border-line pt-6">
            <p className="text-label text-stone">Pro</p>
            <p className="mt-2 text-[15px] text-graphite">For professionals using Relay consistently.</p>
            <p className="mt-4 text-meta">Coming soon</p>
            <Link
              href="/pricing"
              className="mt-6 inline-block text-[13px] font-medium text-ink underline-offset-4 hover:underline"
            >
              See full pricing
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section id="final-cta" className="bg-[var(--bone-050)]">
      <div className="landing-shell landing-section-lg">
        <InboundReturn />
        <div className="mx-auto mt-20 max-w-xl text-center">
          <h2 className="text-hero text-ink">
            Tomorrow morning,
            <br />
            know where to start.
          </h2>
          <div className="mt-10">
            <RelayCta href="/signup">Start free</RelayCta>
          </div>
          <p className="mt-4 text-meta">No card required.</p>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <RelayStructuredData />
      <div className="landing-page">
      <PageGrain />
      <ChapterRail />
      <HeroSection />
      <ChaosSection />
      <SignalSection />
      <YourRelaySection />
      <RevenueIdentitiesSection />
      <HumanGateSection />
      <StudioThreshold />
      <MeetStudioSection />
      <ContentIdentitySection />
      <IdeaToPostSection />
      <ConvergenceSection />
      <FlywheelSection />
      <ForTeamsSection />
      <HumanInTheLoopSection />
      <ProductIndexSection />
      <WhoForSection />
      <GovernedKnowledgeSection />
      <PricingPreviewSection />
      <FinalCTASection />
      </div>
    </>
  );
}
