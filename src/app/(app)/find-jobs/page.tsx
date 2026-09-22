import { JobsSearchExperience } from '@/components/jobs/jobs-search-client'

export const dynamic = 'force-dynamic'

export default function FindJobsPage() {
  return (
    <div className="space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="space-y-2">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Opportunity / Find Jobs</p>
          <h1 className="text-[30px] font-medium leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
            Every network, one ranked list.
          </h1>
          <p className="max-w-2xl text-[13px] text-[color:var(--console-mute)]">
            Upload your CV to search eight job sources — Himalayas, RemoteOK, Jobicy, Remotive, Arbeitnow, Adzuna, The Muse
            and USAJOBS. Relay parses your profile, fans out your top roles as search queries, dedupes syndicated listings,
            filters to your preferences, and scores every role against your CV and how recently it was posted.
          </p>
        </div>
      </section>

      <JobsSearchExperience />
    </div>
  )
}