"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { cn } from "cn";
import { RelayCta } from "@/components/landing/relay-cta";
import { IntelligenceBenchmarkProofSection } from "@/components/landing/intelligence-benchmark-proof";
import { usePrefersReducedMotion } from "@/lib/landing-motion";

type Tone = "orange" | "cobalt" | "ink";

function pct(value: number): string {
  return `${value.toFixed(4)}%`;
}

function Kicker({ children, tone = "orange" }: { children: React.ReactNode; tone?: Tone }) {
  const color =
    tone === "orange"
      ? "var(--orange-signal)"
      : tone === "cobalt"
        ? "var(--cobalt-signal)"
        : "var(--ink-700)";

  return (
    <p
      className="text-mono-regular text-[10px] tracking-[0.2em] uppercase"
      style={{ color }}
    >
      {children}
    </p>
  );
}

function useScrollStage(
  ref: RefObject<HTMLElement | null>,
  breakpoints: readonly number[],
  reducedMotion: boolean,
  reducedStage = breakpoints.length,
) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reducedMotion) return;

    let raf = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const travel = Math.max(el.offsetHeight - window.innerHeight, 1);
      const p = Math.min(1, Math.max(0, -rect.top / travel));
      let next = 0;
      while (next < breakpoints.length && p >= breakpoints[next]) next += 1;
      setStage((prev) => (prev === next ? prev : next));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, breakpoints, reducedMotion, reducedStage]);

  return reducedMotion ? reducedStage : stage;
}

const HERO_SIGNALS = [
  "SARAH REPLIED",
  "UPWORK / 2H",
  "FOLLOW-UP DUE",
  "HIGH-FIT LEAD",
  "CONTENT IDEA",
  "CLIENT WAITING",
  "PROOF REQUEST",
  "MISSED CALL",
  "RFP ALERT",
  "CONTRACT UPDATE",
  "NEW INBOUND",
  "PIPELINE NOTE",
  "INTRO REQUEST",
  "TEAM PING",
  "JOB MATCH",
  "THREAD STALLED",
  "VOICE NOTE",
  "MEETING SHIFT",
  "DRAFT READY",
  "TARGET MISSED",
  "NORTHSTAR OPEN",
  "LINKEDIN REPLY",
  "PROPOSAL DUE",
  "SCOPE QUESTION",
];

