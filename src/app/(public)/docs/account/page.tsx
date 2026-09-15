import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Account & Security | ${siteConfig.name}`,
  description:
    "Managing your Relay account: voice calibration, password, data access, and deletion.",
  alternates: { canonical: canonicalUrl("/docs/account") },
  robots: { index: true, follow: true },
};

export default function AccountPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Account &amp; Security</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Managing your Relay account and understanding how your data is protected.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Account settings</h2>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Voice calibration</strong> — recalibrate any time from your profile settings</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Password</strong> — change from account settings; reset via the forgot-password flow</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span><strong className="text-ink">Email verification</strong> — required before first sign-in</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Data access</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          You can request a copy of your data or deletion of your account at any time.
          Contact your organization&apos;s admin for team-level data, or reach out to us
          directly for individual requests.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Deleting your account</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Account deletion removes your personal data and dissociates you from the
          organization. Organization-level data (leads, facts, proof) is owned by the
          organization, not the individual, and is only deleted when the organization is
          deleted.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Security measures</h2>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Multi-tenant data isolation at the database level (Row Level Security)</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Role-based access control (admin vs. rep)</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Email verification required before sign-in</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Encrypted connections (TLS) for all data in transit</span>
          </li>
        </ul>
        <p className="text-[14px] leading-relaxed text-graphite">
          For the full technical breakdown, see the{" "}
          <Link href="/trust" className="font-medium text-orange hover:underline">
            Trust Center
          </Link>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/security" className="text-orange hover:underline">
              Security
            </Link>
            {" "}— our security posture and practices.
          </li>
          <li>
            <Link href="/docs/faq" className="text-orange hover:underline">
              FAQ
            </Link>
            {" "}— common questions.
          </li>
        </ul>
      </section>
    </div>
  );
}
