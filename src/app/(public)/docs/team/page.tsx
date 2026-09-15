import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Inviting & Assigning BDs | ${siteConfig.name}`,
  description:
    "How admins invite reps and sourcers, assign leads, and manage team access in Relay.",
  alternates: { canonical: canonicalUrl("/docs/team") },
  robots: { index: true, follow: true },
};

export default function TeamPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Inviting &amp; Assigning BDs</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay supports two roles: <strong className="text-ink">admin</strong> and{" "}
          <strong className="text-ink">rep</strong> (which includes sourcers). Admins
          manage the organization; reps work the pipeline.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Roles</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Admin</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-graphite">
              <li>Invite and remove team members</li>
              <li>Edit the scoring rubric</li>
              <li>Manage facts, profiles, and proof</li>
              <li>View all team analytics</li>
              <li>Configure daily limits</li>
            </ul>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Rep / Sourcer</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-graphite">
              <li>Work their assigned queue</li>
              <li>Check prospects and draft outreach</li>
              <li>Log outcomes and replies</li>
              <li>Use Studio for content</li>
              <li>Read shared facts and proof</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Inviting a team member</h2>
        <ol className="space-y-3 text-[14px] text-graphite">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              1
            </span>
            <span>Go to the Team page and enter the person&apos;s email address.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              2
            </span>
            <span>They receive an invitation email and create their account.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              3
            </span>
            <span>On first sign-in, they complete voice calibration.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[12px] font-semibold text-orange">
              4
            </span>
            <span>They appear in your team roster and can start working.</span>
          </li>
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Assigning leads</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Leads can be assigned to a specific rep or left unassigned in the shared
          queue. Reps see their own assigned leads plus any unassigned ones. Admins
          can reassign leads at any time.
        </p>
        <p className="text-[14px] leading-relaxed text-graphite">
          When a lead is assigned, drafts are written in that rep&apos;s calibrated voice
          and matched to their most relevant proof.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Removing a team member</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Admins can remove a rep from the organization. Their leads return to the
          shared queue for reassignment. Their voice profile and content identity
          remain in the system for historical reference but can be deleted by an admin.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-bone-raised p-6">
        <h2 className="text-heading text-lg text-ink">Access boundaries</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-graphite">
          Reps can only see data within their own organization. They cannot see other
          organizations&apos; data, and they cannot see another rep&apos;s private content
          personas or drafts. Admins can see everything within their organization.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-graphite">
          See the{" "}
          <Link href="/trust" className="font-medium text-orange hover:underline">
            Trust Center
          </Link>{" "}
          for the technical details on how this isolation is enforced.
        </p>
      </section>
    </div>
  );
}