function HeroAttentionField() {
  const reducedMotion = usePrefersReducedMotion();
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setActivated(true), 850);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  const isActive = reducedMotion || activated;

  const positions = useMemo(
    () =>
      HERO_SIGNALS.map((_, index) => {
        const angle = ((index * 31 + 13) * Math.PI) / 180;
        const radius = 34 + (index % 7) * 6;
        return {
          left: 50 + Math.cos(angle) * radius,
          top: 50 + Math.sin(angle) * radius * 0.72,
          rotate: (index % 2 === 0 ? -1 : 1) * (2 + (index % 4)),
        };
      }),
    [],
  );

  return (
    <div className="relative mt-14 rounded-[10px] border border-[var(--bone-200)] bg-[linear-gradient(180deg,var(--bone-000),var(--bone-050))] p-5 sm:p-7 lg:p-10">
      <div
        className="pointer-events-none absolute inset-0 rounded-[10px]"
        style={{
          background:
            "radial-gradient(120% 100% at 20% 5%, color-mix(in srgb, var(--orange-signal) 10%, transparent), transparent 50%), radial-gradient(100% 110% at 100% 100%, color-mix(in srgb, var(--cobalt-signal) 7%, transparent), transparent 52%)",
        }}
        aria-hidden="true"
      />

      <div className="relative">
        <Kicker tone="ink">ATTENTION FIELD</Kicker>
        <p className="mt-2 text-[13px] text-[var(--ink-700)]">
          Too much is happening. Relay narrows it.
        </p>
      </div>

      <div className="relative mt-6 h-[420px] overflow-hidden rounded-[8px] border border-[var(--bone-200)] bg-[var(--bone-000)] px-4 py-4 max-sm:h-[340px] sm:px-6">
        <div className="hidden md:block">
          {HERO_SIGNALS.map((signal, index) => {
            const featured = index === 0;
            const pos = positions[index];
            return (
              <span
                key={signal}
                className={cn(
                  "absolute rounded-[2px] border px-2.5 py-1 text-mono-regular text-[10px] tracking-[0.11em] uppercase transition-all duration-700",
                  featured ? "z-20" : "z-0",
                )}
                style={{
                  left: pct(pos.left),
                  top: pct(pos.top),
                  transform: `translate(-50%, -50%) rotate(${pos.rotate}deg) ${
                    featured
                      ? isActive
                        ? "scale(1.08) translateY(-4px)"
                        : "scale(1)"
                      : isActive
                        ? "scale(0.9)"
                        : "scale(1)"
                  }`,
                  opacity: featured ? 1 : isActive ? 0.13 : 0.48,
                  color: featured ? "var(--orange-signal)" : "var(--stone)",
                  borderColor: featured
                    ? "color-mix(in srgb, var(--orange-signal) 55%, var(--bone-200))"
                    : "var(--bone-200)",
                  background: featured ? "color-mix(in srgb, var(--orange-wash) 55%, white)" : "white",
                }}
              >
                {signal}
              </span>
            );
          })}
        </div>

        <div className="relative z-30 mx-auto max-w-[560px] rounded-[6px] border border-[var(--orange-line)] bg-[linear-gradient(180deg,var(--orange-surface),white)] p-4 shadow-[0_18px_40px_-28px_rgba(13,10,8,0.58)] transition-transform duration-700 sm:p-6">
          <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">
            SARAH REPLIED
          </p>
          <p className="mt-1 text-mono-regular text-[11px] tracking-[0.11em] uppercase text-[var(--stone)]">
            2 MIN AGO
          </p>
          <p className="mt-3 text-[18px] leading-snug text-[var(--ink-900)] sm:text-[22px]">
            &quot;Could you send something similar?&quot;
          </p>

          <div className="mt-5 space-y-2.5 border-t border-[var(--orange-line)] pt-4">
            <FlowRow left="SARAH" right="INTENT / PROOF REQUEST" />
            <FlowRow left="HASSAN" right="MARKETPLACE PROJECT" />
            <FlowRow left="RELAY" right="PREPARE REPLY" highlight />
          </div>
        </div>

        <div className="relative z-20 mt-4 grid grid-cols-2 gap-2.5 md:hidden">
          {HERO_SIGNALS.slice(1, 9).map((item) => (
            <span
              key={item}
              className="rounded-[2px] border border-[var(--bone-200)] bg-white px-2 py-1 text-mono-regular text-[9px] tracking-[0.09em] text-[var(--stone)] uppercase"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowRow({ left, right, highlight = false }: { left: string; right: string; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <p className="text-mono-regular text-[10px] tracking-[0.1em] uppercase text-[var(--ink-700)]">{left}</p>
      <span
        className="h-px w-4"
        style={{
          background: highlight
            ? "var(--orange-signal)"
            : "color-mix(in srgb, var(--orange-signal) 40%, var(--bone-200))",
        }}
        aria-hidden="true"
      />
      <p
        className={cn(
          "text-right text-mono-regular text-[10px] tracking-[0.1em] uppercase",
          highlight ? "text-orange" : "text-[var(--ink-700)]",
        )}
      >
        {right}
      </p>
    </div>
  );
}

function HeroProductObject() {
  return (
    <div className="relative mx-auto mt-12 w-full max-w-[860px]">
      <div className="launch-relay-object overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--console-line)] px-5 py-3 sm:px-7 sm:py-4">
          <p className="text-mono-regular text-[10px] tracking-[0.18em] uppercase text-[var(--console-mute)]">
            YOUR RELAY / 09:14
          </p>
          <span
            className="h-2 w-2 rounded-full bg-orange"
            style={{ boxShadow: "0 0 16px 2px color-mix(in srgb, var(--orange-signal) 40%, transparent)" }}
          />
        </div>

        <div className="grid gap-5 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">01 / NOW</p>
            <p className="mt-2 text-[26px] leading-none font-light tracking-[-0.04em] text-[var(--console-text)]">
              SARAH CHEN
            </p>
            <p className="mt-4 text-[15px] text-[var(--console-mute)]">Asked for relevant proof.</p>

            <dl className="mt-6 space-y-3">
              <QueueMeta k="IDENTITY" v="HASSAN" />
              <QueueMeta k="PROOF" v="MARKETPLACE MODERNIZATION" />
            </dl>

            <p className="mt-6 text-[14px] font-medium text-orange">PREPARE REPLY -&gt;</p>
          </div>

          <div className="space-y-2.5 border-t border-[var(--console-line)] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <BacklogRow label="02 / HIGH-FIT PROSPECT" />
            <BacklogRow label="03 / FOLLOW-UP" />
            <BacklogRow label="04 / UPWORK OPPORTUNITY" />
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-4 -bottom-3 -z-10 h-full rounded-[6px]"
        style={{ background: "color-mix(in srgb, var(--console) 88%, white)" }}
      />
      <div
        className="absolute inset-x-8 -bottom-6 -z-20 h-full rounded-[6px]"
        style={{ background: "color-mix(in srgb, var(--console) 76%, white)" }}
      />
    </div>
  );
}

function QueueMeta({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[6.3rem_1fr] items-baseline gap-3">
      <dt className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--console-mute)]">{k}</dt>
      <dd className="text-[12px] font-medium tracking-[0.04em] text-[var(--console-text)]">{v}</dd>
    </div>
  );
}

function BacklogRow({ label }: { label: string }) {
  return (
    <div className="rounded-[3px] border border-[var(--console-line)] px-3 py-2">
      <p className="text-mono-regular text-[10px] tracking-[0.12em] uppercase text-[var(--console-mute)]">{label}</p>
    </div>
  );
}

function HeroSection() {
  return (
    <section
      id="hero"
      data-system="relay"
      className="relative -mt-[4.5rem] overflow-hidden bg-[linear-gradient(180deg,var(--bone-050),var(--bone-000)_32%,var(--bone-050))] pt-24 pb-20 sm:pt-28"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 90% 0%, color-mix(in srgb, var(--orange-signal) 14%, transparent), transparent 62%), radial-gradient(70% 58% at 12% 100%, color-mix(in srgb, var(--cobalt-signal) 10%, transparent), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="landing-shell-wide relative">
        <div className="mx-auto max-w-5xl text-center">
          <Kicker>RELAY / YOUR NEXT MOVE</Kicker>
          <h1 className="mt-6 text-[clamp(2.8rem,9vw,8rem)] leading-[0.87] font-light tracking-[-0.055em] text-[var(--ink-900)]">
            KNOW WHAT
            <br />
            TO DO NEXT.
          </h1>
          <p className="mx-auto mt-6 max-w-[40rem] text-[17px] leading-relaxed text-[var(--ink-700)]">
            Relay finds the opportunities worth your attention, prepares the next move, and keeps your
            growth work moving.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <RelayCta href="/signup">START FREE</RelayCta>
            <RelayCta href="#how-it-works" quiet>
              SEE RELAY WORK
            </RelayCta>
          </div>
        </div>

        <HeroAttentionField />
        <HeroProductObject />
      </div>
    </section>
  );
}

const SIGNAL_LABELS = [
  "SARAH REPLIED",
  "UPWORK 2H",
  "FOLLOW-UP DUE",
  "HIGH-FIT LEAD",
  "CONTENT IDEA",
  "CLIENT WAITING",
  "PROOF REQUEST",
  "NORTHSTAR",
  "THREAD QUIET",
  "REPLY DRAFT",
  "PROPOSAL",
  "VOICE NOTE",
  "JOB ALERT",
  "CHECK-IN",
  "INTRO",
  "TEAM PING",
  "RFP",
  "CALLBACK",
  "MEMO",
];

const COMPRESSION_STAGES = [
  { count: 47, titleA: "47 THINGS", titleB: "WANT YOUR ATTENTION.", visible: 47 },
  { count: 17, titleA: "17 STILL", titleB: "LOOK RELEVANT.", visible: 17 },
  { count: 8, titleA: "8 HAVE", titleB: "REAL SIGNAL.", visible: 8 },
  { count: 3, titleA: "THREE", titleB: "DESERVE IT.", visible: 3 },
] as const;

const BREAKPOINT_NOISE = [0.24, 0.51, 0.76] as const;
const BREAKPOINT_STUDIO_REVEAL = [0.44, 0.72] as const;
const BREAKPOINT_IDEA = [0.2, 0.4, 0.62, 0.82] as const;

function NoiseCompressionSection() {
  const finalists = [
    { title: "SARAH REPLIED", meta: "PROOF REQUEST" },
    { title: "NORTHSTAR", meta: "STRONG FIT" },
    { title: "RAILS ENGINEER JOB", meta: "4H WINDOW" },
  ];

  return (
    <section id="how-it-works" data-system="relay" className="bg-[var(--bone-000)] py-[clamp(5rem,11vw,10rem)]">
      <div className="landing-shell-wide grid items-center gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16">
        <div>
          <Kicker>WHY RELAY</Kicker>
          <h2 className="mt-5 text-[clamp(2.2rem,6vw,5rem)] leading-[0.9] font-light tracking-[-0.05em] text-[var(--ink-900)]">
            47 THINGS
            <br />
            WANT YOUR ATTENTION.
          </h2>
          <p className="mt-8 text-[15px] leading-relaxed text-[var(--ink-700)]">
            Relay is not storing tasks. Relay is deciding where attention should go first.
          </p>
          <p className="mt-6 text-mono-regular text-[11px] tracking-[0.15em] uppercase text-orange">
            3 deserve it
          </p>
        </div>

        <div className="space-y-3">
          {finalists.map((f) => (
            <div key={f.title} className="rounded-[6px] border border-[var(--orange-line)] bg-[var(--orange-surface)] px-4 py-3">
              <p className="text-[13px] font-medium text-[var(--ink-900)]">{f.title}</p>
              <p className="mt-1 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-orange">{f.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const QUEUE_ITEMS = {
  sarah: {
    id: "sarah",
    kind: "REPLY",
    name: "Sarah Chen",
    when: "NOW",
    note: "Asked for proof.",
    identity: "HASSAN / MARKETPLACE MODERNIZATION",
    action: "PREPARE REPLY",
  },
  northstar: {
    id: "northstar",
    kind: "PROSPECT",
    name: "Northstar",
    when: "NEXT",
    note: "Hiring rails engineers.",
    identity: "HASSAN / BACKEND SYSTEMS",
    action: "OPEN PROSPECT",
  },
  rails: {
    id: "rails",
    kind: "UPWORK",
    name: "Rails Engineer",
    when: "4H",
    note: "Fresh listing, strong overlap.",
    identity: "HASSAN / RAILS",
    action: "PREPARE PROPOSAL",
  },
  acme: {
    id: "acme",
    kind: "FOLLOW-UP",
    name: "Acme",
    when: "TODAY",
    note: "Last touch 3 days ago.",
    identity: "MEHAK / FRONTEND",
    action: "DRAFT NUDGE",
  },
} as const;

const QUEUE_MOMENTS = [
  {
    order: ["sarah", "northstar", "rails", "acme"],
    why: "Sarah moved to #1 because the conversation is live and asking for proof right now.",
  },
  {
    order: ["northstar", "sarah", "rails", "acme"],
    why: "Northstar moved up because a new role matched identity fit and proof depth.",
  },
  {
    order: ["rails", "sarah", "northstar", "acme"],
    why: "The job window tightened, so Relay moved proposal work before follow-up tasks.",
  },
] as const;

function PriorityQueueSection() {
  const reducedMotion = usePrefersReducedMotion();
  const [moment, setMoment] = useState(0);
  const current = QUEUE_MOMENTS[moment];
  const [focusId, setFocusId] = useState<keyof typeof QUEUE_ITEMS>(current.order[0]);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setMoment((value) => (value + 1) % QUEUE_MOMENTS.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const ordered = current.order.map((id) => QUEUE_ITEMS[id]);
  const focused = QUEUE_ITEMS[focusId];

  return (
    <section className="bg-[var(--bone-050)] py-[clamp(5rem,11vw,10rem)]" data-system="relay">
      <div className="landing-shell-wide grid items-start gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="launch-priority-console overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--console-line)] px-5 py-3 sm:px-7 sm:py-4">
            <p className="text-mono-regular text-[10px] tracking-[0.18em] uppercase text-[var(--console-mute)]">
              YOUR RELAY
            </p>
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--console-mute)]">
              TUE / 09:14
            </p>
          </div>

          <ul>
            {ordered.map((item, index) => {
              const active = focusId === item.id;
              return (
                <li key={item.id} className="border-b border-[var(--console-line)] last:border-b-0">
                  <button
                    type="button"
                    onMouseEnter={() => setFocusId(item.id)}
                    onFocus={() => setFocusId(item.id)}
                    onClick={() => setFocusId(item.id)}
                    className="w-full px-5 py-4 text-left sm:px-7"
                  >
                    <div className="grid grid-cols-[2.2rem_1fr_auto] items-baseline gap-3">
                      <span
                        className={cn(
                          "text-mono-regular text-[15px]",
                          active ? "text-orange" : "text-[var(--console-mute)]",
                        )}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span
                            className={cn(
                              "text-mono-regular text-[10px] tracking-[0.14em] uppercase",
                              active ? "text-orange" : "text-[var(--console-mute)]",
                            )}
                          >
                            {item.kind}
                          </span>
                          <span className="text-[18px] leading-none font-light tracking-[-0.025em] text-[var(--console-text)]">
                            {item.name}
                          </span>
                        </p>
                        <p className="mt-2 text-[13px] text-[var(--console-mute)]">{item.note}</p>
                        {active && (
                          <p className="mt-3 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--console-mute)]">
                            {item.identity}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-mono-regular text-[10px] tracking-[0.11em] uppercase",
                          active ? "text-orange" : "text-[var(--console-mute)]",
                        )}
                      >
                        {item.when}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-6">
          <div>
            <Kicker>RELAY DECIDES ATTENTION</Kicker>
            <h3 className="mt-4 text-[clamp(1.9rem,4vw,3.3rem)] leading-[0.92] font-light tracking-[-0.045em] text-[var(--ink-900)]">
              RELAY DECIDES
              <br />
              WHAT DESERVES ATTENTION.
            </h3>
          </div>

          <div className="rounded-[6px] border border-[var(--bone-200)] bg-white p-5">
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">
              WHY THIS MOVED UP
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-800)]">{current.why}</p>
            <p className="mt-4 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
              CURRENT FOCUS / {focused.name.toUpperCase()}
            </p>
            <p className="mt-4 text-[13px] font-medium text-orange">{focused.action} -&gt;</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const CHECK_CRITERIA = [
  { key: "FIT", detail: "Stack overlap with marketplace rails systems.", evidence: "Role asks for rails + postgres + migration history." },
  { key: "INTENT", detail: "Buying language appears in first message.", evidence: "Asks if team can deliver similar work." },
  { key: "TIMING", detail: "Conversation is active this week.", evidence: "Last reply is under two hours." },
  { key: "PROOF", detail: "Verified projects map directly.", evidence: "Marketplace modernization and API scale work." },
  { key: "RELEVANCE", detail: "Assigned identity has matching channel.", evidence: "Hassan is active on Upwork for this category." },
];

function ProspectCheckSection() {
  const [focus, setFocus] = useState(CHECK_CRITERIA[0].key);
  const active = CHECK_CRITERIA.find((item) => item.key === focus) ?? CHECK_CRITERIA[0];

  return (
    <section id="prospect-check" data-system="relay" className="bg-[var(--bone-000)] py-[clamp(5rem,10vw,9rem)]">
      <div className="landing-shell-wide grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Kicker>PROSPECT CHECK</Kicker>
          <h3 className="mt-5 text-[clamp(2rem,5.5vw,4.8rem)] leading-[0.9] font-light tracking-[-0.052em] text-[var(--ink-900)]">
            BEFORE IT BECOMES
            <br />
            A LEAD,
            <br />
            ASK IF IT SHOULD.
          </h3>
          <p className="mt-7 max-w-[30rem] text-[15px] leading-relaxed text-[var(--ink-700)]">
            Prospect Check evaluates evidence, not inbox volume. Relay surfaces why this deserves attention
            and what it would do next.
          </p>
        </div>

        <div className="space-y-5">
          <div className="rounded-[6px] border border-[var(--bone-200)] bg-white p-5 shadow-[0_18px_30px_-28px_rgba(18,16,13,0.52)]">
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--stone)]">
              INBOUND OPPORTUNITY
            </p>
            <p className="mt-2 text-[20px] leading-tight font-light tracking-[-0.03em] text-[var(--ink-900)]">
              &quot;Do you handle rails marketplace migrations?&quot;
            </p>
            <p className="mt-3 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
              UPWORK / 2H AGO
            </p>
          </div>

          <div className="rounded-[8px] border border-[var(--orange-line)] bg-[linear-gradient(180deg,white,var(--orange-surface))] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--orange-line)] pb-3">
              <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">
                EVIDENCE STACK
              </p>
              <p className="text-mono-regular text-[11px] tracking-[0.11em] uppercase text-[var(--ink-900)]">
                92 / STRONG FIT
              </p>
            </div>

            <ul className="mt-3 space-y-2">
              {CHECK_CRITERIA.map((criterion) => {
                const isActive = criterion.key === active.key;
                return (
                  <li key={criterion.key}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-[3px] border px-3 py-2.5 text-left transition-all",
                        isActive
                          ? "border-[var(--orange-line)] bg-white"
                          : "border-[var(--bone-200)]",
                      )}
                      style={
                        isActive
                          ? undefined
                          : { background: "color-mix(in srgb, var(--bone-000) 75%, white)" }
                      }
                      onMouseEnter={() => setFocus(criterion.key)}
                      onFocus={() => setFocus(criterion.key)}
                      onClick={() => setFocus(criterion.key)}
                    >
                      <p className="text-mono-regular text-[10px] tracking-[0.11em] uppercase text-orange">
                        {criterion.key}
                      </p>
                      <p className="mt-1 text-[13px] text-[var(--ink-800)]">{criterion.detail}</p>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 rounded-[3px] border border-[var(--orange-line)] bg-white px-3 py-3">
              <p className="text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
                WHY RELAY SURFACED THIS
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-800)]">{active.evidence}</p>
              <p className="mt-3 text-[13px] font-medium text-orange">WHAT RELAY DOES NEXT: ROUTE TO HASSAN + ATTACH PROOF</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const IDENTITIES = [
  {
    id: "mehak",
    name: "MEHAK",
    role: "FRONTEND / LINKEDIN",
    context: ["React", "Design systems", "UI modernization", "Client workshops"],
    channel: "LinkedIn",
    proofs: ["Design system migration", "Large React refactor"],
  },
  {
    id: "hassan",
    name: "HASSAN",
    role: "BACKEND / UPWORK",
    context: [
      "Rails",
      "PostgreSQL",
      "Marketplace systems",
      "8 verified projects",
      "Relevant client proof",
      "Upwork profile",
      "Technical voice",
    ],
    channel: "Upwork",
    proofs: ["Marketplace modernization", "Rails + PostgreSQL migration"],
  },
  {
    id: "aneeb",
    name: "ANEEB",
    role: "MOBILE / LINKEDIN",
    context: ["React Native", "Cross-platform rebuilds", "Product shipping", "Tech leadership"],
    channel: "LinkedIn",
    proofs: ["React Native rescue", "Mobile architecture upgrade"],
  },
] as const;

function RevenueIdentitySection() {
  const [active, setActive] = useState<(typeof IDENTITIES)[number]["id"]>("hassan");
  const selected = IDENTITIES.find((item) => item.id === active) ?? IDENTITIES[1];

  return (
    <section id="identities" data-system="relay" className="bg-[var(--bone-100)] py-[clamp(5rem,10vw,9.5rem)]">
      <div className="landing-shell-wide">
        <Kicker>REVENUE IDENTITIES</Kicker>
        <h3 className="mt-5 text-[clamp(2rem,5.6vw,5rem)] leading-[0.9] font-light tracking-[-0.053em] text-[var(--ink-900)]">
          THE RIGHT OPPORTUNITY
          <br />
          NEEDS THE RIGHT PERSON.
        </h3>

        <div className="mt-12 grid items-start gap-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-[6px] border border-[var(--bone-200)] bg-[var(--bone-000)] p-5">
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--stone)]">
              OPPORTUNITY
            </p>
            <p className="mt-2 text-[19px] leading-tight font-light tracking-[-0.03em] text-[var(--ink-900)]">
              Marketplace team needs a rails modernization partner.
            </p>
            <p className="mt-4 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
              CHANNEL / UPWORK
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[0.84fr_1.16fr]">
            <div className="space-y-3">
              {IDENTITIES.map((identity) => {
                const isActive = identity.id === active;
                return (
                  <button
                    key={identity.id}
                    type="button"
                    onMouseEnter={() => setActive(identity.id)}
                    onFocus={() => setActive(identity.id)}
                    onClick={() => setActive(identity.id)}
                    className={cn(
                      "w-full rounded-[4px] border px-4 py-3 text-left transition-all",
                      isActive
                        ? "translate-x-1 border-[var(--orange-line)] bg-white shadow-[0_16px_28px_-24px_rgba(13,11,9,0.62)]"
                        : "border-[var(--bone-200)] bg-[var(--bone-000)] opacity-70",
                    )}
                  >
                    <p className="text-[16px] leading-none font-medium tracking-[-0.01em] text-[var(--ink-900)]">
                      {identity.name}
                    </p>
                    <p className="mt-1 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
                      {identity.role}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[6px] border border-[var(--orange-line)] bg-[linear-gradient(180deg,var(--orange-surface),white)] p-5">
              <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">
                {selected.name} / SELECTED
              </p>
              <p className="mt-3 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
                CHANNEL PERMISSION / {selected.channel.toUpperCase()}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {selected.context.map((item) => (
                  <span
                    key={item}
                    className="rounded-[2px] border border-[var(--orange-line)] bg-white px-2.5 py-1 text-[11px] text-[var(--ink-800)]"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {selected.proofs.map((proof) => (
                  <div key={proof} className="rounded-[3px] border border-[var(--orange-line)] bg-white px-3 py-2.5">
                    <p className="text-mono-regular text-[9px] tracking-[0.1em] uppercase text-orange">PROOF</p>
                    <p className="mt-1 text-[12px] text-[var(--ink-800)]">{proof}</p>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-mono-regular text-[10px] tracking-[0.12em] uppercase text-[var(--stone)]">
                OPPORTUNITY -&gt; IDENTITY -&gt; PROOF -&gt; ACTION
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofSection() {
  const [attached, setAttached] = useState(false);

  return (
    <section id="proof" data-system="relay" className="bg-[var(--bone-000)] py-[clamp(4.7rem,9vw,8.5rem)]">
      <div className="landing-shell-wide grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <Kicker>PROOF</Kicker>
          <h3 className="mt-5 text-[clamp(2.2rem,5.6vw,5rem)] leading-[0.9] font-light tracking-[-0.05em] text-[var(--ink-900)]">
            DON&apos;T CLAIM IT.
            <br />
            CONNECT IT.
          </h3>
        </div>

        <button
          type="button"
          className="relative block w-full rounded-[8px] border border-[var(--bone-200)] bg-white px-5 py-6 text-left"
          onMouseEnter={() => setAttached(true)}
          onFocus={() => setAttached(true)}
          onClick={() => setAttached((value) => !value)}
        >
          <p className="text-[19px] leading-snug text-[var(--ink-900)]">
            &quot;We&apos;ve worked on complex Rails marketplace systems.&quot;
          </p>

          <span
            className="absolute top-[52%] left-[56%] h-px transition-all duration-500"
            style={{
              width: attached ? 72 : 12,
              background: "var(--orange-signal)",
            }}
            aria-hidden="true"
          />

          <div
            className="mt-6 w-[min(94%,320px)] rounded-[4px] border border-[var(--orange-line)] bg-[var(--orange-surface)] px-3 py-3 transition-all duration-500"
            style={{
              transform: attached ? "translateX(64px)" : "translateX(0)",
            }}
          >
            <p className="text-mono-regular text-[9px] tracking-[0.11em] uppercase text-orange">VERIFIED PROJECT</p>
            <p className="mt-1 text-[13px] font-medium text-[var(--ink-900)]">Marketplace modernization</p>
            <p className="mt-1 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
              Rails / PostgreSQL / Client delivery
            </p>
          </div>

          <p className="mt-5 text-[12px] text-[var(--stone)]">
            Relay prepares from what your company actually knows.
          </p>
        </button>
      </div>
    </section>
  );
}

function HumanGateSection() {
  const [released, setReleased] = useState(false);

  return (
    <section id="human-gate" data-system="relay" className="bg-[var(--bone-050)] py-[clamp(6rem,15vw,12rem)]">
      <div className="landing-shell">
        <div className="mx-auto max-w-4xl text-center">
          <div className="relative mx-auto h-px w-full max-w-3xl bg-[var(--bone-200)]">
            <span
              className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-orange transition-[left] duration-[900ms]"
              style={{
                left: released ? "100%" : "48%",
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 20px 2px color-mix(in srgb, var(--orange-signal) 38%, transparent)",
              }}
            />
          </div>

          <p className="mt-8 text-mono-regular text-[10px] tracking-[0.2em] uppercase text-orange">READY FOR YOU</p>
          <h3 className="mt-6 text-[clamp(2.1rem,5vw,4.5rem)] leading-[0.92] font-light tracking-[-0.048em] text-[var(--ink-900)]">
            RELAY PREPARED IT.
            <br />
            YOU DECIDE
            <br />
            WHAT LEAVES.
          </h3>

          <div className="mt-10">
            {released ? (
              <p className="text-mono-regular text-[11px] tracking-[0.14em] uppercase text-[var(--stone)]">
                SENT WITH HUMAN REVIEW
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setReleased(true)}
                className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--orange-line)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--ink-900)] transition-transform hover:-translate-y-[1px]"
              >
                REVIEW -&gt;
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StudioRevealSection() {
  return (
    <section
      id="studio"
      data-system="studio"
      className="bg-[linear-gradient(180deg,var(--bone-050),var(--bone-000)_35%,var(--cobalt-wash)_100%)] py-[clamp(5rem,11vw,10rem)]"
    >
      <div className="landing-shell-wide">
        <div className="mx-auto max-w-4xl">
          <p className="text-mono-regular text-[11px] tracking-[0.16em] uppercase text-cobalt">
            STUDIO / CREATE DEMAND
          </p>
          <h3 className="mt-6 text-[clamp(2.2rem,6vw,5.4rem)] leading-[0.9] font-light tracking-[-0.052em] text-[var(--ink-900)]">
            FINDING DEMAND
            <br />
            IS ONLY HALF
            <br />
            THE SYSTEM.
          </h3>
          <p className="mt-8 text-[15px] leading-relaxed text-[var(--ink-700)]">
            Sometimes you have to create it. Studio helps you build authority and generate demand.
          </p>
        </div>
      </div>
    </section>
  );
}

const STUDIO_ANGLES = [
  {
    title: "WHY SENIOR ENGINEERS\nDELETE MORE CODE.",
    whyYou: "Legacy systems\nEngineering judgment",
    whyCare: "Complexity compounds.",
  },
  {
    title: "THE FASTEST FIX\nIS OFTEN REMOVAL.",
    whyYou: "Architecture\nDelivery pressure",
    whyCare: "Teams inherit every shortcut.",
  },
  {
    title: "YOU SCALE\nBY CUTTING NOISE.",
    whyYou: "Shipping products\nSystem ownership",
    whyCare: "Decisions pile up quickly.",
  },
];

function StudioHeroSection() {
  const [index, setIndex] = useState(0);
  const current = STUDIO_ANGLES[index];

  return (
    <section data-system="studio" className="bg-[var(--cobalt-wash)] py-[clamp(5rem,11vw,10rem)]">
      <div className="landing-shell-wide grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <Kicker tone="cobalt">STUDIO HERO</Kicker>
          <h3 className="mt-5 text-[clamp(2.1rem,5.7vw,5rem)] leading-[0.9] font-light tracking-[-0.05em] text-[var(--ink-900)]">
            OPEN STUDIO
            <br />
            WITH NOTHING
            <br />
            TO SAY.
          </h3>
          <p className="mt-5 text-[22px] leading-none font-light tracking-[-0.02em] text-cobalt">That&apos;s the point.</p>
        </div>

        <div className="relative rounded-[10px] border border-[var(--cobalt-line)] bg-[linear-gradient(180deg,var(--bone-000),white)] px-5 py-6 shadow-[0_20px_34px_-28px_rgba(22,28,52,0.52)] sm:px-7 sm:py-7">
          <div className="flex items-center justify-between border-b border-[var(--cobalt-line)] pb-3">
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-cobalt">TODAY / 01</p>
            <button
              type="button"
              onClick={() => setIndex((value) => (value + 1) % STUDIO_ANGLES.length)}
              className="text-[12px] font-medium text-cobalt"
            >
              DIFFERENT ANGLE
            </button>
          </div>

          <p className="mt-5 whitespace-pre-line text-[clamp(1.8rem,4.6vw,3.1rem)] leading-[0.93] font-light tracking-[-0.045em] text-[var(--ink-900)]">
            {current.title}
          </p>

          <div className="mt-8 grid gap-5 border-t border-[var(--cobalt-line)] pt-5 sm:grid-cols-2">
            <div>
              <p className="text-mono-regular text-[9px] tracking-[0.14em] uppercase text-cobalt">WHY YOU</p>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[var(--ink-800)]">{current.whyYou}</p>
            </div>
            <div>
              <p className="text-mono-regular text-[9px] tracking-[0.14em] uppercase text-cobalt">
                WHY YOUR AUDIENCE CARES
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-800)]">{current.whyCare}</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Link href="/signup" className="text-[13px] font-medium text-[var(--ink-900)]">
              WRITE THIS -&gt;
            </Link>
            <span className="text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
              EDITORIAL INSTRUMENT
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const IDENTITY_COLUMNS = [
  { title: "KNOWN FOR", items: ["Rails", "React", "Systems"] },
  { title: "EXPERIENCE", items: ["Legacy modernization", "Architecture", "Shipping products"] },
  { title: "PERSPECTIVE", items: ["Complexity", "Engineering judgment", "AI products"] },
  { title: "AUDIENCE", items: ["Founders", "Engineers"] },
  { title: "JOURNEY", items: ["Recent work", "Current observations"] },
];

function ContentIdentitySection() {
  return (
    <section id="studio-identity" data-system="studio" className="bg-[var(--bone-000)] py-[clamp(5rem,10vw,9rem)]">
      <div className="landing-shell-wide">
        <Kicker tone="cobalt">CONTENT IDENTITY</Kicker>

        <div className="mt-8 grid items-start gap-12 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-[clamp(4rem,10vw,7.6rem)] leading-[0.78] font-light tracking-[-0.065em] text-[var(--ink-900)]">
              FIZZA
            </p>
            <p className="mt-4 max-w-[20rem] text-[15px] text-[var(--ink-700)]">
              Studio maps professional memory, context, and voice before it writes a single line.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {IDENTITY_COLUMNS.map((column) => (
              <div key={column.title} className="rounded-[4px] border border-[var(--bone-200)] bg-white px-3.5 py-3.5">
                <p className="text-mono-regular text-[9px] tracking-[0.13em] uppercase text-cobalt">{column.title}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {column.items.map((item) => (
                    <li key={item} className="text-[13px] text-[var(--ink-800)]">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-[8px] border border-[var(--cobalt-line)] bg-[linear-gradient(180deg,white,var(--cobalt-surface))] px-5 py-5">
          <p className="text-mono-regular text-[10px] tracking-[0.13em] uppercase text-cobalt">
            LEGACY MODERNIZATION * ENGINEERING JUDGMENT * FOUNDERS
          </p>
          <p className="mt-4 text-[clamp(1.4rem,2.7vw,2.1rem)] leading-snug font-light tracking-[-0.03em] text-[var(--ink-900)]">
            &quot;You don&apos;t modernize legacy software by replacing everything.&quot;
          </p>
        </div>
      </div>
    </section>
  );
}

const IDEA_STAGES = [
  {
    code: "01 / SIGNAL",
    title: "Raw observation",
    body: "Legacy systems are not fixed by replacing everything.",
    note: "Source: recent client work",
  },
  {
    code: "02 / IDEA",
    title: "Core thought",
    body: "Senior engineers measure progress by what they remove.",
    note: "Audience: founders shipping software",
  },
  {
    code: "03 / ANGLE",
    title: "Editorial shape",
    body: "Delete more code when your team needs clearer systems.",
    note: "Why now: scaling pressure",
  },
  {
    code: "04 / POST",
    title: "Credible draft",
    body:
      "Junior me measured output in lines added. Senior me measures impact in complexity removed. Last quarter our best upgrade removed 40% of a module and support tickets dropped.",
    note: "Voice: technical and direct",
  },
  {
    code: "05 / VISUAL",
    title: "Visual pair",
    body: "Before: tangled module map. After: split, named boundaries.",
    note: "Asset: publication-ready illustration",
  },
] as const;

function IdeaEvolutionSection() {
  const current = IDEA_STAGES[0];

  return (
    <section id="studio-evolution" data-system="studio" className="bg-[var(--bone-050)] py-[clamp(5rem,10vw,9rem)]">
      <div className="landing-shell-wide grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Kicker tone="cobalt">IDEA BECOMES CONTENT</Kicker>
          <p className="mt-4 text-[clamp(1.9rem,4.1vw,3.4rem)] leading-[0.95] font-light tracking-[-0.04em] text-[var(--ink-900)]">
            &quot;You don&apos;t modernize legacy software by replacing everything.&quot;
          </p>
        </div>

        <div className="rounded-[8px] border border-[var(--cobalt-line)] bg-white px-5 py-5 shadow-[0_24px_40px_-30px_rgba(15,19,31,0.52)] sm:px-6 sm:py-6">
          <p className="text-mono-regular text-[10px] tracking-[0.13em] uppercase text-cobalt">{current.code}</p>
          <p className="mt-3 text-[26px] leading-[1.02] font-light tracking-[-0.04em] text-[var(--ink-900)]">
            {current.title}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-800)]">{current.body}</p>
          <p className="mt-5 border-t border-[var(--cobalt-line)] pt-3 text-mono-regular text-[10px] tracking-[0.11em] uppercase text-[var(--stone)]">
            {current.note}
            </p>

             <ol className="mt-5 flex flex-wrap gap-2">
               {IDEA_STAGES.map((item) => (
                 <li
                   key={item.code}
                   className="rounded-[2px] border border-[var(--cobalt-line)] bg-[var(--cobalt-surface)] px-2 py-1 text-mono-regular text-[9px] tracking-[0.1em] uppercase text-cobalt"
                 >
                   {item.code}
                 </li>
               ))}
             </ol>
          </div>
        </div>
    </section>
  );
}

const ART_TILES = [
  { name: "SIGNAL", tone: "orange" as const },
  { name: "OPPORTUNITY", tone: "orange" as const },
  { name: "IDENTITY", tone: "orange" as const },
  { name: "PROOF", tone: "orange" as const },
  { name: "KNOWLEDGE", tone: "cobalt" as const },
  { name: "SYNTHESIS", tone: "cobalt" as const },
  { name: "CONVERGENCE", tone: "mixed" as const },
  { name: "GROWTH LOOP", tone: "mixed" as const },
];

function artStyle(tone: (typeof ART_TILES)[number]["tone"]): CSSProperties {
  if (tone === "orange") {
    return {
      background:
        "radial-gradient(120% 120% at 10% 0%, color-mix(in srgb, var(--orange-signal) 32%, transparent), transparent 55%), radial-gradient(80% 90% at 95% 100%, color-mix(in srgb, var(--orange-signal) 22%, transparent), transparent 62%), linear-gradient(160deg, white, var(--orange-surface))",
    };
  }

  if (tone === "cobalt") {
    return {
      background:
        "radial-gradient(120% 120% at 10% 0%, color-mix(in srgb, var(--cobalt-signal) 28%, transparent), transparent 55%), radial-gradient(80% 90% at 95% 100%, color-mix(in srgb, var(--cobalt-signal) 20%, transparent), transparent 62%), linear-gradient(160deg, white, var(--cobalt-surface))",
    };
  }

  return {
    background:
      "linear-gradient(140deg, color-mix(in srgb, var(--orange-surface) 75%, white), white 45%, color-mix(in srgb, var(--cobalt-surface) 78%, white))",
  };
}

function ArtSystemSection() {
  return (
    <section id="art-system" data-system="studio" className="bg-[var(--bone-000)] py-[clamp(4.8rem,10vw,8.5rem)]">
      <div className="landing-shell-wide">
        <Kicker tone="ink">VISUAL LANGUAGE</Kicker>
        <p className="mt-4 max-w-2xl text-[clamp(1.6rem,3.4vw,2.8rem)] leading-[1] font-light tracking-[-0.036em] text-[var(--ink-900)]">
          A generated Relay/Studio asset family, integrated into product storytelling.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ART_TILES.map((tile, index) => (
            <div
              key={tile.name}
              className="group relative overflow-hidden border border-[var(--bone-200)]"
              style={{
                ...artStyle(tile.tone),
                borderRadius: index % 3 === 0 ? 12 : index % 3 === 1 ? 4 : 8,
                minHeight: index % 4 === 0 ? 180 : 150,
              }}
            >
              <div className="absolute inset-0 opacity-65">
                <span className="launch-art-pulse launch-art-pulse-orange" />
                <span className="launch-art-pulse launch-art-pulse-cobalt" />
              </div>
              <div className="relative p-4">
                <p className="text-mono-regular text-[9px] tracking-[0.13em] uppercase text-[var(--stone)]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-2 text-[15px] font-medium tracking-[-0.01em] text-[var(--ink-900)]">{tile.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConvergenceSection() {
  return (
    <section
      id="convergence"
      data-system="studio"
      className="relative min-h-[100svh] overflow-hidden bg-[var(--ink-950)] py-20"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <span
          className="absolute -left-[18%] top-[14%] h-[42%] w-[52%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--cobalt-signal) 24%, transparent), transparent 70%)",
          }}
        />
        <span
          className="absolute -right-[16%] bottom-[10%] h-[46%] w-[52%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--orange-signal) 24%, transparent), transparent 70%)",
          }}
        />
      </div>

      <div className="landing-shell-wide relative grid min-h-[82svh] content-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-mono-regular text-[11px] tracking-[0.16em] uppercase text-cobalt">COBALT / STUDIO</p>
          <p
            className="mt-3 text-[12px] leading-relaxed"
            style={{ color: "color-mix(in srgb, var(--bone-000) 72%, var(--stone-light))" }}
          >
            KNOWLEDGE -&gt; IDEA -&gt; AUTHORITY -&gt; DEMAND
          </p>
        </div>

        <div className="lg:text-right">
          <p className="text-mono-regular text-[11px] tracking-[0.16em] uppercase text-orange">ORANGE / RELAY</p>
          <p
            className="mt-3 text-[12px] leading-relaxed"
            style={{ color: "color-mix(in srgb, var(--bone-000) 72%, var(--stone-light))" }}
          >
            OPPORTUNITY -&gt; DECISION -&gt; ACTION -&gt; OUTCOME
          </p>
        </div>

        <div className="lg:col-span-2">
          <p className="text-[clamp(2.5rem,7vw,7rem)] leading-[0.86] font-light tracking-[-0.055em] text-[var(--bone-000)]">
            CREATE
            <br />
            DEMAND.
          </p>
          <p className="mt-4 text-[clamp(2.5rem,7vw,7rem)] leading-[0.86] font-light tracking-[-0.055em] text-[var(--bone-000)] lg:text-right">
            x
            <br />
            CAPTURE
            <br />
            DEMAND.
          </p>
        </div>

        <div className="absolute inset-x-0 top-1/2 hidden -translate-y-1/2 lg:block" aria-hidden="true">
          <div className="mx-auto flex max-w-5xl items-center gap-4">
            <span className="h-px flex-1 bg-cobalt" />
            <span className="launch-intersection-shape" />
            <span className="h-px flex-1 bg-orange" />
          </div>
        </div>
      </div>

      <p className="relative z-10 mt-4 text-center text-mono-regular text-[11px] tracking-[0.22em] uppercase text-[var(--bone-000)]">
        ONE GROWTH LOOP.
      </p>
    </section>
  );
}

function LoopSection() {
  return (
    <section id="loop" data-system="studio" className="bg-[var(--bone-050)] py-[clamp(5rem,11vw,9.5rem)]">
      <div className="landing-shell-wide">
        <div className="mx-auto max-w-3xl text-center">
          <Kicker tone="ink">SHOW THE LOOP</Kicker>
          <p className="mt-5 text-[clamp(1.9rem,4.8vw,4rem)] leading-[0.92] font-light tracking-[-0.045em] text-[var(--ink-900)]">
            STUDIO CREATED IT.
            <br />
            RELAY CAUGHT IT.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl items-start gap-5 lg:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-[6px] border border-[var(--cobalt-line)] bg-white p-5">
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-cobalt">STUDIO PUBLISHED</p>
            <p className="mt-3 text-[18px] leading-snug font-light tracking-[-0.02em] text-[var(--ink-900)]">
              &quot;You don&apos;t modernize legacy software by replacing everything.&quot;
            </p>
          </div>

          <div className="flex h-full min-h-[120px] items-center justify-center px-1">
            <div className="relative h-px w-28 bg-[var(--bone-200)] sm:w-40" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-cobalt launch-loop-dot" />
              <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-orange" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[6px] border border-[var(--bone-200)] bg-white p-5">
              <p className="flex items-center justify-between text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--stone)]">
                <span>ALEX</span>
                <span>10:42</span>
              </p>
              <p className="mt-3 text-[18px] leading-snug text-[var(--ink-900)]">
                &quot;Do you work with teams at our stage?&quot;
              </p>
            </div>

            <div className="rounded-[6px] border border-[var(--orange-line)] bg-[var(--orange-surface)] p-5">
              <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">
                NEW INBOUND OPPORTUNITY
              </p>
              <p className="mt-2 text-[13px] text-[var(--ink-800)]">Identity attached: Hassan. Proof attached: Marketplace modernization.</p>
              <p className="mt-3 text-[13px] font-medium text-orange">NEXT MOVE / PREPARE REPLY</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const TEAM_ROWS = [
  { name: "MEHAK", channel: "LinkedIn", progress: "28 / 35", status: "ON TRACK", remaining: "7 remaining" },
  { name: "HASSAN", channel: "Upwork", progress: "4 / 10", status: "AT RISK", remaining: "6 remaining" },
  { name: "ANEEB", channel: "LinkedIn", progress: "30 / 30", status: "COMPLETE", remaining: "Target met" },
];

function TeamCommandSection() {
  const [active, setActive] = useState(TEAM_ROWS[0].name);
  const current = TEAM_ROWS.find((row) => row.name === active) ?? TEAM_ROWS[0];

  return (
    <section id="teams" data-system="relay" className="bg-[var(--bone-000)] py-[clamp(5rem,10vw,9.4rem)]">
      <div className="landing-shell-wide">
        <Kicker>FOUNDER COMMAND</Kicker>
        <h3 className="mt-5 text-[clamp(2.1rem,5.7vw,5rem)] leading-[0.9] font-light tracking-[-0.05em] text-[var(--ink-900)]">
          KNOW WHAT
          <br />
          YOUR TEAM
          <br />
          NEEDS TO DO.
        </h3>

        <div className="mt-11 grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="launch-team-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--console-line)] px-5 py-3">
              <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--console-mute)]">
                TEAM / TODAY
              </p>
              <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--console-mute)]">
                IDENTITIES · TARGETS · ACTIVITY · REPLIES · OPPORTUNITIES
              </p>
            </div>

            {TEAM_ROWS.map((row) => {
              const isActive = row.name === active;
              return (
                <button
                  key={row.name}
                  type="button"
                  onMouseEnter={() => setActive(row.name)}
                  onFocus={() => setActive(row.name)}
                  onClick={() => setActive(row.name)}
                  className="grid w-full grid-cols-[1.25fr_0.9fr_0.9fr] items-center gap-2 border-b border-[var(--console-line)] px-5 py-4 text-left last:border-b-0"
                >
                  <div>
                    <p className="text-[17px] leading-none font-light tracking-[-0.02em] text-[var(--console-text)]">
                      {row.name}
                    </p>
                    <p className="mt-1 text-mono-regular text-[10px] tracking-[0.1em] uppercase text-[var(--console-mute)]">
                      {row.channel}
                    </p>
                  </div>
                  <p className="text-[13px] text-[var(--console-text)]">{row.progress}</p>
                  <p
                    className={cn(
                      "text-mono-regular text-[10px] tracking-[0.1em] uppercase",
                      row.status === "AT RISK"
                        ? "text-orange"
                        : row.status === "COMPLETE"
                          ? "text-cobalt"
                          : "text-[var(--console-mute)]",
                      isActive && "text-[var(--console-text)]",
                    )}
                  >
                    {row.status}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="rounded-[6px] border border-[var(--bone-200)] bg-white p-5">
            <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--stone)]">
              CURRENT STATUS / {current.name}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-800)]">
              {current.remaining}. Admin owns truth. Reps own execution. Relay owns measurement and
              prioritization.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ManifestoSection() {
  return (
    <section id="manifesto" data-system="relay" className="bg-[var(--bone-050)] py-[clamp(5.5rem,12vw,11rem)]">
      <div className="landing-shell-wide">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-mono-regular text-[11px] tracking-[0.18em] uppercase text-orange">RELAY</p>
            <ul className="mt-4 space-y-2 text-[20px] leading-tight font-light tracking-[-0.02em] text-[var(--ink-900)]">
              <li>Researches</li>
              <li>Prioritizes</li>
              <li>Prepares</li>
              <li>Drafts</li>
              <li>Remembers</li>
            </ul>
          </div>

          <div>
            <p className="text-mono-regular text-[11px] tracking-[0.18em] uppercase text-cobalt">YOU</p>
            <ul className="mt-4 space-y-2 text-[20px] leading-tight font-light tracking-[-0.02em] text-[var(--ink-900)]">
              <li>Judge</li>
              <li>Correct</li>
              <li>Approve</li>
              <li>Send</li>
              <li>Build the relationship</li>
            </ul>
          </div>
        </div>

        <p className="mt-14 text-[clamp(2.3rem,6.6vw,6.1rem)] leading-[0.87] font-light tracking-[-0.055em] text-[var(--ink-900)]">
          AI DOES
          <br />
          THE PREPARATION.
          <br />
          PEOPLE
          <br />
          MAKE THE MOVE.
        </p>
      </div>
    </section>
  );
}

function PakistanSection() {
  return (
    <section id="pakistan" data-system="relay" className="bg-[var(--bone-000)] py-[clamp(5rem,11vw,10rem)]">
      <div className="landing-shell-wide">
        <p className="text-[clamp(2.4rem,6.7vw,6rem)] leading-[0.87] font-light tracking-[-0.055em] text-[var(--ink-900)]">
          MADE IN
          <br />
          PAKISTAN,
          <br />
          FOR THE
          <br />
          WORLD.
        </p>
        <p className="mt-7 max-w-[20rem] text-[14px] text-[var(--ink-700)]">
          Relay is a product of <strong>Breakthrough Pulse Pvt. Limited.</strong>
        </p>
        <p className="mt-3 text-mono-regular text-[10px] tracking-[0.16em] uppercase text-[var(--stone)]">
          PK -&gt; WORLD
        </p>
      </div>
    </section>
  );
}

function WhoForSection() {
  const groups = [
    "Software agencies",
    "Development studios",
    "Technical founders",
    "BD teams",
  ];

  return (
    <section id="who-for" data-system="relay" className="bg-[var(--bone-050)] py-[clamp(4.8rem,10vw,8.8rem)]">
      <div className="landing-shell-wide">
        <p className="text-[clamp(2rem,5.5vw,4.7rem)] leading-[0.9] font-light tracking-[-0.05em] text-[var(--ink-900)]">
          MULTIPLE PEOPLE.
          <br />
          MULTIPLE PROFILES.
          <br />
          MULTIPLE CHANNELS.
          <br />
          ONE COMPANY
          <br />
          TRYING TO GROW.
        </p>

        <ul className="mt-10 grid gap-2 text-[15px] text-[var(--ink-800)] sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
          {groups.map((group) => (
            <li key={group} className="rounded-[3px] border border-[var(--bone-200)] bg-white px-3 py-2.5">
              {group}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-[16px] text-[var(--ink-800)]">
          Relay turns scattered growth work into a system.
        </p>
      </div>
    </section>
  );
}

const INDEX_RELAY = [
  ["01", "Prospect Check", "See fit before writing"],
  ["02", "Leads", "Keep the right opportunities"],
  ["03", "Revenue Identities", "Route by real context"],
  ["04", "Outreach", "Prepared in your voice"],
  ["05", "Follow-ups", "Nothing important goes quiet"],
  ["06", "Replies", "Handle live inbound first"],
  ["07", "Conversations", "Context stays attached"],
  ["08", "Jobs", "Rank opportunities by fit"],
  ["09", "Proposals", "Attach relevant proof"],
  ["10", "Action Queue", "Know where to start"],
  ["11", "Accountability", "Measure decisions and outcomes"],
];

const INDEX_STUDIO = [
  ["01", "Today", "One useful idea"],
  ["02", "Content Identity", "Map what you can say"],
  ["03", "Ideas", "Keep a growing editorial pool"],
  ["04", "Quick Capture", "Save raw thoughts fast"],
  ["05", "Journey", "Track observations over time"],
  ["06", "Writing", "Shape credible drafts"],
  ["07", "Visuals", "Build publication assets"],
  ["08", "Memory", "Avoid repeating weak content"],
  ["09", "Learning", "Strengthen what works"],
];

function ProductDepthSection() {
  const [activeRelay, setActiveRelay] = useState(INDEX_RELAY[0][1]);
  const [activeStudio, setActiveStudio] = useState(INDEX_STUDIO[0][1]);

  return (
    <section id="depth" data-system="relay" className="bg-[var(--bone-000)] py-[clamp(5rem,10vw,9rem)]">
      <div className="landing-shell-wide">
        <Kicker>PRODUCT DEPTH</Kicker>
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <IndexColumn
            title="RELAY / CAPTURE DEMAND"
            tone="orange"
            items={INDEX_RELAY}
            active={activeRelay}
            onActive={setActiveRelay}
          />
          <IndexColumn
            title="STUDIO / CREATE DEMAND"
            tone="cobalt"
            items={INDEX_STUDIO}
            active={activeStudio}
            onActive={setActiveStudio}
          />
        </div>
      </div>
    </section>
  );
}

function IndexColumn({
  title,
  tone,
  items,
  active,
  onActive,
}: {
  title: string;
  tone: "orange" | "cobalt";
  items: string[][];
  active: string;
  onActive: (value: string) => void;
}) {
  return (
    <div className="rounded-[6px] border border-[var(--bone-200)] bg-white p-4 sm:p-5">
      <p className={cn("text-mono-regular text-[10px] tracking-[0.14em] uppercase", tone === "orange" ? "text-orange" : "text-cobalt")}>{title}</p>
      <ul className="mt-3 divide-y divide-[var(--bone-200)] border-t border-[var(--bone-200)]">
        {items.map(([idx, label, desc]) => {
          const isActive = label === active;
          return (
            <li key={label}>
              <button
                type="button"
                className="grid w-full grid-cols-[2.2rem_1fr] items-start gap-2 py-3 text-left"
                onMouseEnter={() => onActive(label)}
                onFocus={() => onActive(label)}
                onClick={() => onActive(label)}
              >
                <span className={cn("text-mono-regular text-[10px] tracking-[0.11em] uppercase", tone === "orange" ? "text-orange" : "text-cobalt")}>{idx}</span>
                <span>
                  <span className="block text-[14px] font-medium text-[var(--ink-900)]">{label}</span>
                  <span className={cn("mt-1 block text-[12px]", isActive ? "text-[var(--ink-700)]" : "text-[var(--stone)]")}>{desc}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PricingSection() {
  return (
    <section id="pricing" data-system="relay" className="bg-[var(--bone-050)] py-[clamp(5rem,10vw,8.5rem)]">
      <div className="landing-shell-wide">
        <Kicker>PRICING</Kicker>
        <div className="mt-8 rounded-[10px] border border-[var(--bone-200)] bg-[linear-gradient(170deg,white,var(--bone-050))] p-5 sm:p-7">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">FREE</p>
              <p className="mt-3 text-[clamp(1.8rem,3.7vw,3rem)] leading-[0.94] font-light tracking-[-0.04em] text-[var(--ink-900)]">
                Start tomorrow morning with a clear queue.
              </p>
              <ul className="mt-5 space-y-2 text-[14px] text-[var(--ink-800)]">
                <li>Prospect checks</li>
                <li>Action queue</li>
                <li>Studio daily idea support</li>
              </ul>
              <div className="mt-8">
                <RelayCta href="/signup">START FREE</RelayCta>
              </div>
              <p className="mt-3 text-[12px] text-[var(--stone)]">No card required.</p>
            </div>

            <div className="space-y-4 border-t border-[var(--bone-200)] pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
              <PlanLane title="PRO" body="For people running Relay every day." note="Paid plan coming soon." />
              <PlanLane title="TEAM" body="For multi-identity teams and founder command." note="Join waitlist." />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanLane({ title, body, note }: { title: string; body: string; note: string }) {
  return (
    <div className="rounded-[4px] border border-[var(--bone-200)] bg-white px-4 py-3.5">
      <p className="text-mono-regular text-[10px] tracking-[0.13em] uppercase text-[var(--ink-700)]">{title}</p>
      <p className="mt-1 text-[14px] text-[var(--ink-800)]">{body}</p>
      <p className="mt-2 text-mono-regular text-[10px] tracking-[0.1em] uppercase text-[var(--stone)]">{note}</p>
    </div>
  );
}

function FinalReturnSection() {
  return (
    <section id="final-return" data-system="relay" className="bg-[var(--bone-000)] py-[clamp(4.8rem,10vw,8.8rem)]">
      <div className="landing-shell-wide">
        <div className="mx-auto max-w-4xl rounded-[10px] border border-[var(--bone-200)] bg-[linear-gradient(180deg,var(--bone-050),white)] p-5 sm:p-8">
          <Kicker>RETURN TO THE LOOP</Kicker>
          <div className="mt-6 grid gap-5 lg:grid-cols-[0.94fr_1.06fr]">
            <div className="rounded-[6px] border border-[var(--bone-200)] bg-white px-4 py-4">
              <p className="text-mono-regular text-[10px] tracking-[0.14em] uppercase text-orange">NEW INBOUND</p>
              <p className="mt-3 text-[17px] leading-snug text-[var(--ink-900)]">Alex replied. Asking for stage-fit support.</p>
            </div>

            <div className="launch-relay-object overflow-hidden rounded-[6px]">
              <div className="border-b border-[var(--console-line)] px-4 py-3">
                <p className="text-mono-regular text-[10px] tracking-[0.12em] uppercase text-[var(--console-mute)]">
                  YOUR RELAY
                </p>
              </div>
              <div className="px-4 py-4">
                <p className="text-mono-regular text-[10px] tracking-[0.12em] uppercase text-orange">01 / NOW</p>
                <p className="mt-2 text-[20px] leading-none font-light tracking-[-0.03em] text-[var(--console-text)]">
                  ALEX REPLIED
                </p>
                <p className="mt-3 text-[13px] text-[var(--console-mute)]">Intent checked, proof attached, next move prepared.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section id="final-cta" data-system="relay" className="bg-[var(--bone-050)] py-[clamp(6rem,15vw,13rem)]">
      <div className="landing-shell text-center">
        <Kicker>RELAY / YOUR NEXT MOVE</Kicker>
        <p className="mx-auto mt-6 max-w-4xl text-[clamp(2.2rem,6.8vw,6.3rem)] leading-[0.88] font-light tracking-[-0.055em] text-[var(--ink-900)]">
          TOMORROW MORNING,
          <br />
          KNOW WHERE
          <br />
          TO START.
        </p>
        <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-[var(--ink-700)]">
          Create demand with Studio. Capture it with Relay.
        </p>

        <div className="mt-10">
          <RelayCta href="/signup">START FREE</RelayCta>
        </div>
        <p className="mt-4 text-[12px] text-[var(--stone)]">No card required.</p>

        <p className="mt-10 text-mono-regular text-[11px] tracking-[0.14em] uppercase text-[var(--ink-700)]">
          MADE IN PAKISTAN, FOR THE WORLD.
        </p>
        <p className="mt-2 text-[13px] text-[var(--ink-700)]">A product of Breakthrough Pulse Pvt. Limited.</p>
      </div>
    </section>
  );
}

export function RelayLaunchPage() {
  return (
    <div className="landing-page">
      <HeroSection />
      <NoiseCompressionSection />
      <section id="product" data-system="relay">
        <PriorityQueueSection />
      </section>
      <ProspectCheckSection />
      <RevenueIdentitySection />
      <ProofSection />
      <IntelligenceBenchmarkProofSection />
      <HumanGateSection />
      <StudioRevealSection />
      <StudioHeroSection />
      <ContentIdentitySection />
      <IdeaEvolutionSection />
      <ArtSystemSection />
      <ConvergenceSection />
      <LoopSection />
      <TeamCommandSection />
      <ManifestoSection />
      <PakistanSection />
      <WhoForSection />
      <ProductDepthSection />
      <PricingSection />
      <FinalReturnSection />
      <FinalCtaSection />
    </div>
  );
}
