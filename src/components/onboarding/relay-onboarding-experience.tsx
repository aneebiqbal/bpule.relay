"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { cn } from "cn";
import type { RepRole } from "@/lib/domain/types";
import type { QuizAnswers } from "@/lib/style/quiz";
import { DEFAULT_QUIZ } from "@/lib/style/quiz";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import {
  RelayAuthShell,
  RelayAuthSurface,
  RelayField,
} from "@/components/auth/relay-auth-shell";

type Goal = "pipeline" | "responses" | "authority" | "focus";
type WorkModel = "agency" | "freelance" | "inhouse" | "product";
type PrimaryChannel = "linkedin" | "email" | "upwork";
type StepId = "you" | "work" | "goal" | "profiles" | "voice" | "ready";

type IdentitySummary = {
  id: string;
  name: string;
  title?: string | null;
  channel?: string;
  status?: string | null;
};

type FirstAction = {
  title: string;
  detail: string;
  href: string;
  cta: string;
  secondaryHref: string;
  secondaryCta: string;
};

type Draft = {
  step: StepId;
  displayName: string;
  workspaceName: string;
  website: string;
  workModel: WorkModel;
  goal: Goal;
  channel: PrimaryChannel;
  identityName: string;
  identityTitle: string;
  identityPositioning: string;
  formality: QuizAnswers["formality"];
  sentenceLength: QuizAnswers["sentenceLength"];
  openers: QuizAnswers["openers"];
  contractions: QuizAnswers["contractions"];
  punctuation: QuizAnswers["punctuation"];
  greeting: string;
  signOff: string;
  preferredWords: string;
  neverWords: string;
  samples: string;
};

export type OnboardingBootstrap = {
  repId: string;
  repName: string;
  role: RepRole;
  organizationName: string;
  initialIdentityCount: number;
};

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "you", label: "You" },
  { id: "work", label: "Work" },
  { id: "goal", label: "Goal" },
  { id: "profiles", label: "Profiles" },
  { id: "voice", label: "Voice" },
  { id: "ready", label: "Ready" },
];

const GOAL_EFFECT: Record<Goal, string> = {
  pipeline: "Relay prioritizes highest-fit new opportunities first.",
  responses: "Relay shifts toward reply-needed and follow-up tasks.",
  authority: "Relay biases first-value flow toward Studio and proof content.",
  focus: "Relay starts with one clear next action and suppresses noise.",
};

const WORK_MODEL_EFFECT: Record<WorkModel, string> = {
  agency: "Relay emphasizes account-based prospect checks and team visibility.",
  freelance: "Relay optimizes for quick qualification and personal trust proof.",
  inhouse: "Relay keeps routing aligned to shared ownership across reps.",
  product: "Relay routes toward inbound demand and category-fit opportunities.",
};

const ASSEMBLY_STAGES = [
  "Indexing your onboarding inputs",
  "Calibrating your writing profile",
  "Resolving your first route",
] as const;

const STORAGE_VERSION = 1;

function firstWord(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean)[0] ?? "there";
}

function makeDraft(bootstrap: OnboardingBootstrap): Draft {
  const displayName = bootstrap.repName.replace(/\(.*\)$/g, "").trim() || bootstrap.repName;
  const baseGreeting = firstWord(displayName) === "there" ? DEFAULT_QUIZ.greeting : `Hi ${firstWord(displayName)}`;

  return {
    step: "you",
    displayName,
    workspaceName: bootstrap.organizationName,
    website: "",
    workModel: bootstrap.role === "admin" ? "agency" : "freelance",
    goal: "pipeline",
    channel: bootstrap.role === "sourcer" ? "upwork" : "linkedin",
    identityName: "",
    identityTitle: "",
    identityPositioning: "",
    formality: DEFAULT_QUIZ.formality,
    sentenceLength: DEFAULT_QUIZ.sentenceLength,
    openers: DEFAULT_QUIZ.openers,
    contractions: DEFAULT_QUIZ.contractions,
    punctuation: DEFAULT_QUIZ.punctuation,
    greeting: baseGreeting,
    signOff: DEFAULT_QUIZ.signOff,
    preferredWords: DEFAULT_QUIZ.preferredWords,
    neverWords: DEFAULT_QUIZ.neverWords,
    samples: "",
  };
}

