import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Search,
  Users,
  PenLine,
  MessageSquare,
  Target,
  CheckCircle2,
  XCircle,
  Zap,
  BarChart3,
  Briefcase,
  FileText,
  Mail,
  StickyNote,
  Bot,
  LayoutGrid,
} from "lucide-react";
import { SignalRelay } from "@/components/signal-node";
import { ScoreRing } from "@/components/score-ring";
import { RelayStructuredData } from "@/components/structured-data";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description:
    "Relay tells you what deserves your attention — and helps you act on it. Find opportunities worth pursuing, qualify prospects, draft in your voice, and build authority with Studio.",
  alternates: { canonical: canonicalUrl("/") },
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description:
      "Relay finds opportunities worth your attention, helps you reach the right people, and turns your expertise into authority.",
    url: canonicalUrl("/"),
    images: [
      {
        url: canonicalUrl("/og"),
        width: siteConfig.ogImage.width,
        height: siteConfig.ogImage.height,
        alt: `${siteConfig.name} — ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description:
      "Relay finds opportunities worth your attention, helps you reach the right people, and turns your expertise into authority.",
    images: [canonicalUrl("/og")],
  },
};

/* ═══════════════════════════════════════════════════════════
   Shared section primitives
   ═══════════════════════════════════════════════════════════ */

function SectionEyebrow({ children, color = "orange" }: { children: React.ReactNode; color?: "orange" | "cobalt" }) {
  return (
    <span
      className="text-label tracking-[0.14em]"
      style={{ color: color === "orange" ? "var(--orange)" : "var(--cobalt)" }}
    >
      {children}
    </span>
  );
}

function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-display text-3xl text-ink sm:text-4xl lg:text-5xl">
      {children}
    </h2>
  );
}

/* ═══════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════ */

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Subtle signal line decoration */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
        aria-hidden="true"
      >
        <line
          x1="0"
          y1="0"
          x2="100%"
          y2="100%"
          stroke="var(--orange)"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        <line
          x1="100%"
          y1="0"
          x2="0"
          y2="100%"
          stroke="var(--cobalt)"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
      </svg>

      <div className="mx-auto max-w-6xl section-padding pb-20 pt-16 lg:pb-32 lg:pt-24">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Copy */}
          <div className="space-y-8">
            <SectionEyebrow>RELAY / YOUR NEXT MOVE</SectionEyebrow>

            <h1 className="text-display text-4xl text-ink sm:text-5xl lg:text-6xl">
              Know what to do next.
            </h1>

            <p className="max-w-md text-[16px] leading-relaxed text-graphite">
              Relay finds the opportunities worth your attention, helps you reach
              the right people, and turns your expertise into content that builds
              authority.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="group inline-flex h-11 items-center gap-2 rounded-lg bg-orange px-5 text-[14px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
              >
                Start free
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-5 text-[14px] font-medium text-ink transition-colors hover:bg-bone-raised"
              >
                See how Relay works
              </Link>
            </div>

            <p className="text-mono-regular text-[12px] text-stone">
              No card required
            </p>
          </div>

          {/* Interactive signal demonstration */}
          <div className="relative">
            <SignalRelay />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SOCIAL PROOF / AUDIENCE
   ═══════════════════════════════════════════════════════════ */

function AudienceSection() {
  const audiences = [
    "Consultants",
    "Founders",
    "Developers",
    "BD teams",
    "Agencies",
    "Independent professionals",
  ];

  return (
    <section className="border-t border-line bg-bone-raised">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[15px] leading-relaxed text-graphite">
            Built for people who have too much opportunity data and too little time.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {audiences.map((a) => (
              <span
                key={a}
                className="rounded-full border border-line bg-bone px-4 py-1.5 text-[13px] font-medium text-ink"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   THE PROBLEM
   ═══════════════════════════════════════════════════════════ */

function ProblemSection() {
  const tools = [
    { icon: MessageSquare, label: "LinkedIn" },
    { icon: Briefcase, label: "Job boards" },
    { icon: LayoutGrid, label: "CRM" },
    { icon: Mail, label: "Email" },
    { icon: StickyNote, label: "Notes" },
    { icon: Bot, label: "AI chat" },
    { icon: FileText, label: "Content tools" },
    { icon: BarChart3, label: "Spreadsheets" },
  ];

  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-20">
          {/* Left: problem statement */}
          <div className="space-y-6">
            <SectionEyebrow>THE PROBLEM</SectionEyebrow>
            <SectionHeading>More tools didn&apos;t make the work clearer.</SectionHeading>
            <p className="text-[16px] leading-relaxed text-graphite">
              The signal is scattered across a dozen surfaces. You still have to
              decide what matters, who to contact, and what to say.
            </p>
            <p className="text-[16px] leading-relaxed text-ink">
              Relay is the decision layer between all that information and what you
              actually do next.
            </p>
          </div>

          {/* Right: scattered → focused visual */}
          <div className="relative flex items-center justify-center">
            {/* Scattered tools */}
            <div className="relative h-72 w-72">
              {tools.map((tool, i) => {
                const angle = (i / tools.length) * Math.PI * 2 - Math.PI / 2;
                const radius = 110;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                return (
                  <div
                    key={tool.label}
                    className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-line bg-bone-raised shadow-sm"
                    style={{
                      transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                    }}
                  >
                    <tool.icon className="size-5 text-stone" />
                  </div>
                );
              })}

              {/* Center: Relay */}
              <div className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-orange shadow-[0_4px_20px_-4px_color-mix(in_srgb,var(--orange)_40%,transparent)]">
                <span className="text-mono-medium text-lg font-bold text-bone">R</span>
              </div>

              {/* Connecting lines */}
              <svg
                className="pointer-events-none absolute inset-0"
                viewBox="-144 -144 288 288"
                aria-hidden="true"
              >
                {tools.map((_, i) => {
                  const angle = (i / tools.length) * Math.PI * 2 - Math.PI / 2;
                  const radius = 110;
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;
                  return (
                    <line
                      key={i}
                      x1="0"
                      y1="0"
                      x2={x}
                      y2={y}
                      stroke="var(--line)"
                      strokeWidth="1"
                      strokeDasharray="3 5"
                      opacity="0.5"
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMMAND CENTER
   ═══════════════════════════════════════════════════════════ */

function CommandCenterSection() {
  return (
    <section id="product" className="scroll-mt-16 border-t border-line bg-bone-raised">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>THE COMMAND CENTER</SectionEyebrow>
          <div className="mt-4">
            <SectionHeading>Open Relay. Know what matters.</SectionHeading>
          </div>
          <p className="mt-6 text-[16px] leading-relaxed text-graphite">
            Today&apos;s priorities. High-fit prospects. Replies waiting. Follow-ups due.
            Your next-best action, always visible.
          </p>
        </div>

        {/* Command Center mockup */}
        <div className="mt-14 rounded-2xl border border-line bg-bone p-1 shadow-md">
          <div className="rounded-xl bg-bone-raised">
            {/* Mock header bar */}
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-md bg-orange">
                  <span className="text-mono-medium text-[10px] font-bold text-bone">R</span>
                </span>
                <span className="text-[14px] font-semibold text-ink">Relay</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-label text-stone">Today</span>
                <span className="rounded-full bg-orange/10 px-2 py-0.5 text-mono-medium text-[10px] text-orange">
                  3 sends left
                </span>
              </div>
            </div>

            {/* Mock content */}
            <div className="grid gap-0 border-b border-line md:grid-cols-3">
              {/* Priority queue */}
              <div className="border-b border-line p-5 md:border-b-0 md:border-r">
                <p className="text-label text-stone">Priority queue</p>
                <div className="mt-4 space-y-3">
                  {[
                    { name: "Sarah Chen", company: "Stripe", score: 92, status: "replied" },
                    { name: "Marcus Rivera", company: "Vercel", score: 87, status: "new" },
                    { name: "Amy Zhao", company: "Linear", score: 74, status: "follow-up" },
                  ].map((lead) => (
                    <div
                      key={lead.name}
                      className="flex items-center justify-between rounded-lg border border-line p-3"
                    >
                      <div className="flex items-center gap-3">
                        <ScoreRing score={lead.score} max={100} size={28} />
                        <div>
                          <p className="text-[13px] font-medium text-ink">{lead.name}</p>
                          <p className="text-[11px] text-stone">{lead.company}</p>
                        </div>
                      </div>
                      <span
                        className="rounded-md px-1.5 py-0.5 text-mono-medium text-[9px]"
                        style={{
                          backgroundColor:
                            lead.status === "replied"
                              ? "color-mix(in srgb, var(--status-success) 10%, transparent)"
                              : lead.status === "new"
                                ? "var(--orange-faint)"
                                : "color-mix(in srgb, var(--status-warning) 10%, transparent)",
                          color:
                            lead.status === "replied"
                              ? "var(--status-success)"
                              : lead.status === "new"
                                ? "var(--orange)"
                                : "var(--status-warning)",
                        }}
                      >
                        {lead.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's priorities */}
              <div className="border-b border-line p-5 md:border-b-0 md:border-r">
                <p className="text-label text-stone">Today&apos;s priorities</p>
                <div className="mt-4 space-y-3">
                  {[
                    { task: "Reply to Sarah", meta: "High intent signal", type: "action" },
                    { task: "Follow up with Marcus", meta: "4 days waiting", type: "action" },
                    { task: "Check new Rails role", meta: "92% fit", type: "action" },
                  ].map((item) => (
                    <div
                      key={item.task}
                      className="flex items-start gap-3 rounded-lg border border-line p-3"
                    >
                      <div className="mt-0.5 size-4 shrink-0 rounded border border-line" />
                      <div>
                        <p className="text-[13px] font-medium text-ink">{item.task}</p>
                        <p className="text-[11px] text-stone">{item.meta}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metrics */}
              <div className="p-5">
                <p className="text-label text-stone">Operating metrics</p>
                <div className="mt-4 space-y-4">
                  {[
                    { label: "Sends left", value: "3", sub: "of 15 today" },
                    { label: "Queue size", value: "12", sub: "8 contacted" },
                    { label: "Reply rate", value: "18%", sub: "above target" },
                  ].map((metric) => (
                    <div key={metric.label} className="flex items-baseline justify-between">
                      <span className="text-[13px] text-graphite">{metric.label}</span>
                      <div className="text-right">
                        <span className="text-mono-medium text-xl font-semibold text-ink">
                          {metric.value}
                        </span>
                        <span className="ml-1 text-[11px] text-stone">{metric.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   CORE LOOP
   ═══════════════════════════════════════════════════════════ */

function CoreLoopSection() {
  const steps = [
    {
      verb: "Find",
      desc: "Relay surfaces worthwhile opportunities from the noise.",
      icon: Search,
    },
    {
      verb: "Qualify",
      desc: "Understand whether they're actually worth your time.",
      icon: Target,
    },
    {
      verb: "Reach",
      desc: "Generate outreach grounded in who you are and what you've done.",
      icon: Users,
    },
    {
      verb: "Follow through",
      desc: "Know when to reply, follow up, or change approach.",
      icon: MessageSquare,
    },
    {
      verb: "Close",
      desc: "Keep the next useful action always visible.",
      icon: CheckCircle2,
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>THE LOOP</SectionEyebrow>
          <div className="mt-4">
            <SectionHeading>From signal to action.</SectionHeading>
          </div>
        </div>

        {/* Desktop: horizontal */}
        <div className="mt-16 hidden items-start justify-between lg:flex">
          {steps.map((step, i) => (
            <div key={step.verb} className="flex items-start gap-4">
              <div className="flex flex-1 flex-col items-center text-center" style={{ maxWidth: 180 }}>
                <div className="flex size-12 items-center justify-center rounded-xl border border-line bg-bone-raised">
                  <step.icon className="size-5 text-orange" />
                </div>
                <p className="mt-4 text-[15px] font-medium text-ink">{step.verb}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">{step.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="mt-5 flex-shrink-0 px-2">
                  <ArrowRight className="size-4 text-line" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile: vertical */}
        <div className="mt-12 space-y-6 lg:hidden">
          {steps.map((step, i) => (
            <div key={step.verb} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="flex size-10 items-center justify-center rounded-lg border border-line bg-bone-raised">
                  <step.icon className="size-4 text-orange" />
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-2 h-8 w-px bg-line" />
                )}
              </div>
              <div className="pt-1.5">
                <p className="text-[14px] font-medium text-ink">{step.verb}</p>
                <p className="mt-0.5 text-[13px] text-graphite">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   PROSPECT CHECK
   ═══════════════════════════════════════════════════════════ */

function ProspectCheckSection() {
  return (
    <section className="border-t border-line bg-bone-raised">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-20">
          {/* Left: explanation */}
          <div className="space-y-6">
            <SectionEyebrow>PROSPECT CHECK</SectionEyebrow>
            <SectionHeading>Not every lead deserves a message.</SectionHeading>
            <p className="text-[16px] leading-relaxed text-graphite">
              Paste a profile. Relay analyzes fit against your criteria, proof, and
              territory — then tells you whether to reach out.
            </p>

            <div className="space-y-4 pt-4">
              {[
                { icon: CheckCircle2, text: "See why they fit before you write" },
                { icon: Users, text: "Know the best sender and proof match" },
                { icon: Target, text: "Get a recommended approach" },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <item.icon className="mt-0.5 size-4 shrink-0 text-orange" />
                  <span className="text-[14px] text-ink">{item.text}</span>
                </div>
              ))}
            </div>

            <Link
              href="/signup"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange px-4 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark"
            >
              Check a prospect
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {/* Right: interactive demonstration */}
          <div className="space-y-4">
            {/* Paste input */}
            <div className="rounded-xl border border-line bg-bone p-4">
              <p className="text-label text-stone">Paste profile</p>
              <div className="mt-3 rounded-lg border border-line bg-bone-raised p-3 font-mono text-[11px] text-graphite">
                Sarah Chen · Engineering Manager at Stripe
                <br />
                Previously: Shopify, GitHub
                <br />
                Rails · distributed systems · team scaling
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRight className="size-4 rotate-90 text-line" />
            </div>

            {/* Result */}
            <div className="rounded-xl border border-orange/30 bg-orange/5 p-5">
              <div className="flex items-center gap-5">
                <ScoreRing score={87} max={100} size={64} />
                <div>
                  <p className="text-label text-orange">Worth contacting</p>
                  <p className="text-[13px] text-graphite">Strong Rails + scaling proof match</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  "Relevant: both scaled Rails teams past 50 engineers",
                  "Proof match: your Stripe case study",
                  "Approach: comment on their recent systems post first",
                ].map((reason) => (
                  <div key={reason} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-success" />
                    <span className="text-[13px] text-ink">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   CONVERSATION INTELLIGENCE
   ═══════════════════════════════════════════════════════════ */

function ConversationSection() {
  const stages = [
    { label: "Connection", done: true },
    { label: "DM", done: true },
    { label: "Reply", done: true },
    { label: "Follow-up", done: false, current: true },
    { label: "Meeting", done: false },
  ];

  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>CONVERSATIONS</SectionEyebrow>
          <div className="mt-4">
            <SectionHeading>The first message isn&apos;t the job.</SectionHeading>
          </div>
          <p className="mt-6 text-[16px] leading-relaxed text-graphite">
            Relay keeps context across every stage and recommends the next move.
            Not automated spam — decision support.
          </p>
        </div>

        {/* Stage visualization */}
        <div className="mx-auto mt-14 max-w-lg">
          <div className="flex items-center justify-between">
            {stages.map((stage, i) => (
              <div key={stage.label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className="flex size-10 items-center justify-center rounded-full border-2 transition-all"
                    style={{
                      borderColor: stage.done
                        ? "var(--status-success)"
                        : stage.current
                          ? "var(--orange)"
                          : "var(--line)",
                      backgroundColor: stage.done
                        ? "var(--status-success)"
                        : stage.current
                          ? "var(--orange)"
                          : "transparent",
                    }}
                  >
                    {stage.done ? (
                      <CheckCircle2 className="size-4 text-bone" />
                    ) : (
                      <span
                        className="text-mono-medium text-[10px]"
                        style={{ color: stage.current ? "var(--bone)" : "var(--stone)" }}
                      >
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <span
                    className="mt-2 text-[11px]"
                    style={{
                      color: stage.current
                        ? "var(--orange)"
                        : stage.done
                          ? "var(--status-success)"
                          : "var(--stone)",
                    }}
                  >
                    {stage.label}
                  </span>
                </div>
                {i < stages.length - 1 && (
                  <div
                    className="mx-1 mb-5 h-0.5 w-6 sm:w-10"
                    style={{
                      backgroundColor: stage.done
                        ? "var(--status-success)"
                        : "var(--line)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-orange/30 bg-orange/5 p-5">
            <p className="text-label text-orange">Next move</p>
            <p className="mt-1 text-[15px] font-medium text-ink">
              Follow up with Sarah — it&apos;s been 3 days
            </p>
            <p className="mt-1 text-[13px] text-graphite">
              She engaged with your comment but didn&apos;t reply. A short follow-up referencing
              her recent post would land well.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   STUDIO TRANSITION
   ═══════════════════════════════════════════════════════════ */

function StudioTransitionSection() {
  return (
    <section
      id="studio"
      className="scroll-mt-16 border-t border-line"
      style={{
        background: "linear-gradient(180deg, var(--bone) 0%, var(--bone) 40%, var(--cobalt-faint) 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-label" style={{ color: "var(--cobalt)" }}>
            RELAY STUDIO
          </span>
          <h2 className="mt-4 text-display text-3xl text-ink sm:text-4xl lg:text-5xl">
            Your expertise is another growth channel.
          </h2>
          <p className="mt-6 text-[16px] leading-relaxed text-graphite">
            Know what&apos;s worth saying today. Turn your actual expertise into content
            that builds authority consistently.
          </p>
        </div>

        {/* Studio preview */}
        <div className="mt-14 rounded-2xl border border-line bg-bone-raised p-1 shadow-md">
          <div className="rounded-xl bg-bone">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-md bg-cobalt">
                  <span className="text-mono-medium text-[10px] font-bold text-bone">S</span>
                </span>
                <span className="text-[14px] font-semibold text-ink">Studio</span>
                <span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-mono-medium text-[10px] text-cobalt">
                  Part of Relay
                </span>
              </div>
            </div>

            <div className="p-6">
              <p className="text-label" style={{ color: "var(--cobalt)" }}>
                Today&apos;s pick
              </p>
              <h3 className="mt-2 text-display text-2xl text-ink">
                Why most Rails apps don&apos;t need microservices
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-graphite">
                You scaled a monolith at Shopify. You have a strong opinion about
                when teams reach for distributed systems too early.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-cobalt/20 bg-cobalt/5 p-4">
                  <p className="text-label" style={{ color: "var(--cobalt)" }}>
                    Why you
                  </p>
                  <p className="mt-1 text-[13px] text-ink">
                    Your Stripe case study proves you&apos;ve lived this decision.
                  </p>
                </div>
                <div className="rounded-xl border border-cobalt/20 bg-cobalt/5 p-4">
                  <p className="text-label" style={{ color: "var(--cobalt)" }}>
                    Why they&apos;ll care
                  </p>
                  <p className="mt-1 text-[13px] text-ink">
                    Every engineering manager faces this pressure. They want data.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-cobalt px-4 text-[13px] font-medium text-bone transition-all hover:bg-cobalt-dark"
              >
                Write this
                <PenLine className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   CONTENT IDENTITY
   ═══════════════════════════════════════════════════════════ */

function ContentIdentitySection() {
  const dimensions = [
    "Expertise",
    "Experience",
    "Projects",
    "Audience",
    "Goals",
    "Territories",
    "Opinions",
    "Voice",
    "Journey",
  ];

  return (
    <section className="border-t border-line bg-bone-raised">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-label" style={{ color: "var(--cobalt)" }}>
            CONTENT IDENTITY
          </span>
          <h2 className="mt-4 text-display text-3xl text-ink sm:text-4xl">
            It learns what you can credibly say.
          </h2>
          <p className="mt-6 text-[16px] leading-relaxed text-graphite">
            Relay builds your content identity from your real proof — not generic
            persona templates.
          </p>
        </div>

        {/* Identity dimensions */}
        <div className="mx-auto mt-14 flex max-w-2xl flex-wrap justify-center gap-3">
          {dimensions.map((dim) => (
            <span
              key={dim}
              className="rounded-full border border-cobalt/20 bg-cobalt/5 px-4 py-1.5 text-[13px] font-medium text-cobalt"
            >
              {dim}
            </span>
          ))}
        </div>

        {/* Signal → Idea visualization */}
        <div className="mx-auto mt-12 flex max-w-md items-center justify-center gap-4">
          <div className="flex items-center gap-2 rounded-full border border-cobalt/20 bg-cobalt/5 px-3 py-1.5">
            <span className="size-1.5 rounded-full bg-cobalt" />
            <span className="text-mono-regular text-[11px] text-cobalt">Your identity</span>
          </div>
          <ArrowRight className="size-4 text-stone" />
          <div className="flex items-center gap-2 rounded-full border border-cobalt bg-cobalt/10 px-3 py-1.5">
            <Zap className="size-3 text-cobalt" />
            <span className="text-[12px] font-medium text-cobalt">Personalized idea</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   TWO SYSTEMS
   ═══════════════════════════════════════════════════════════ */

function TwoSystemsSection() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="grid gap-8 md:grid-cols-2">
          {/* Revenue */}
          <div className="rounded-2xl border border-orange/20 bg-orange/5 p-8">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-orange">
                <span className="text-mono-medium text-[11px] font-bold text-bone">R</span>
              </span>
              <span className="text-label tracking-[0.14em]" style={{ color: "var(--orange)" }}>
                REVENUE
              </span>
            </div>
            <p className="mt-5 text-display text-2xl text-ink">
              Find opportunities worth pursuing.
            </p>
            <ul className="mt-5 space-y-3">
              {[
                "Surface high-fit prospects",
                "Qualify before you write",
                "Draft in your voice",
                "Track every outcome",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-orange" />
                  <span className="text-[14px] text-ink">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Studio */}
          <div className="rounded-2xl border border-cobalt/20 bg-cobalt/5 p-8">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-cobalt">
                <span className="text-mono-medium text-[11px] font-bold text-bone">S</span>
              </span>
              <span className="text-label tracking-[0.14em]" style={{ color: "var(--cobalt)" }}>
                STUDIO
              </span>
            </div>
            <p className="mt-5 text-display text-2xl text-ink">
              Build the authority that creates more opportunities.
            </p>
            <ul className="mt-5 space-y-3">
              {[
                "Know what's worth saying",
                "Write from real proof",
                "Build authority consistently",
                "Create your own demand",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cobalt" />
                  <span className="text-[14px] text-ink">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Join statement */}
        <div className="mx-auto mt-14 max-w-xl text-center">
          <p className="text-display text-2xl text-ink sm:text-3xl">
            Create demand. Capture demand.
          </p>
          <p className="mt-4 text-[15px] text-graphite">
            One system finds and closes opportunities. The other makes sure more
            opportunities find you.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   HOW RELAY THINKS
   ═══════════════════════════════════════════════════════════ */

function TrustSection() {
  const inputs = [
    "Your professional context",
    "Your proof and experience",
    "Your goals and preferences",
    "Your conversation history",
    "The opportunity itself",
  ];

  return (
    <section className="border-t border-line bg-bone-raised">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>HOW RELAY THINKS</SectionEyebrow>
          <h2 className="mt-4 text-display text-3xl text-ink sm:text-4xl">
            Recommendations with context.
          </h2>
          <p className="mt-6 text-[16px] leading-relaxed text-graphite">
            Relay&apos;s suggestions come from your real professional life — not a blank
            chatbot.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl gap-8 md:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-4">
            <p className="text-label text-stone">What Relay uses</p>
            <div className="space-y-2.5">
              {inputs.map((input) => (
                <div
                  key={input}
                  className="flex items-center gap-3 rounded-lg border border-line bg-bone p-3"
                >
                  <div className="size-1.5 shrink-0 rounded-full bg-orange" />
                  <span className="text-[13px] text-ink">{input}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Output */}
          <div className="rounded-xl border border-orange/30 bg-orange/5 p-5">
            <p className="text-label text-orange">Recommendation</p>
            <p className="mt-2 text-[15px] font-medium text-ink">
              Reach out to Sarah — 92% fit
            </p>

            <div className="mt-4 border-t border-orange/10 pt-4">
              <p className="text-label text-stone">Why</p>
              <p className="mt-1 text-[13px] text-graphite">
                Rails scaling experience matches. Your Stripe proof is relevant. She posted
                about team growth yesterday.
              </p>
            </div>

            <div className="mt-4 border-t border-orange/10 pt-4">
              <p className="text-label text-stone">Next action</p>
              <p className="mt-1 text-[13px] text-graphite">
                Send a connection note referencing her recent post.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRICING PREVIEW
   ═══════════════════════════════════════════════════════════ */

function PricingPreviewSection() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl section-padding py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>PRICING</SectionEyebrow>
          <h2 className="mt-4 text-display text-3xl text-ink sm:text-4xl">
            Start free. Scale when ready.
          </h2>
        </div>

        <div className="mx-auto mt-14 max-w-md">
          {/* Free plan */}
          <div className="rounded-2xl border border-line bg-bone-raised p-8">
            <p className="text-label text-stone">Free</p>
            <p className="mt-2 text-display text-3xl text-ink">$0</p>
            <p className="mt-2 text-[14px] text-graphite">
              For trying Relay and reaching first value.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "10 prospect checks",
                "15 daily sends",
                "3 Studio generations today",
                "Voice-calibrated drafts",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" />
                  <span className="text-[14px] text-ink">{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange text-[14px] font-medium text-bone transition-all hover:bg-orange-dark"
            >
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <p className="mt-3 text-center text-mono-regular text-[11px] text-stone">
              No credit card required
            </p>
          </div>

          {/* Pro coming soon */}
          <div className="mt-4 rounded-2xl border border-dashed border-line bg-bone p-6 text-center">
            <p className="text-label text-stone">Pro</p>
            <p className="mt-1 text-[15px] text-graphite">
              For professionals using Relay consistently.
            </p>
            <p className="mt-3 text-[13px] font-medium text-stone">Coming soon</p>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/pricing"
            className="text-[13px] font-medium text-ink underline-offset-4 hover:underline"
          >
            See full pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════════════════════════ */

function FinalCTASection() {
  return (
    <section className="border-t border-line bg-bone-raised">
      <div className="mx-auto max-w-6xl section-padding py-24 lg:py-36">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-display text-3xl text-ink sm:text-4xl">
            Your next opportunity is probably already somewhere in the noise.
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-graphite">
            Relay helps you find it — and act on it.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="group inline-flex h-12 items-center gap-2 rounded-lg bg-orange px-6 text-[15px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
            >
              Start free
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <p className="mt-4 text-mono-regular text-[12px] text-stone">
            No card required
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE ASSEMBLY
   ═══════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <>
      <RelayStructuredData />
      <HeroSection />
      <AudienceSection />
      <ProblemSection />
      <CommandCenterSection />
      <CoreLoopSection />
      <ProspectCheckSection />
      <ConversationSection />
      <StudioTransitionSection />
      <ContentIdentitySection />
      <TwoSystemsSection />
      <TrustSection />
      <PricingPreviewSection />
      <FinalCTASection />
    </>
  );
}
