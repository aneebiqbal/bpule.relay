import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Security | ${siteConfig.name}`,
  description:
    "Relay's security posture: tenant isolation, access controls, encryption, secrets handling, and incident contact.",
  alternates: { canonical: "/security" },
  robots: { index: true, follow: true },
};

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl section-padding py-20 lg:py-28">
      <h1 className="text-display text-3xl text-ink">Security</h1>
      <p className="mt-4 text-[14px] text-graphite">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </p>

      <div className="mt-12 space-y-8">
        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Infrastructure</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay runs on Vercel (application hosting) and Supabase (PostgreSQL database,
            authentication, and storage). We rely on their infrastructure security programs
            rather than implementing our own data center controls.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Encryption</h2>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">In transit:</strong> All connections use TLS.
                Enforced by Vercel and Supabase.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>
                <strong className="text-ink">At rest:</strong> Supabase provides encryption
                at rest for database and storage. We do not implement our own encryption layer.
              </span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Tenant isolation</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Every tenant-scoped table carries an{" "}
            <code className="rounded bg-bone-raised px-1.5 py-0.5 text-[13px]">organization_id</code>{" "}
            column. Row Level Security policies on every table restrict every read and write
            to the signed-in rep&apos;s organization. Rows from another organization always
            return zero, by construction.
          </p>
          <p className="text-[14px] leading-relaxed text-graphite">
            Three database functions use elevated privileges (<code className="rounded bg-bone-raised px-1.5 py-0.5 text-[13px]">SECURITY DEFINER</code>) for
            full-text search, semantic proof matching, and few-shot pool refresh. Each filters
            by the authenticated user&apos;s organization internally — verified by an adversarial
            RPC isolation test that creates two organizations and confirms zero cross-org leaks.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Access control</h2>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Two roles: admin and rep. Admins manage the organization; reps work the pipeline.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Email verification required before first sign-in.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>Storage bucket policies scoped to each rep&apos;s folder, with admin access for management.</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Secrets handling</h2>
          <ul className="space-y-2 text-[14px] text-graphite">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>API keys are stored as environment variables, never in the database or exposed to the browser.</span>
            </li>
             <li className="flex gap-2">
               <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
               <span>The service role key (which bypasses RLS) is used by: cron-triggered routes (protected by CRON_SECRET), the public signup endpoint (to create orgs before any admin exists), and offline scripts. Never used for authenticated user data access.</span>
             </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
              <span>No secrets are logged or included in error reports.</span>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Backups</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Supabase provides daily automated backups. Manual backups before risky
            migrations are documented in the project&apos;s operations guide. Restoration
            procedures are tested and documented.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">What we do not claim</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            Relay does not currently hold SOC 2, ISO 27001, or similar certifications. We do
            not claim &ldquo;zero knowledge&rdquo; architecture. We have not undergone independent
            third-party security audits or penetration testing unless explicitly stated. Our
            security posture is the sum of the controls described on this page, running on
            Vercel and Supabase infrastructure.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Reporting a vulnerability</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            If you discover a security vulnerability in Relay, please report it to{" "}
            <Link href="mailto:security@relay.bpulse.dev" className="font-medium text-orange hover:underline">
              security@relay.bpulse.dev
            </Link>.
            We ask that you do not publicly disclose the issue until we have had a chance to
            investigate and address it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-heading text-xl text-ink">Trust Center</h2>
          <p className="text-[14px] leading-relaxed text-graphite">
            For a complete breakdown of data protection, AI data flows, subprocessors, and
            analytics privacy, see the{" "}
            <Link href="/trust" className="font-medium text-orange hover:underline">
              Trust Center
            </Link>.
          </p>
        </section>

        <section className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
          <p className="text-[13px] text-graphite">
            <strong className="text-ink">Requires founder/lawyer confirmation:</strong>{" "}
            This page describes the security controls actually implemented in Relay as of this
            writing. It is not a certification or legal guarantee. We recommend periodic
            review by qualified security and legal professionals.
          </p>
        </section>
      </div>
    </div>
  );
}
