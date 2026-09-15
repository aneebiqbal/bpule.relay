import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Trust Center | ${siteConfig.name}`,
  description:
    "How Relay protects your data: tenant isolation, access controls, encryption, AI data flows, analytics privacy, and subprocessors.",
  alternates: { canonical: canonicalUrl("/trust") },
  robots: { index: true, follow: true },
};

export default function TrustCenterPage() {
  return (
    <div className="mx-auto max-w-3xl section-padding py-20 lg:py-28">
      <div className="space-y-4">
        <span className="text-label text-orange">TRUST CENTER</span>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">
          Your data, your control.
        </h1>
        <p className="text-[16px] leading-relaxed text-graphite">
          Relay was built to be adoptable by teams that take data governance seriously.
          Below is an honest accounting of how your data is protected, who can access
          it, and what we send to AI providers. Every claim here is verifiable in the
          codebase.
        </p>
      </div>

      <div className="mt-12 space-y-10">
        {/* ── WHO OWNS MY DATA ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Who owns my data?</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            You do. Your organization owns all data you enter into Relay: leads, messages,
            facts, proof, voice profiles, and content. Relay does not sell your data. We
            do not use it for advertising. We process it only to provide the service.
          </p>
          <p className="text-[14px] leading-relaxed text-graphite">
            Organization-level data (leads, facts, proof) is owned by the organization.
            Individual reps&apos; voice profiles and content personas belong to those reps
            but are accessible to the organization&apos;s admin.
          </p>
        </section>

        {/* ── WHO INSIDE MY ORG CAN ACCESS IT ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">
            Who inside my organization can access it?
          </h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay has two roles with different access levels:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">Admin</strong> — can see all data within the
                organization: all reps&apos; leads, messages, outcomes, facts, proof, and
                content. Can invite and remove team members and edit the scoring rubric.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">Rep / Sourcer</strong> — can see shared leads,
                messages, outcomes, facts, and proof. Cannot see another rep&apos;s private
                content personas or drafts. Cannot edit the rubric or manage the team.
              </span>
            </li>
          </ul>
          <p className="text-[14px] leading-relaxed text-graphite">
            These boundaries are enforced by Row Level Security policies in the database,
            not just by application code.
          </p>
        </section>

        {/* ── CAN OTHER ORGS ACCESS IT ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">
            Can other organizations access it?
          </h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            No. Every tenant-scoped table carries an{" "}
            <code className="rounded bg-bone-raised px-1.5 py-0.5 text-[13px]">organization_id</code>{" "}
            column, and Row Level Security policies on every table restrict every read and
            write to{" "}
            <code className="rounded bg-bone-raised px-1.5 py-0.5 text-[13px]">
              organization_id = current_org_id()
            </code>.
            Rows from another organization always return zero, by construction. A bug in a
            route handler cannot leak another tenant&apos;s data.
          </p>
          <p className="text-[14px] leading-relaxed text-graphite">
            Isolation is tested by an adversarial RLS test suite that creates separate
            organizations and asserts zero cross-visibility across all tenant-scoped tables.
          </p>
        </section>

        {/* ── WHAT DOES RELAY SEND TO AI PROVIDERS ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">
            What does Relay send to AI providers?
          </h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            When you ask Relay to extract, classify, draft, or generate content, the
            following is sent to the configured AI providers:
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
            session tokens, or analytics IDs to AI providers. Drafting uses a tiered model
            chain: extraction runs on the cheapest tier (Groq free by default), drafting on
            a primary writer model, with escalation to stronger models only when cheaper
            tiers fail quality gates.
          </p>
        </section>

        {/* ── IS MY DATA USED FOR MODEL TRAINING ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">
            Is my data used for model training?
          </h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay itself does not train models. Whether the AI providers we route to use
            your data for training depends on their individual terms:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">Groq</strong> — free tier; check Groq&apos;s current
                data usage policy for training provisions.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">OpenAI</strong> — used for escalation only. OpenAI
                does not use API data for training by default; verify their current policy.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">LongCat</strong> — primary writer; check LongCat&apos;s
                data usage policy.
              </span>
            </li>
          </ul>
          <div className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
            <p className="text-[13px] text-graphite">
              <strong className="text-ink">Requires founder/lawyer confirmation:</strong>{" "}
              Relay does not itself train models. The training behavior of third-party AI
              providers is governed by their terms. We recommend reviewing each
              provider&apos;s data usage policy and configuring API data processing options
              (e.g., OpenAI&apos;s data residency and training opt-out) according to your
              organization&apos;s compliance requirements.
            </p>
          </div>
        </section>

        {/* ── HOW IS DATA PROTECTED ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">How is data protected?</h2>
          <ul className="space-y-3 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <div>
                <strong className="text-ink">Encryption in transit.</strong> All connections
                to Relay and to Supabase use TLS encryption. This is enforced by Vercel and
                Supabase infrastructure.
              </div>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <div>
                <strong className="text-ink">Encryption at rest.</strong> Supabase provides
                encryption at rest for database storage. We rely on Supabase&apos;s
                infrastructure for this; we do not implement our own encryption layer.
              </div>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <div>
                <strong className="text-ink">Tenant isolation.</strong> Row Level Security on
                every tenant-scoped table, plus storage bucket policies scoped to each rep
                and admin.
              </div>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <div>
                <strong className="text-ink">Secrets handling.</strong> API keys are stored as
                environment variables, never in the database or exposed to the browser. The
                service role key (which bypasses RLS) is used by: cron-triggered routes (protected by <code className="rounded bg-bone-raised px-1 text-[12px]">CRON_SECRET</code>), the public signup endpoint (to create organizations before any admin exists), and offline scripts. It is never used for authenticated user data access.
              </div>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <div>
                <strong className="text-ink">Email verification.</strong> New accounts require
                email confirmation before sign-in, preventing anyone from registering with an
                email they don&apos;t own.
              </div>
            </li>
          </ul>
        </section>

        {/* ── WHAT HAPPENS WHEN I DELETE MY ACCOUNT ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">
            What happens when I delete my account?
          </h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Account deletion removes your personal data (auth user, voice profile, content
            personas, and drafts) and dissociates you from the organization. Organization-level
            data (leads, messages, facts, proof) is owned by the organization and is only
            deleted when the organization itself is deleted by its admin.
          </p>
        </section>

        {/* ── SUBPROCESSORS ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">
            Which subprocessors and services are involved?
          </h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay runs on the following infrastructure and services:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-graphite">
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">Purpose</th>
                  <th className="pb-2 font-medium">Data involved</th>
                </tr>
              </thead>
              <tbody className="text-graphite">
                <tr className="border-b border-line">
                  <td className="py-2 font-medium text-ink">Vercel</td>
                  <td className="py-2">Application hosting, CDN</td>
                  <td className="py-2">All app traffic (TLS-encrypted)</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 font-medium text-ink">Supabase</td>
                  <td className="py-2">PostgreSQL database, auth, storage</td>
                  <td className="py-2">All application data</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 font-medium text-ink">Groq</td>
                  <td className="py-2">AI extraction and classification</td>
                  <td className="py-2">Pasted research, structured fields</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 font-medium text-ink">LongCat</td>
                  <td className="py-2">Primary AI writer for drafts and posts</td>
                  <td className="py-2">Pasted research, facts, proof, style cards</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 font-medium text-ink">OpenAI</td>
                  <td className="py-2">AI escalation (when cheaper tiers fail)</td>
                  <td className="py-2">Pasted research, facts, proof, style cards</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2 font-medium text-ink">PostHog</td>
                  <td className="py-2">Product analytics</td>
                  <td className="py-2">Explicit events only; no message bodies or drafts</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[14px] leading-relaxed text-graphite">
            DeepSeek is disabled by default and no production workflow depends on it.
          </p>
        </section>

        {/* ── ANALYTICS PRIVACY ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Analytics privacy</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay uses PostHog with these privacy settings:
          </p>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Identified-only mode — no anonymous profiles created</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Autocapture disabled — only explicit events are tracked</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Session recording disabled</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Do Not Track is respected</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>No passwords, tokens, message bodies, or draft content ever sent</span>
            </li>
          </ul>
        </section>

        {/* ── BACKUPS ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Backups</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Supabase provides daily automated backups. Before risky migrations, we recommend
            a manual <code className="rounded bg-bone-raised px-1.5 py-0.5 text-[13px]">pg_dump</code>.
            Restoration procedures are documented in the project&apos;s operations guide.
          </p>
        </section>

        {/* ── LOGGING ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Logging</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Vercel automatically logs application errors and function invocations. Errors
            can be routed to a webhook via the{" "}
            <code className="rounded bg-bone-raised px-1.5 py-0.5 text-[13px]">ERROR_WEBHOOK_URL</code>{" "}
            environment variable. Logs do not include message bodies or draft content.
          </p>
        </section>

        {/* ── INCIDENT CONTACT ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Incident and contact process</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            If you discover a security issue or have a data concern, contact us at{" "}
            <Link href="mailto:security@relay.bpulse.dev" className="font-medium text-orange hover:underline">
              security@relay.bpulse.dev
            </Link>.
            We will acknowledge receipt and investigate promptly.
          </p>
          <div className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
            <p className="text-[13px] text-graphite">
              <strong className="text-ink">Requires founder/lawyer confirmation:</strong>{" "}
              Relay does not currently hold SOC 2, ISO 27001, or similar certifications. We
              rely on Supabase and Vercel for infrastructure security. We do not claim
              &ldquo;zero knowledge&rdquo; architecture. The descriptions above reflect the
              actual, implemented controls as of this writing.
            </p>
          </div>
        </section>

        {/* ── WHAT WE DO NOT CLAIM ── */}
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">What we do not claim</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            We do not claim SOC 2, GDPR, ISO 27001, or HIPAA compliance. We do not claim
            &ldquo;zero knowledge&rdquo; encryption. We do not claim third-party security
            audits or penetration tests unless they have actually been performed. Our
            security posture is the sum of the controls described above, running on Vercel
            and Supabase infrastructure.
          </p>
        </section>
      </div>

      <div className="mt-14 space-y-3 border-t border-line pt-8">
        <h2 className="text-heading text-lg text-ink">Related documents</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/privacy" className="text-orange hover:underline">
              Privacy Policy
            </Link>
            {" "}— how we collect, use, and protect your data.
          </li>
          <li>
            <Link href="/terms" className="text-orange hover:underline">
              Terms of Service
            </Link>
            {" "}— the agreement for using Relay.
          </li>
          <li>
            <Link href="/acceptable-use" className="text-orange hover:underline">
              Acceptable Use Policy
            </Link>
            {" "}— what you can and cannot do with Relay.
          </li>
          <li>
            <Link href="/ai-policy" className="text-orange hover:underline">
              AI Policy
            </Link>
            {" "}— how Relay uses AI and what that means for your data.
          </li>
          <li>
            <Link href="/security" className="text-orange hover:underline">
              Security
            </Link>
            {" "}— our security practices and posture.
          </li>
        </ul>
      </div>
    </div>
  );
}
