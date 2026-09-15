import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Revenue Identities | ${siteConfig.name}`,
  description:
    "Understand how Relay builds voice profiles and content identities for each rep.",
  alternates: { canonical: canonicalUrl("/docs/identities") },
  robots: { index: true, follow: true },
};

export default function IdentitiesPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-display text-3xl text-ink sm:text-4xl">Revenue Identities</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-graphite">
          Relay builds two kinds of identity for each rep: a <strong className="text-ink">voice profile</strong> for
          outreach and a <strong className="text-ink">content identity</strong> for Studio. Both are
          learned from real input — never invented.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Voice profile (outreach)</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Your voice profile is a style card that captures how you write. It&apos;s built
          during onboarding calibration and used every time Relay drafts a message for
          you.
        </p>
        <ul className="space-y-3 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">Quiz</strong> — short questions about your tone,
              sentence structure, and common phrases.
            </div>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">Pasted samples</strong> — real messages you&apos;ve
              written. This produces the strongest calibration.
            </div>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
            <div>
              <strong className="text-ink">Combined</strong> — quiz plus samples together for
              the most accurate voice.
            </div>
          </li>
        </ul>
        <p className="text-[14px] leading-relaxed text-graphite">
          You can recalibrate any time from your profile settings. Every rep has their
          own voice profile — drafts sound like the assigned rep, not a generic bot.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">Content identity (Studio)</h2>
        <p className="text-[14px] leading-relaxed text-graphite">
          Studio builds a richer identity for content creation. It captures what you
          can credibly say across multiple dimensions:
        </p>
        <div className="flex flex-wrap gap-2">
          {["Expertise", "Experience", "Projects", "Audience", "Goals", "Territories", "Opinions", "Voice", "Journey"].map((dim) => (
            <span key={dim} className="rounded-full border border-cobalt/20 bg-cobalt/5 px-3 py-1 text-[13px] font-medium text-cobalt">
              {dim}
            </span>
          ))}
        </div>
        <p className="text-[14px] leading-relaxed text-graphite">
          Your content identity is built from your real proof — the projects, reviews,
          and facts you&apos;ve added to Relay. Studio uses it to suggest topics you can
          write about with authority, not generic content ideas.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading text-xl text-ink">How identities are used</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Outreach drafts</p>
            <p className="mt-1 text-[13px] text-graphite">
              Written in the rep&apos;s voice, grounded in matched proof, checked against
              quality gates before you see them.
            </p>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-[13px] font-medium text-ink">Studio posts</p>
            <p className="mt-1 text-[13px] text-graphite">
              Suggested from your identity, drafted from real answers, accepted or
              rejected by you.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-bone-raised p-6">
        <h2 className="text-heading text-lg text-ink">What identities are not</h2>
        <ul className="mt-3 space-y-2 text-[14px] text-graphite">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>They don&apos;t predict virality or guarantee engagement.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>They don&apos;t invent facts, clients, or numbers.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-stone" />
            <span>They don&apos;t post or send anything automatically.</span>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-xl text-ink">Related</h2>
        <ul className="space-y-2 text-[14px]">
          <li>
            <Link href="/docs/bd-workflow" className="text-orange hover:underline">
              BD Daily Workflow
            </Link>
            {" "}— how voice profiles are used in daily outreach.
          </li>
          <li>
            <Link href="/docs/studio" className="text-orange hover:underline">
              Studio
            </Link>
            {" "}— how content identities drive post suggestions.
          </li>
        </ul>
      </section>
    </div>
  );
}
