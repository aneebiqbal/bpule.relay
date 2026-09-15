import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Leads | ${siteConfig.name}`,
  description:
    "How leads are created, imported, scored, and managed in Relay's pipeline.",
  alternates: { canonical: canonicalUrl("/docs/leads") },
  robots: { index: true, follow: true },
};

export default function LeadsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Leads</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          A lead is a prospect your team might reach out to. Relay helps you create,
          score, and track leads through every stage of the pipeline.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Creating leads</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          There are three ways to create a lead:
        </p>
        <ul className="space-y-3 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">Paste research</strong> — paste a LinkedIn profile,
              forum post, or job listing. Relay extracts structured fields automatically.
            </div>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">From Upwork</strong> — browse and import jobs
              directly from Upwork job feeds.
            </div>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">CSV import</strong> — bulk import leads from a
              spreadsheet.
            </div>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Lead fields</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Each lead captures:
        </p>
        <ul className="space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Company name, contact name, title, URL</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Signal type and evidence</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Verbatim quote from the prospect</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <span>Score and verdict (from Prospect Check)</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Statuses</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Leads move through statuses as you work them:
        </p>
        <div className="flex flex-wrap gap-2">
          {["new", "contacted", "followed_up", "replied", "no", "dead"].map((s) => (
            <span key={s} className="rounded-full border border-line bg-bone-raised px-3 py-1 text-[13px] font-medium text-ink">
              {s.replace("_", " ")}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Deduplication</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Relay prevents duplicate companies. A company that&apos;s already in the pipeline
          (and not marked dead) can&apos;t be added again. This is enforced at the database
          level with a unique index.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Visibility</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Leads are visible to everyone in your organization. This is deliberate — your
          team shares one pipeline. Content personas and drafts, by contrast, are private
          to each rep (or visible to admins).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/prospect-check" className="text-orange hover:underline">
              Prospect Check
            </Link>
            {" "}— how leads are scored.
          </li>
          <li>
            <Link href="/docs/outreach" className="text-orange hover:underline">
              Outreach
            </Link>
            {" "}— drafting and sending messages for a lead.
          </li>
        </ul>
      </section>
    </div>
  );
}