function sanitizeDraft(raw: unknown, fallback: Draft): Draft {
  if (!raw || typeof raw !== "object") return fallback;
  const input = raw as Record<string, unknown>;

  const step = typeof input.step === "string" && STEPS.some((item) => item.id === input.step) ? (input.step as StepId) : fallback.step;

  const formality = typeof input.formality === "number" && [1, 2, 3, 4, 5].includes(input.formality)
    ? (input.formality as QuizAnswers["formality"])
    : fallback.formality;

  return {
    ...fallback,
    step,
    displayName: typeof input.displayName === "string" ? input.displayName : fallback.displayName,
    workspaceName: typeof input.workspaceName === "string" ? input.workspaceName : fallback.workspaceName,
    website: typeof input.website === "string" ? input.website : fallback.website,
    workModel: typeof input.workModel === "string" && ["agency", "freelance", "inhouse", "product"].includes(input.workModel)
      ? (input.workModel as WorkModel)
      : fallback.workModel,
    goal: typeof input.goal === "string" && ["pipeline", "responses", "authority", "focus"].includes(input.goal)
      ? (input.goal as Goal)
      : fallback.goal,
    channel: typeof input.channel === "string" && ["linkedin", "email", "upwork"].includes(input.channel)
      ? (input.channel as PrimaryChannel)
      : fallback.channel,
    identityName: typeof input.identityName === "string" ? input.identityName : fallback.identityName,
    identityTitle: typeof input.identityTitle === "string" ? input.identityTitle : fallback.identityTitle,
    identityPositioning: typeof input.identityPositioning === "string" ? input.identityPositioning : fallback.identityPositioning,
    formality,
    sentenceLength: typeof input.sentenceLength === "string" && ["short", "medium", "long"].includes(input.sentenceLength)
      ? (input.sentenceLength as QuizAnswers["sentenceLength"])
      : fallback.sentenceLength,
    openers: typeof input.openers === "string" && ["question", "statement"].includes(input.openers)
      ? (input.openers as QuizAnswers["openers"])
      : fallback.openers,
    contractions: typeof input.contractions === "string" && ["mostly_yes", "sometimes", "mostly_no"].includes(input.contractions)
      ? (input.contractions as QuizAnswers["contractions"])
      : fallback.contractions,
    punctuation: typeof input.punctuation === "string" && ["relaxed", "standard", "heavy"].includes(input.punctuation)
      ? (input.punctuation as QuizAnswers["punctuation"])
      : fallback.punctuation,
    greeting: typeof input.greeting === "string" ? input.greeting : fallback.greeting,
    signOff: typeof input.signOff === "string" ? input.signOff : fallback.signOff,
    preferredWords: typeof input.preferredWords === "string" ? input.preferredWords : fallback.preferredWords,
    neverWords: typeof input.neverWords === "string" ? input.neverWords : fallback.neverWords,
    samples: typeof input.samples === "string" ? input.samples : fallback.samples,
  };
}

function initializeDraft(bootstrap: OnboardingBootstrap): { draft: Draft; resumed: boolean } {
  const fallback = makeDraft(bootstrap);
  if (typeof window === "undefined") return { draft: fallback, resumed: false };

  try {
    const raw = localStorage.getItem(`relay-onboarding:v${STORAGE_VERSION}:${bootstrap.repId}`);
    if (!raw) return { draft: fallback, resumed: false };

    const parsed = JSON.parse(raw) as { version?: number; draft?: unknown };
    if (parsed.version !== STORAGE_VERSION) return { draft: fallback, resumed: false };

    return { draft: sanitizeDraft(parsed.draft, fallback), resumed: true };
  } catch {
    return { draft: fallback, resumed: false };
  }
}

function draftToQuiz(draft: Draft): QuizAnswers {
  return {
    contractions: draft.contractions,
    formality: draft.formality,
    sentenceLength: draft.sentenceLength,
    punctuation: draft.punctuation,
    openers: draft.openers,
    emoji: draft.channel === "linkedin" ? "light" : "none",
    greeting: draft.greeting.trim() || DEFAULT_QUIZ.greeting,
    signOff: draft.signOff.trim() || DEFAULT_QUIZ.signOff,
    neverWords: draft.neverWords,
    preferredWords: draft.preferredWords,
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 34);
}

function buildFirstAction(args: {
  role: RepRole;
  identities: number;
  queueTotal: number | null;
  goal: Goal;
  channel: PrimaryChannel;
}): FirstAction {
  if (args.identities === 0 && args.role === "admin") {
    return {
      title: "Create your first revenue identity",
      detail: "Relay is ready. Add one active identity so routing and accountability can stay precise.",
      href: "/manage-profiles",
      cta: "Create identity",
      secondaryHref: "/dashboard",
      secondaryCta: "Open dashboard first",
    };
  }

  if (args.identities === 0 && args.role !== "admin") {
    return {
      title: "Review assigned profiles",
      detail: "You currently have no active profile assignments. Confirm access before running outreach.",
      href: "/profiles",
      cta: "Check profile assignments",
      secondaryHref: "/dashboard",
      secondaryCta: "Open dashboard first",
    };
  }

  if ((args.queueTotal ?? 0) > 0) {
    return {
      title: "Run your first Relay activation",
      detail: "Your queue already has prioritized tasks. Start from the activation path for the fastest first win.",
      href: "/activate",
      cta: "Open activation",
      secondaryHref: "/dashboard",
      secondaryCta: "Go to dashboard",
    };
  }

  if (args.goal === "authority") {
    return {
      title: "Publish your first Studio draft",
      detail: "Build authority first. Relay will keep routing proof-backed publishing prompts from here.",
      href: "/content/new",
      cta: "Open Studio draft",
      secondaryHref: "/prospect",
      secondaryCta: "Run a prospect check",
    };
  }

  if (args.channel === "upwork") {
    return {
      title: "Open Upwork queue",
      detail: "Start from fit-ranked jobs and proposals so your first work cycle is direct.",
      href: "/upwork",
      cta: "Review job queue",
      secondaryHref: "/prospect",
      secondaryCta: "Run a prospect check",
    };
  }

  return {
    title: "Check your first prospect",
    detail: "Paste a target profile or company URL and let Relay assemble the first actionable route.",
    href: "/prospect",
    cta: "Start prospect check",
    secondaryHref: "/dashboard",
    secondaryCta: "Open dashboard",
  };
}

type ChoiceOption<T extends string | number> = {
  value: T;
  title: string;
  detail: string;
};

function ChoiceGrid<T extends string | number>({
  label,
  value,
  onChange,
  options,
  columns = 2,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: Array<ChoiceOption<T>>;
  columns?: 1 | 2;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = options.findIndex((option) => String(option.value) === String(value));

  function onArrow(index: number, key: string) {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(key)) return;

    const width = columns === 2 ? 2 : 1;
    const offsetByKey: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowUp: -width,
      ArrowDown: width,
    };

    let nextIndex = index + (offsetByKey[key] ?? 0);
    if (nextIndex >= options.length) nextIndex = options.length - 1;
    if (nextIndex < 0) nextIndex = 0;

    const nextOption = options[nextIndex];
    if (!nextOption) return;

    onChange(nextOption.value);
    refs.current[nextIndex]?.focus();
  }

  return (
    <div className={cn("auth-choice-grid", columns === 2 ? "cols-2" : "")} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = String(option.value) === String(value);
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn("auth-choice", selected ? "is-active" : "")}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault();
              onArrow(index, event.key);
            }}
            tabIndex={selected || activeIndex < 0 ? 0 : -1}
          >
            <p className="auth-choice__title">{option.title}</p>
            <p className="auth-choice__detail">{option.detail}</p>
          </button>
        );
      })}
    </div>
  );
}

export function RelayOnboardingExperience({ bootstrap }: { bootstrap: OnboardingBootstrap }) {
  const initial = useMemo(() => initializeDraft(bootstrap), [bootstrap]);

  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [resumed, setResumed] = useState(initial.resumed);
  const [stepError, setStepError] = useState<string | null>(null);
  const [identities, setIdentities] = useState<IdentitySummary[]>([]);
  const [identityLoading, setIdentityLoading] = useState(bootstrap.role === "admin" || bootstrap.role === "rep" || bootstrap.role === "sourcer");
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityCreating, setIdentityCreating] = useState(false);
  const [identityCreateError, setIdentityCreateError] = useState<string | null>(null);
  const [assemblyStatus, setAssemblyStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [assemblyError, setAssemblyError] = useState<string | null>(null);
  const [assemblyStage, setAssemblyStage] = useState(0);
  const [firstAction, setFirstAction] = useState<FirstAction | null>(null);

  const storageKey = `relay-onboarding:v${STORAGE_VERSION}:${bootstrap.repId}`;
  const stepIndex = STEPS.findIndex((step) => step.id === draft.step);
  const identityCount = Math.max(bootstrap.initialIdentityCount, identities.length);
  const isAdmin = bootstrap.role === "admin";

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify({ version: STORAGE_VERSION, draft }));
  }, [draft, storageKey]);

  useEffect(() => {
    if (assemblyStatus !== "saving") return;
    const timer = window.setInterval(() => {
      setAssemblyStage((stage) => (stage >= ASSEMBLY_STAGES.length - 1 ? stage : stage + 1));
    }, 520);
    return () => window.clearInterval(timer);
  }, [assemblyStatus]);

  useEffect(() => {
    const shouldLoad = bootstrap.role === "admin" || bootstrap.role === "rep" || bootstrap.role === "sourcer";
    if (!shouldLoad) return;

    let alive = true;
    void (async () => {
      try {
        const endpoint = bootstrap.role === "admin" ? "/api/admin/revenue-identities" : "/api/rep/assigned-profiles";
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!alive) return;

        if (!response.ok) {
          setIdentityError(payload?.error ?? "Could not load profile assignments.");
          setIdentityLoading(false);
          return;
        }

        if (bootstrap.role === "admin") {
          const list = Array.isArray(payload?.identities)
            ? payload.identities.map((item: Record<string, unknown>) => ({
                id: String(item.id),
                name: String(item.identity_name ?? item.identityName ?? "Untitled"),
                title: typeof item.title === "string" ? item.title : null,
                status: typeof item.status === "string" ? item.status : null,
              }))
            : [];
          setIdentities(list);
        } else {
          const list = Array.isArray(payload?.profiles)
            ? payload.profiles.map((item: Record<string, unknown>) => {
                const identity = (item.identity as Record<string, unknown>) ?? {};
                return {
                  id: String(identity.id ?? ""),
                  name: String(identity.identityName ?? identity.slug ?? "Assigned profile"),
                  title: typeof identity.title === "string" ? identity.title : null,
                  channel: typeof identity.channel === "string" ? identity.channel : undefined,
                  status: typeof identity.status === "string" ? identity.status : "active",
                };
              })
            : [];
          setIdentities(list.filter((item: IdentitySummary) => Boolean(item.id)));
        }

        setIdentityError(null);
        setIdentityLoading(false);
      } catch {
        if (!alive) return;
        setIdentityError("Could not load profile assignments.");
        setIdentityLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [bootstrap.role]);

  const moveToStep = useCallback((next: StepId) => {
    setDraft((current) => ({ ...current, step: next }));
    setStepError(null);
  }, []);

  function validateStep(step: StepId): string | null {
    if (step === "you" && draft.displayName.trim().length < 2) {
      return "Tell Relay what to call you before continuing.";
    }
    if (step === "work" && draft.workspaceName.trim().length < 2) {
      return "Add a workspace name to continue.";
    }
    if (step === "goal" && !draft.goal) {
      return "Choose a first 14-day goal.";
    }
    return null;
  }

  function goNext() {
    const issue = validateStep(draft.step);
    if (issue) {
      setStepError(issue);
      return;
    }

    if (stepIndex >= STEPS.length - 1) return;
    moveToStep(STEPS[stepIndex + 1]!.id);
  }

  function goBack() {
    if (stepIndex <= 0) return;
    moveToStep(STEPS[stepIndex - 1]!.id);
  }

  async function createIdentity() {
    if (!isAdmin || identityCreating) return;

    const name = draft.identityName.trim();
    if (name.length < 2) {
      setIdentityCreateError("Identity name should be at least 2 characters.");
      return;
    }

    setIdentityCreating(true);
    setIdentityCreateError(null);

    try {
      const slugRoot = createSlug(name);
      const slug = `${slugRoot || "identity"}-${Date.now().toString().slice(-5)}`;

      const response = await fetch("/api/admin/revenue-identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityName: name,
          slug,
          title: draft.identityTitle.trim() || null,
          positioning: draft.identityPositioning.trim() || null,
          expertise: splitCsv(draft.identityPositioning),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setIdentityCreateError(payload?.error ?? "Could not create identity.");
        return;
      }

      const created = payload?.identity as Record<string, unknown> | undefined;
      if (created?.id) {
        setIdentities((current) => [
          {
            id: String(created.id),
            name: String(created.identity_name ?? created.identityName ?? name),
            title: typeof created.title === "string" ? created.title : null,
            status: typeof created.status === "string" ? created.status : "active",
          },
          ...current,
        ]);
      }

      setDraft((current) => ({ ...current, identityName: "", identityTitle: "", identityPositioning: "" }));
      setIdentityError(null);
    } catch {
      setIdentityCreateError("Could not create identity right now.");
    } finally {
      setIdentityCreating(false);
    }
  }

  async function saveOnboarding() {
    setAssemblyStatus("saving");
    setAssemblyError(null);
    setAssemblyStage(0);
    track(AnalyticsEvents.ACTIVATION_STARTED, { role: bootstrap.role, goal: draft.goal });

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz: draftToQuiz(draft),
          samples: draft.samples,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save onboarding.");
      }

      let queueTotal: number | null = null;
      try {
        const queueResponse = await fetch("/api/relay/queue", { cache: "no-store" });
        if (queueResponse.ok) {
          const queuePayload = await queueResponse.json().catch(() => null);
          queueTotal = typeof queuePayload?.summary?.total === "number" ? queuePayload.summary.total : null;
        }
      } catch {
        queueTotal = null;
      }

      const action = buildFirstAction({
        role: bootstrap.role,
        identities: identityCount,
        queueTotal,
        goal: draft.goal,
        channel: draft.channel,
      });

      setFirstAction(action);
      setAssemblyStatus("success");
      track(AnalyticsEvents.ACTIVATION_COMPLETED, {
        role: bootstrap.role,
        goal: draft.goal,
        queue_total: queueTotal ?? 0,
      });

      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKey);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not complete onboarding.";
      setAssemblyError(message);
      setAssemblyStatus("error");
      track(AnalyticsEvents.ONBOARDING_FAILED, {
        role: bootstrap.role,
        error_code: message.slice(0, 80),
      });
    }
  }

  return (
    <RelayAuthShell
      stateLabel="RELAY / ASSEMBLE"
      heading="Relay is about to assemble around your work"
      subheading="This setup is fast and resumable. Every choice below changes what Relay surfaces first."
      contextLabel="Activation path"
      contextPoints={[
        { title: "YOU", detail: "Identity and role tune how Relay addresses and routes work." },
        { title: "WORK", detail: "Context shapes what counts as meaningful signal." },
        { title: "GOAL", detail: "Your first objective controls immediate queue emphasis." },
      ]}
      tone="orange"
    >
      <RelayAuthSurface
        chapter="Onboarding"
        title="Assemble your workspace"
        subtitle="You can stop and return anytime. Relay resumes from your last completed step."
      >
        <div className="auth-progress" style={{ "--signal-color": "var(--orange-signal)" } as CSSProperties}>
          {STEPS.map((step, index) => {
            const active = step.id === draft.step;
            const complete = index < stepIndex;
            const reachable = index <= stepIndex;
            return (
              <button
                key={step.id}
                type="button"
                className={cn("auth-progress__step", active ? "is-active" : complete ? "is-complete" : "", !reachable ? "opacity-60" : "")}
                onClick={() => {
                  if (!reachable) return;
                  moveToStep(step.id);
                }}
                aria-current={active ? "step" : undefined}
                disabled={!reachable}
              >
                {step.label}
              </button>
            );
          })}
        </div>

        {resumed ? (
          <p className="auth-inline-alert is-success" role="status">
            Resume active. You are back at {draft.step.toUpperCase()}.
          </p>
        ) : null}

        {stepError ? (
          <p className="auth-inline-alert" role="alert">
            {stepError}
          </p>
        ) : null}

        {draft.step === "you" ? (
          <div className="auth-step-enter space-y-4">
            <RelayField
              label="Your name"
              htmlFor="onboard-name"
              hint="Relay uses this for sign-offs and context references."
              error={draft.displayName.trim().length > 0 && draft.displayName.trim().length < 2 ? "Use at least 2 characters." : null}
            >
              <input
                id="onboard-name"
                className="auth-input"
                value={draft.displayName}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, displayName: event.target.value }));
                  setStepError(null);
                  setResumed(false);
                }}
                placeholder="How should Relay address you?"
              />
            </RelayField>

            <div className="auth-note-strip">
              Role detected: <strong className="text-[var(--ink)]">{bootstrap.role.toUpperCase()}</strong>. Permissions follow this role automatically.
            </div>
          </div>
        ) : null}

        {draft.step === "work" ? (
          <div className="auth-step-enter space-y-4">
            <RelayField
              label="Workspace"
              htmlFor="onboard-workspace"
              hint="Usually your company or operating brand."
              error={draft.workspaceName.trim().length > 0 && draft.workspaceName.trim().length < 2 ? "Use at least 2 characters." : null}
            >
              <input
                id="onboard-workspace"
                className="auth-input"
                value={draft.workspaceName}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, workspaceName: event.target.value }));
                  setStepError(null);
                  setResumed(false);
                }}
                placeholder="Workspace name"
                autoComplete="organization"
              />
            </RelayField>

            <RelayField label="Website (optional)" htmlFor="onboard-website" hint="Used only for context and targeting cues.">
              <input
                id="onboard-website"
                className="auth-input"
                value={draft.website}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, website: event.target.value }));
                  setResumed(false);
                }}
                placeholder="https://example.com"
              />
            </RelayField>

            <ChoiceGrid
              label="Work model"
              value={draft.workModel}
              onChange={(next) => {
                setDraft((current) => ({ ...current, workModel: next }));
                setStepError(null);
                setResumed(false);
              }}
              options={[
                { value: "agency", title: "Agency", detail: "Multiple client accounts and parallel outreach." },
                { value: "freelance", title: "Freelance", detail: "Personal pipeline and direct prospecting." },
                { value: "inhouse", title: "In-house sales", detail: "Team-led outbound and structured follow-up." },
                { value: "product", title: "Product-led", detail: "Demand capture and qualification for inbound." },
              ]}
            />

            <div className="auth-note-strip">Consequence: {WORK_MODEL_EFFECT[draft.workModel]}</div>
          </div>
        ) : null}

        {draft.step === "goal" ? (
          <div className="auth-step-enter space-y-4">
            <ChoiceGrid
              label="Primary goal"
              value={draft.goal}
              onChange={(next) => {
                setDraft((current) => ({ ...current, goal: next }));
                setStepError(null);
                setResumed(false);
              }}
              options={[
                { value: "pipeline", title: "More qualified pipeline", detail: "Find new, high-fit opportunities." },
                { value: "responses", title: "More replies", detail: "Prioritize live conversations and follow-ups." },
                { value: "authority", title: "Authority building", detail: "Bias first actions to Studio and proof." },
                { value: "focus", title: "Daily focus", detail: "Start every day with one clear next move." },
              ]}
            />

            <ChoiceGrid
              label="Primary channel"
              value={draft.channel}
              onChange={(next) => {
                setDraft((current) => ({ ...current, channel: next }));
                setResumed(false);
              }}
              options={[
                { value: "linkedin", title: "LinkedIn", detail: "Social outbound and DM conversations." },
                { value: "email", title: "Email", detail: "Structured outreach and follow-up pacing." },
                { value: "upwork", title: "Upwork", detail: "Proposal-first lead generation." },
              ]}
              columns={1}
            />

            <div className="auth-note-strip">Consequence: {GOAL_EFFECT[draft.goal]}</div>
          </div>
        ) : null}

        {draft.step === "profiles" ? (
          <div className="auth-step-enter space-y-4">
            {identityLoading ? (
              <div className="auth-note-strip">Loading profile assignments...</div>
            ) : identityError ? (
              <p className="auth-inline-alert" role="alert">
                {identityError}
              </p>
            ) : identities.length === 0 ? (
              <div className="auth-note-strip">
                {isAdmin
                  ? "No revenue identities found yet. You can create one now or continue and set it up as your first action."
                  : "No assigned profiles detected yet. Continue and Relay will route you to profile setup first."}
              </div>
            ) : (
              <div className="grid gap-2">
                {identities.slice(0, 4).map((identity) => (
                  <div key={identity.id} className="auth-note-strip flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[var(--ink)] truncate">{identity.name}</p>
                      <p className="text-xs text-[var(--graphite)] truncate">
                        {identity.title || "No title"}
                      </p>
                    </div>
                    {identity.channel && identity.channel !== 'other' ? (
                      <span className="shrink-0 rounded-sm bg-orange/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-orange">
                        {identity.channel}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {isAdmin ? (
              <div className="space-y-3 border border-[var(--line)] p-3">
                <p className="text-xs uppercase tracking-[0.11em] text-[var(--stone)]">Create identity now (optional)</p>

                <RelayField
                  label="Identity name"
                  htmlFor="onboard-identity-name"
                  hint="Example: Growth Ops at Acme"
                  error={identityCreateError}
                >
                  <input
                    id="onboard-identity-name"
                    className="auth-input"
                    value={draft.identityName}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, identityName: event.target.value }));
                      setIdentityCreateError(null);
                      setResumed(false);
                    }}
                    placeholder="Identity name"
                  />
                </RelayField>

                <RelayField label="Title (optional)" htmlFor="onboard-identity-title">
                  <input
                    id="onboard-identity-title"
                    className="auth-input"
                    value={draft.identityTitle}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, identityTitle: event.target.value }));
                      setResumed(false);
                    }}
                    placeholder="Founder, SDR, etc."
                  />
                </RelayField>

                <RelayField label="Positioning keywords (optional)" htmlFor="onboard-identity-positioning" hint="Comma separated: outbound, SaaS, AI, etc.">
                  <input
                    id="onboard-identity-positioning"
                    className="auth-input"
                    value={draft.identityPositioning}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, identityPositioning: event.target.value }));
                      setResumed(false);
                    }}
                    placeholder="B2B, growth, outbound"
                  />
                </RelayField>

                <button type="button" className="relay-cta-quiet w-full" onClick={createIdentity} disabled={identityCreating}>
                  {identityCreating ? "Creating identity..." : "Create identity"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.step === "voice" ? (
          <div className="auth-step-enter space-y-4">
            <ChoiceGrid
              label="Formality"
              value={draft.formality}
              onChange={(next) => {
                setDraft((current) => ({ ...current, formality: next }));
                setResumed(false);
              }}
              options={[
                { value: 1, title: "Very casual", detail: "Text-like and informal." },
                { value: 2, title: "Casual", detail: "Warm but still business-aware." },
                { value: 3, title: "Balanced", detail: "Neutral professional." },
                { value: 4, title: "Formal", detail: "Polished and structured." },
                { value: 5, title: "Very formal", detail: "Strict business register." },
              ]}
            />

            <ChoiceGrid
              label="Sentence rhythm"
              value={draft.sentenceLength}
              onChange={(next) => {
                setDraft((current) => ({ ...current, sentenceLength: next }));
                setResumed(false);
              }}
              options={[
                { value: "short", title: "Short", detail: "Direct and clipped." },
                { value: "medium", title: "Medium", detail: "One idea per line." },
                { value: "long", title: "Long", detail: "Argument-led and flowing." },
              ]}
              columns={1}
            />

            <RelayField label="Greeting" htmlFor="onboard-greeting" hint="Example: Hi Sarah">
              <input
                id="onboard-greeting"
                className="auth-input"
                value={draft.greeting}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, greeting: event.target.value }));
                  setResumed(false);
                }}
              />
            </RelayField>

            <RelayField label="Sign-off" htmlFor="onboard-signoff" hint="Example: Best, Ali">
              <input
                id="onboard-signoff"
                className="auth-input"
                value={draft.signOff}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, signOff: event.target.value }));
                  setResumed(false);
                }}
              />
            </RelayField>

            <RelayField label="Preferred words (optional)" htmlFor="onboard-preferred" hint="Comma separated">
              <input
                id="onboard-preferred"
                className="auth-input"
                value={draft.preferredWords}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, preferredWords: event.target.value }));
                  setResumed(false);
                }}
              />
            </RelayField>

            <RelayField label="Never use words (optional)" htmlFor="onboard-never" hint="Comma separated">
              <input
                id="onboard-never"
                className="auth-input"
                value={draft.neverWords}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, neverWords: event.target.value }));
                  setResumed(false);
                }}
              />
            </RelayField>

            <RelayField label="Real sample lines (optional)" htmlFor="onboard-samples" hint="Paste a few lines from your real outreach.">
              <textarea
                id="onboard-samples"
                className="auth-textarea"
                value={draft.samples}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, samples: event.target.value }));
                  setResumed(false);
                }}
                rows={5}
                placeholder="Paste 2-5 short examples here..."
              />
            </RelayField>
          </div>
        ) : null}

        {draft.step === "ready" ? (
          <div className="auth-step-enter space-y-4">
            <div className="auth-note-strip">
              <p className="text-[var(--ink)]">Ready to assemble</p>
              <p className="mt-1 text-xs text-[var(--graphite)]">
                {draft.displayName} - {bootstrap.role.toUpperCase()} - {draft.workspaceName}
              </p>
            </div>

            <div className="auth-note-strip">
              Goal route: {draft.goal.toUpperCase()} via {draft.channel.toUpperCase()}.
            </div>

            <div className="auth-note-strip">
              Profiles available now: {identityCount}. {identityCount === 0 ? "Relay will route your first action to profile setup." : "Relay can route identity-safe actions immediately."}
            </div>

            {assemblyStatus === "saving" ? (
              <div className="space-y-3">
                <p className="auth-inline-alert is-success" role="status">
                  {ASSEMBLY_STAGES[assemblyStage]}
                </p>
                <div className="auth-note-strip">Please keep this tab open for a moment.</div>
              </div>
            ) : null}

            {assemblyStatus === "error" && assemblyError ? (
              <p className="auth-inline-alert" role="alert">
                {assemblyError}
              </p>
            ) : null}

            {assemblyStatus !== "success" ? (
              <button
                type="button"
                onClick={saveOnboarding}
                className="relay-cta auth-submit justify-between"
                disabled={assemblyStatus === "saving"}
              >
                <span className="relay-cta-pulse" aria-hidden="true" />
                <span>{assemblyStatus === "saving" ? "Assembling Relay" : "Assemble Relay now"}</span>
                <span className="relay-cta-arrow" aria-hidden="true">
                  -&gt;
                </span>
              </button>
            ) : null}

            {assemblyStatus === "success" && firstAction ? (
              <div className="space-y-3 border border-[color-mix(in_srgb,var(--status-success)_42%,var(--line))] bg-[color-mix(in_srgb,var(--status-success)_6%,var(--bone-raised))] p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--status-success)]">First action ready</p>
                <h3 className="text-base text-[var(--ink)]">{firstAction.title}</h3>
                <p className="text-sm text-[var(--graphite)]">{firstAction.detail}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link href={firstAction.href} className="relay-cta auth-submit justify-between">
                    <span className="relay-cta-pulse" aria-hidden="true" />
                    <span>{firstAction.cta}</span>
                    <span className="relay-cta-arrow" aria-hidden="true">
                      -&gt;
                    </span>
                  </Link>
                  <Link href={firstAction.secondaryHref} className="relay-cta-quiet w-full justify-center">
                    {firstAction.secondaryCta}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.step !== "ready" ? (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
            <button type="button" className="relay-cta-quiet" onClick={goBack} disabled={stepIndex === 0}>
              Back
            </button>
            <button type="button" className="relay-cta auth-submit justify-between" onClick={goNext}>
              <span className="relay-cta-pulse" aria-hidden="true" />
              <span>Continue</span>
              <span className="relay-cta-arrow" aria-hidden="true">
                -&gt;
              </span>
            </button>
          </div>
        ) : null}
      </RelayAuthSurface>

      <div className="mt-3 text-center text-xs text-[var(--stone)]">
        Need to pause? Your progress is saved for this account on this browser.
      </div>
    </RelayAuthShell>
  );
}
